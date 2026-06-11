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

export interface PrescreenOptions {
  /**
   * Override the frontage window length (feet), centered on the address
   * point. Bypasses the building-footprint derivation — use it to model
   * a consent-based frontage extension (§4.1: adjacent owner +
   * ground-floor tenant letters) or to reproduce an approved set that
   * extends past the business's own frontage.
   */
  frontageLengthFt?: number;
}

/**
 * Run the full pre-screen for an address.
 *
 * All curb-feature fetchers run in parallel after geocoding completes.
 * Total wall-clock time is dominated by the slowest fetcher, not the sum.
 */
export async function prescreenAddress(
  rawAddress: string,
  options: PrescreenOptions = {},
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
  // decision. Speeds beyond 30 mph or freeway/interstate classification mean the
  // address is INELIGIBLE regardless of curb features — no point doing
  // the geometric work.
  const eligibility =
    earlyDisqualifiers.length > 0
      ? null
      : computeEligibility({
          geocoded,
          curbFeatures,
          frontageLengthFt: options.frontageLengthFt,
        });

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

  // Per §3.1, a PARKING-LANE streatery is prohibited only on Interstate
  // (FHWA 1) and Other Freeway/Expressway (FHWA 2). Principal Arterials
  // (FHWA 3) are NOT disqualified — they're eligible but require Type 1
  // (3-sided, pinned) Jersey barriers per §4.2. Minor Arterials (4) and
  // Collector/Local (5-7) are eligible too. Barrier-type selection (Type 1
  // vs Type 2) is a separate concern we don't compute yet. DC equivalents
  // that disqualify: 11 (Interstate), 12 (Freeway).
  if (
    block.functionalClassFhwa != null &&
    block.functionalClassFhwa >= 1 &&
    block.functionalClassFhwa <= 2
  ) {
    const labels: Record<number, string> = {
      1: "Interstate",
      2: "Other Freeway / Expressway",
    };
    out.push({
      rule: "Street cannot be a freeway or interstate",
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
