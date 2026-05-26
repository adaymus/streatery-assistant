/**
 * Pre-screener orchestrator.
 *
 * Takes an address, runs the geocoding pipeline, then fans out all curbside-
 * data fetchers in parallel. Returns one bundled object the UI (or a CLI
 * caller) can render however it wants.
 *
 * Does NOT yet compute the buildable envelope or final eligibility verdict
 * — that's the eligibility engine, which we haven't built. But we DO surface
 * the cheap "early-out" disqualifiers (speed, functional class, bus lane)
 * since they're knowable from the geocoding result alone.
 */

import { geocodeAddress, type GeocodedAddress } from "./geocode.js";
import { fetchLoadingZonesNear } from "./loadingZones.js";
import { fetchMetersOnBlockface } from "./parkingMeters.js";
import { fetchHydrantsOnBlockface } from "./fireHydrants.js";
import { fetchBicycleLanesOnBlock } from "./bicycleLanes.js";
import { fetchBusStopsOnBlock } from "./busStops.js";
import { fetchStreetTreesNear } from "./streetTrees.js";
import { fetchAdaCurbRampsNear } from "./adaCurbRamps.js";
import { fetchDrivewaysNear } from "./driveways.js";
import { fetchCrosswalksNear } from "./crosswalks.js";
import { computeEligibility, type EligibilityResult } from "./envelope.js";
import type { CurbFeature } from "./curbFeatures.js";

export interface CurbFeaturesBundle {
  loadingZones: CurbFeature[];
  parkingMeters: CurbFeature[];
  fireHydrants: CurbFeature[];
  bicycleLanes: CurbFeature[];
  busStops: CurbFeature[];
  streetTrees: CurbFeature[];
  adaCurbRamps: CurbFeature[];
  driveways: CurbFeature[];
  crosswalks: CurbFeature[];
}

export interface EarlyDisqualifier {
  rule: string;
  detail: string;
}

export interface PrescreenResult {
  geocoded: GeocodedAddress;
  curbFeatures: CurbFeaturesBundle;
  // Disqualifiers we can determine WITHOUT the full envelope computation.
  // Empty array means no early-out disqualifiers — proceed to envelope sizing.
  earlyDisqualifiers: EarlyDisqualifier[];
  // The envelope/eligibility result, computed by the geometry engine
  // from the geocoded address + curb features. Null only when an early
  // disqualifier short-circuits the computation.
  eligibility: EligibilityResult | null;
  // Site walk caveats that always apply, even when nothing in the data
  // surfaces a problem. The spec is explicit that these must always appear.
  siteWalkCaveats: string[];
  fetchedAt: string; // ISO timestamp
}

/**
 * Run the full pre-screen for an address.
 *
 * All curb-feature fetchers run in parallel after geocoding completes.
 * Total wall-clock time is dominated by the slowest fetcher, not the sum.
 */
export async function prescreenAddress(
  rawAddress: string,
): Promise<PrescreenResult> {
  const geocoded = await geocodeAddress(rawAddress);

  // Fan out all 9 fetchers concurrently. Promise.all resolves when every
  // promise resolves — or rejects on the first failure. For v1 a single
  // fetcher failure aborts the whole prescreen; we can switch to
  // Promise.allSettled later if partial results turn out to be useful.
  const [
    loadingZones,
    parkingMeters,
    fireHydrants,
    bicycleLanes,
    busStops,
    streetTrees,
    adaCurbRamps,
    driveways,
    crosswalks,
  ] = await Promise.all([
    fetchLoadingZonesNear(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchMetersOnBlockface(
      geocoded.addressPoint.routeId,
      geocoded.side,
      geocoded.block.fromMeasure,
      geocoded.block.toMeasure,
    ),
    fetchHydrantsOnBlockface(geocoded.blockface.blockfaceKey),
    fetchBicycleLanesOnBlock(geocoded.addressPoint.blockKey),
    fetchBusStopsOnBlock(geocoded.addressPoint.blockKey),
    fetchStreetTreesNear(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchAdaCurbRampsNear(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchDrivewaysNear(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchCrosswalksNear(geocoded.mar.latitude, geocoded.mar.longitude),
  ]);

  const curbFeatures: CurbFeaturesBundle = {
    loadingZones,
    parkingMeters,
    fireHydrants,
    bicycleLanes,
    busStops,
    streetTrees,
    adaCurbRamps,
    driveways,
    crosswalks,
  };
  const earlyDisqualifiers = computeEarlyDisqualifiers(geocoded);

  // Skip envelope math if an early disqualifier already short-circuits the
  // decision. Speeds beyond 30 mph or arterial classification mean the
  // address is INELIGIBLE regardless of curb features — no point doing
  // the geometric work.
  const eligibility =
    earlyDisqualifiers.length > 0
      ? null
      : computeEligibility({ geocoded, curbFeatures });

  return {
    geocoded,
    curbFeatures,
    earlyDisqualifiers,
    eligibility,
    siteWalkCaveats: standardSiteWalkCaveats(),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Determine disqualifiers we can compute from just the geocoding result —
 * no envelope sizing required.
 */
function computeEarlyDisqualifiers(
  geocoded: GeocodedAddress,
): EarlyDisqualifier[] {
  const out: EarlyDisqualifier[] = [];
  const block = geocoded.block;

  // Speed limit > 30 mph is a hard disqualifier per DDOT Section 3.
  if (block.speedLimitMph != null && block.speedLimitMph > 30) {
    out.push({
      rule: "Speed limit must be 30 mph or less",
      detail: `${block.blockName} is posted at ${block.speedLimitMph} mph`,
    });
  }

  // FHWA functional class 1-3 are Interstate / Freeway / Principal Arterial,
  // all disqualifying. 4+ are eligible. DC equivalents: 11, 12, 14.
  if (
    block.functionalClassFhwa != null &&
    block.functionalClassFhwa >= 1 &&
    block.functionalClassFhwa <= 3
  ) {
    const labels: Record<number, string> = {
      1: "Interstate",
      2: "Other Freeway / Expressway",
      3: "Principal Arterial",
    };
    out.push({
      rule: "Street cannot be an arterial, freeway, or interstate",
      detail: `${block.blockName} is classified as FHWA ${block.functionalClassFhwa} (${labels[block.functionalClassFhwa]})`,
    });
  }

  if (block.hasBusLane) {
    out.push({
      rule: "Parking lane cannot be a bus lane",
      detail: `${block.blockName} has a bus lane`,
    });
  }

  return out;
}

/**
 * Site walk caveats are mandatory output per the spec. Even when our data
 * shows everything clear, the operator must verify the building-mounted
 * items (FDCs) and the items where DC's dataset coverage may be incomplete.
 */
function standardSiteWalkCaveats(): string[] {
  return [
    "Confirm Fire Department Connection (FDC) location on building facade — building-mounted FDCs are not in any DC Open Data layer",
    "Verify no driveway curb cuts within 25 ft (dataset coverage may be incomplete)",
    "Verify no marked crosswalks were recently added or removed (dataset is point-in-time)",
    "Verify no utility vault locations within parking lane (dataset coverage is incomplete)",
    "Verify no Washington Gas regulator station vaults within parking lane",
    "Confirm sidewalk width meets ADA path-of-travel requirements (typically 5 ft minimum)",
    "Visually verify no rush-hour parking restrictions on signage",
    "Visually verify no PUDO (pickup/dropoff) zone signage",
    "Verify no Capital Bikeshare or micromobility station within 15 ft (existing or planned)",
  ];
}
