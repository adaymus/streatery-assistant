/**
 * Buildable envelope + eligibility verdict.
 *
 * The geometric core of the pre-screener. Given the geocoded address, the
 * blockface curb polyline, and all the curb features fetched by the data
 * layer, this module:
 *
 *   1. Derives the building's "frontage window" — the slice of curb the
 *      streatery may occupy. When DC Building Footprints returns a
 *      polygon, the window is the footprint's actual extent projected
 *      onto the curb line. DDOT limits a streatery to the business's own
 *      street frontage in practice (the regs allow extending past it
 *      with neighbor consent, but approvals to date have not) — so the
 *      real storefront width, not an assumption, caps the envelope.
 *      Fallback when no footprint exists: a 50 ft window centered on
 *      the geocoded address point.
 *   2. Projects every constraining curb feature onto the same line and
 *      converts each into a "forbidden interval" along the curb, sized by
 *      that feature's DDOT Section 3 buffer (10 ft for hydrants, 15 ft for
 *      bus stops, 25 ft for driveways, etc.).
 *   3. Subtracts forbidden intervals from the frontage window. The longest
 *      surviving sub-interval is the buildable envelope.
 *   4. Assigns a verdict from the envelope length per the thresholds we
 *      resolved on 2026-05-22 (>=20 ft eligible, 12-20 ft caveats, <12 ft
 *      ineligible).
 *   5. Also checks whether extending the frontage window (a hypothetical
 *      neighbor-consent letter) would meaningfully improve the result —
 *      this is surfaced as an "extension opportunity."
 *
 * Distance arithmetic is in feet throughout. Turf returns kilometers by
 * default; we convert at the boundary so the engine logic stays in feet.
 */

// Per-function turf imports. The @turf/turf umbrella package is hard to
// tree-shake (everything ends up in the bundle even if only a few
// functions are used), so we depend on the individual sub-packages
// directly. Cuts ~300 KB out of the production bundle.
import { lineString, point } from "@turf/helpers";
import { length } from "@turf/length";
import { along } from "@turf/along";
import { lineSlice } from "@turf/line-slice";
import { nearestPointOnLine } from "@turf/nearest-point-on-line";
import type { Feature, LineString } from "geojson";

import type {
  CurbFeature,
  CurbFeatureType,
} from "./curbFeatures.js";
import type { GeocodedAddress } from "./geocode.js";
import type { CurbFeaturesBundle } from "./prescreen.js";

// ---------- Constants ----------

const FT_PER_KM = 3280.84;
const FT_PER_KM_INV = 1 / FT_PER_KM;

/**
 * DDOT Section 3 buffer distances, in feet. The streatery's buildable
 * envelope must clear each of these by the listed amount.
 *
 * `null` means "no buffer rule applies" — the feature is informational.
 * "Full extent" disqualifiers (loading zones, bus stops) get a finite
 * buffer that approximates the feature's physical extent.
 */
const BUFFER_FT: Record<CurbFeatureType, number | null> = {
  fire_hydrant: 10,
  crosswalk: 10,
  bus_stop: 15,
  // Loading zone signs mark zone endpoints, but we only have one point per
  // zone (the first sign, after dedupe). Treating it as a +/-25 ft zone
  // approximates a typical 40-50 ft LZ length plus a small safety margin.
  loading_zone: 25,
  // ada_curb_ramp default is 0 (pedestrian ramps don't directly buffer the
  // parking lane; the crosswalk dataset captures the relevant constraint).
  // BUT driveways are stored under this type with metadata.subtype="driveway"
  // and DO have a 25 ft buffer — handled in code below.
  ada_curb_ramp: null,
  parking_meter: null, // informational only; meters don't disqualify
  street_tree: null, // spec has no tree buffer; trees go in the planter, not the parking lane
  bicycle_lane: null, // special: hard disqualifier if adjacent to parking lane (not a buffer)
};

const DRIVEWAY_BUFFER_FT = 25;
const INTERSECTION_NO_CROSSWALK_BUFFER_FT = 20;
const INTERSECTION_WITH_CROSSWALK_BUFFER_FT = 10;

/**
 * Distance threshold (feet) above which a feature is considered to be on
 * the other side of the street and shouldn't constrain a streatery on our
 * side. DC streets are typically 30-50 ft wide curb-to-curb; 25 ft from
 * the curb is a safe cutoff.
 */
const OPPOSITE_SIDE_THRESHOLD_FT = 25;

const DEFAULT_FRONTAGE_FT = 50;
const STANDARD_PARKING_SPACE_FT = 20;

/**
 * When deriving frontage from the building footprint, keep only the
 * polygon vertices whose curb offset is within this band of the CLOSEST
 * vertex's offset. The closest vertex sits on the front wall; the band
 * keeps the rest of the front wall plus the near ends of the side
 * walls, and drops (a) the rear of deep buildings and (b) the wing of a
 * corner building that runs down the cross street — both of which would
 * otherwise smear the projected extent and overstate the frontage.
 */
const FRONTAGE_VERTEX_BAND_FT = 30;

/**
 * A footprint-derived frontage narrower than this is geometry noise
 * (e.g. a sliver polygon, or a footprint that barely clips the
 * blockface) — fall back to the assumed window instead.
 */
const MIN_PLAUSIBLE_FRONTAGE_FT = 8;

/** How far past the frontage a neighbor-consent extension reaches, per side. */
const EXTENSION_PER_SIDE_FT = 25;

/** Per the agreed thresholds (CLAUDE.md, 2026-05-22). */
const VERDICT_ELIGIBLE_MIN_FT = 20;
const VERDICT_CAVEATS_MIN_FT = 12;

// ---------- Types ----------

export type Verdict = "ELIGIBLE" | "ELIGIBLE_WITH_CAVEATS" | "INELIGIBLE";

export interface BindingConstraint {
  type: CurbFeatureType | "intersection";
  description: string;
  bufferFt: number;
  // Distance from the envelope to this constraint, in feet. Negative
  // (or zero) means the constraint is touching the envelope edge.
  distanceFromEnvelopeFt: number;
  limits: "northern edge" | "southern edge" | "both edges" | "interior";
}

export interface BuildableEnvelope {
  lengthFt: number;
  widthFt: number;
  approximateParkingSpaces: number;
  recommendedTemplate: "1-space" | "2-space" | "3-space+" | "none";
  geometry: Feature<LineString> | null; // null if length is 0
  // Position along the blockface in feet from the start, useful for the
  // UI to draw the envelope's location relative to cross streets.
  startAlongBlockfaceFt: number;
  endAlongBlockfaceFt: number;
}

export interface EligibilityResult {
  verdict: Verdict;
  envelope: BuildableEnvelope;
  bindingConstraints: BindingConstraint[];
  /** Hard disqualifiers that override envelope-based logic. */
  hardDisqualifiers: string[];
  /**
   * The frontage window the envelope was confined to, and where it came
   * from. "building_footprint" = real storefront extent from DC Building
   * Footprints (what DDOT actually approves against); "operator_override"
   * = an explicit frontageLengthFt was passed in (modeling a §4.1
   * consent-based extension); "assumed_default" = 50 ft centered on the
   * address point because no footprint was found — downstream consumers
   * should flag that for operator confirmation.
   */
  frontage: {
    startAlongBlockfaceFt: number;
    endAlongBlockfaceFt: number;
    lengthFt: number;
    source: "building_footprint" | "operator_override" | "assumed_default";
  };
  /** If extending the frontage window would meaningfully help. */
  extensionOpportunity: {
    couldHelp: boolean;
    extendedEnvelopeLengthFt: number;
    extendedFrontageFt: number;
  };
}

// ---------- Geometry helpers ----------

/**
 * Convert an ArcGIS polyline ({ paths: [[[lon, lat], ...]] }) to a Turf
 * LineString feature. We take the first path only; multi-path blockfaces
 * don't occur in practice for a single side of a single block.
 *
 * Exported for the v3 design pipeline, which needs the same blockface
 * LineString to project curb features into station coordinates.
 */
export function arcgisToLineString(
  arcgisGeometry: unknown,
): Feature<LineString> | null {
  const paths = (arcgisGeometry as { paths?: number[][][] } | null)?.paths;
  const first = paths?.[0];
  if (!first || first.length < 2) return null;
  return lineString(first);
}

/**
 * Clip the blockface polyline to the building's block by linearly
 * interpolating route measures into positions along the polyline.
 *
 * The Roadway Blockface layer is parameterized by route measure (in
 * meters). A blockface might span multiple blocks, so we slice it down to
 * just the section whose measures fall within the block's [FROMMEASURE,
 * TOMEASURE]. The result's endpoints are the actual bounding intersections.
 *
 * If the measure ranges aren't available or don't fit, return the raw
 * line unchanged — the envelope math degrades gracefully.
 *
 * Exported for the v3 design pipeline (station coordinates must be
 * measured along the SAME clipped line the envelope was computed on,
 * or envelope.startAlongBlockfaceFt wouldn't line up).
 */
export function clipBlockfaceToBlock(
  rawLine: Feature<LineString>,
  blockfaceMeasFrom: number | null,
  blockfaceMeasTo: number | null,
  blockMeasFrom: number | null,
  blockMeasTo: number | null,
): Feature<LineString> {
  if (
    blockfaceMeasFrom == null ||
    blockfaceMeasTo == null ||
    blockMeasFrom == null ||
    blockMeasTo == null
  ) {
    return rawLine;
  }
  const blockfaceMeasSpan = blockfaceMeasTo - blockfaceMeasFrom;
  if (blockfaceMeasSpan <= 0) return rawLine;

  // Intersect the two measure ranges. If they don't overlap, fall back to
  // the raw line — better to over-include than to return an empty polyline.
  const clipStart = Math.max(blockMeasFrom, blockfaceMeasFrom);
  const clipEnd = Math.min(blockMeasTo, blockfaceMeasTo);
  if (clipEnd <= clipStart) return rawLine;

  // Linear interpolation from measure to position-along-line. Holds
  // exactly for blockfaces with uniform measure parameterization, which
  // is the case for short straight curb segments (the common shape here).
  const lineLengthKm = length(rawLine, { units: "kilometers" });
  const startFrac = (clipStart - blockfaceMeasFrom) / blockfaceMeasSpan;
  const endFrac = (clipEnd - blockfaceMeasFrom) / blockfaceMeasSpan;
  const startKm = startFrac * lineLengthKm;
  const endKm = endFrac * lineLengthKm;

  const startPoint = along(rawLine, startKm, { units: "kilometers" });
  const endPoint = along(rawLine, endKm, { units: "kilometers" });
  return lineSlice(startPoint, endPoint, rawLine);
}

/**
 * Project a lat/lon point onto a line, returning the position along the
 * line (in feet from the line's start) and the perpendicular distance from
 * the point to the line.
 *
 * Exported for the v3 design pipeline: (positionFt, distanceFromLineFt)
 * is exactly the "station / offset" coordinate frame the drawing
 * generators work in — feet along the curb × feet from the curb.
 */
export function projectOntoLine(
  lat: number,
  lon: number,
  line: Feature<LineString>,
): { positionFt: number; distanceFromLineFt: number } {
  // Local variable renamed from `point` to `target` to avoid shadowing
  // the imported `point` constructor from @turf/helpers.
  const target = point([lon, lat]);
  const snapped = nearestPointOnLine(line, target, {
    units: "kilometers",
  });
  return {
    positionFt: (snapped.properties.location ?? 0) * FT_PER_KM,
    distanceFromLineFt: (snapped.properties.dist ?? 0) * FT_PER_KM,
  };
}

/**
 * Derive the frontage window from the building footprint polygon.
 *
 * Every ring vertex gets projected into the station/offset frame
 * (feet along the curb × feet from the curb). The vertex closest to
 * the curb is on the front wall; we keep all vertices within
 * FRONTAGE_VERTEX_BAND_FT of that offset (the front of the building)
 * and take the min/max station among them. That [min, max] interval IS
 * the storefront's extent along the curb.
 *
 * Why filter by offset at all? Two failure modes if we naively take
 * min/max over every vertex:
 *   - Corner buildings (e.g. Purple Patch at 3155 Mt Pleasant = 1620
 *     Lamont — one polygon, two streets): the wing running down the
 *     cross street projects onto our blockface's endpoint and would
 *     stretch the frontage to the corner even where the Mt Pleasant
 *     storefront stops short of it.
 *   - L-shaped or rear-addition footprints: back-of-lot geometry can
 *     project to stations outside the actual storefront.
 *
 * Returns null when the footprint produces an implausible window —
 * the caller falls back to the assumed 50 ft window.
 */
export function frontageWindowFromFootprint(
  ring: number[][],
  blockface: Feature<LineString>,
  blockfaceLengthFt: number,
): { startFt: number; endFt: number } | null {
  // Project every vertex into station/offset coordinates.
  const projections: Array<{ positionFt: number; distanceFromLineFt: number }> =
    [];
  for (const vertex of ring) {
    const lon = vertex[0];
    const lat = vertex[1];
    if (lon == null || lat == null) continue;
    projections.push(projectOntoLine(lat, lon, blockface));
  }
  if (projections.length < 3) return null;

  // The smallest curb offset locates the front wall (typically the
  // sidewalk width, ~10-20 ft in Mt Pleasant).
  const frontWallOffsetFt = Math.min(
    ...projections.map((p) => p.distanceFromLineFt),
  );
  const frontVertices = projections.filter(
    (p) => p.distanceFromLineFt <= frontWallOffsetFt + FRONTAGE_VERTEX_BAND_FT,
  );
  if (frontVertices.length < 2) return null;

  // The storefront's extent along the curb, clamped to the block.
  const startFt = Math.max(
    0,
    Math.min(...frontVertices.map((p) => p.positionFt)),
  );
  const endFt = Math.min(
    blockfaceLengthFt,
    Math.max(...frontVertices.map((p) => p.positionFt)),
  );
  if (endFt - startFt < MIN_PLAUSIBLE_FRONTAGE_FT) return null;

  return { startFt, endFt };
}

/**
 * Extract a sub-segment of a line between two positions (in feet from the
 * start). Returns a new LineString.
 */
function sliceLineByMeasure(
  line: Feature<LineString>,
  startFt: number,
  endFt: number,
): Feature<LineString> | null {
  if (endFt <= startFt) return null;
  const startPoint = along(line, startFt * FT_PER_KM_INV, {
    units: "kilometers",
  });
  const endPoint = along(line, endFt * FT_PER_KM_INV, {
    units: "kilometers",
  });
  return lineSlice(startPoint, endPoint, line);
}

/**
 * Find the longest contiguous sub-interval of [windowStart, windowEnd]
 * that doesn't overlap any forbidden interval.
 *
 * This is the classic interval-coverage problem: sort, merge overlaps,
 * walk the merged intervals tracking the largest gap.
 *
 * Exported because the v3 layout solver (src/design/layout.ts) reuses the
 * exact same algorithm for ROOF extent: §4.3 forbids overhead structures
 * within 25 ft of a crosswalk / 40 ft of an intersection without one /
 * 5 ft of a tree trunk — same "subtract forbidden intervals, keep the
 * longest gap" problem, just with a different buffer table.
 */
export function longestGapInWindow(
  windowStart: number,
  windowEnd: number,
  forbidden: Array<[number, number]>,
): { start: number; end: number } {
  // Normalize each interval so start <= end, then sort by start position.
  const sorted = forbidden
    .map<[number, number]>(([s, e]) => [Math.min(s, e), Math.max(s, e)])
    .sort((a, b) => a[0] - b[0]);

  // Merge overlapping/adjacent forbidden intervals so we don't double-count.
  const merged: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  // Walk the merged intervals tracking the largest uncovered gap inside
  // the window. `cursor` is "the earliest position in the window we
  // haven't yet considered."
  let bestStart = windowStart;
  let bestEnd = windowStart; // zero-length envelope is the worst case
  let cursor = windowStart;

  for (const [fStart, fEnd] of merged) {
    // Forbidden interval entirely before the window — skip.
    if (fEnd <= windowStart) continue;
    // Forbidden interval entirely after the window — done.
    if (fStart >= windowEnd) break;

    const clippedStart = Math.max(fStart, windowStart);
    const clippedEnd = Math.min(fEnd, windowEnd);

    // Gap from cursor up to the start of this forbidden interval.
    if (clippedStart > cursor) {
      const gapLen = clippedStart - cursor;
      if (gapLen > bestEnd - bestStart) {
        bestStart = cursor;
        bestEnd = clippedStart;
      }
    }
    cursor = Math.max(cursor, clippedEnd);
  }

  // Final gap from cursor to the window end.
  if (windowEnd - cursor > bestEnd - bestStart) {
    bestStart = cursor;
    bestEnd = windowEnd;
  }

  return { start: bestStart, end: bestEnd };
}

// ---------- Forbidden-interval construction ----------

interface ForbiddenInterval {
  type: CurbFeatureType | "intersection";
  description: string;
  bufferFt: number;
  centerFt: number; // position along the blockface
  start: number;
  end: number;
}

function bufferForFeature(feature: CurbFeature): number | null {
  // Driveways are stored under ada_curb_ramp with subtype="driveway".
  if (
    feature.type === "ada_curb_ramp" &&
    feature.metadata.subtype === "driveway"
  ) {
    return DRIVEWAY_BUFFER_FT;
  }
  return BUFFER_FT[feature.type];
}

function describeFeature(feature: CurbFeature): string {
  switch (feature.type) {
    case "fire_hydrant":
      return `fire hydrant ${feature.metadata.assetNum ?? ""}`.trim();
    case "crosswalk":
      return `${feature.metadata.detail ?? "marked"} crosswalk`;
    case "bus_stop":
      return `bus stop on ${feature.metadata.onStreet ?? "this block"}`;
    case "loading_zone":
      return `loading zone ${feature.metadata.lzId ?? ""}`.trim();
    case "ada_curb_ramp":
      return feature.metadata.subtype === "driveway"
        ? "driveway curb cut"
        : "ADA curb ramp";
    case "parking_meter":
      return `parking meter ${feature.metadata.meterId ?? ""}`.trim();
    case "street_tree":
      return `street tree (${feature.metadata.commonName ?? "?"})`;
    case "bicycle_lane":
      return "bicycle lane";
  }
}

/**
 * Project all relevant features onto the blockface and emit forbidden
 * intervals. Features on the opposite side of the street (projected
 * distance > threshold) are dropped.
 */
function buildForbiddenIntervals(
  blockface: Feature<LineString>,
  bundle: CurbFeaturesBundle,
  crosswalksNearStart: boolean,
  crosswalksNearEnd: boolean,
  blockfaceLengthFt: number,
): ForbiddenInterval[] {
  const out: ForbiddenInterval[] = [];

  // Intersection buffers at both ends. The blockface starts and ends at
  // cross streets — those are the intersections.
  out.push({
    type: "intersection",
    description: crosswalksNearStart
      ? "intersection (crosswalk present)"
      : "intersection (no crosswalk)",
    bufferFt: crosswalksNearStart
      ? INTERSECTION_WITH_CROSSWALK_BUFFER_FT
      : INTERSECTION_NO_CROSSWALK_BUFFER_FT,
    centerFt: 0,
    start: 0,
    end: crosswalksNearStart
      ? INTERSECTION_WITH_CROSSWALK_BUFFER_FT
      : INTERSECTION_NO_CROSSWALK_BUFFER_FT,
  });
  const endBuffer = crosswalksNearEnd
    ? INTERSECTION_WITH_CROSSWALK_BUFFER_FT
    : INTERSECTION_NO_CROSSWALK_BUFFER_FT;
  out.push({
    type: "intersection",
    description: crosswalksNearEnd
      ? "intersection (crosswalk present)"
      : "intersection (no crosswalk)",
    bufferFt: endBuffer,
    centerFt: blockfaceLengthFt,
    start: blockfaceLengthFt - endBuffer,
    end: blockfaceLengthFt,
  });

  const allFeatures: CurbFeature[] = [
    ...bundle.loadingZones,
    ...bundle.parkingMeters,
    ...bundle.fireHydrants,
    ...bundle.bicycleLanes,
    ...bundle.busStops,
    ...bundle.streetTrees,
    ...bundle.adaCurbRamps,
    ...bundle.driveways,
    ...bundle.crosswalks,
  ];

  for (const feature of allFeatures) {
    const buffer = bufferForFeature(feature);
    if (buffer == null || buffer <= 0) continue;

    const { positionFt, distanceFromLineFt } = projectOntoLine(
      feature.location.latitude,
      feature.location.longitude,
      blockface,
    );

    // Drop features on the opposite side of the street.
    if (distanceFromLineFt > OPPOSITE_SIDE_THRESHOLD_FT) continue;

    out.push({
      type: feature.type,
      description: describeFeature(feature),
      bufferFt: buffer,
      centerFt: positionFt,
      start: positionFt - buffer,
      end: positionFt + buffer,
    });
  }

  return out;
}

// ---------- Main entry ----------

interface ComputeEligibilityArgs {
  geocoded: GeocodedAddress;
  curbFeatures: CurbFeaturesBundle;
  frontageLengthFt?: number;
}

export function computeEligibility(
  args: ComputeEligibilityArgs,
): EligibilityResult {
  const frontageLengthFt = args.frontageLengthFt ?? DEFAULT_FRONTAGE_FT;
  const rawBlockface = arcgisToLineString(args.geocoded.blockface.geometry);

  // Defensive: if we somehow have no blockface geometry, return a default
  // INELIGIBLE result rather than throwing.
  if (!rawBlockface) {
    return inelligibleResult("blockface geometry unavailable");
  }

  // The raw polyline from the geocoding pipeline may span more than the
  // building's block (some Mt Pleasant blockfaces have no curb breaks and
  // continue across multiple cross streets). Clip it to the block's
  // measure range so the polyline endpoints really are the bounding
  // cross-street intersections.
  const blockface = clipBlockfaceToBlock(
    rawBlockface,
    args.geocoded.blockface.combinedMeasFrom,
    args.geocoded.blockface.combinedMeasTo,
    args.geocoded.block.fromMeasure,
    args.geocoded.block.toMeasure,
  );

  const blockfaceLengthFt =
    length(blockface, { units: "kilometers" }) * FT_PER_KM;

  // 1. Determine the frontage window — the slice of curb the streatery
  // may occupy. DDOT limits approvals to the business's own storefront
  // width in practice (confirmed against the Martha Dear approved set:
  // 35'-3 1/2" as built vs the 50 ft our assumed window allowed), so
  // prefer the real footprint extent when DC Building Footprints has
  // one. An explicit frontageLengthFt arg (operator override) wins over
  // both; no footprint falls back to 50 ft centered on the address.
  const footprintRing = args.geocoded.buildingFootprint?.ring;
  const footprintWindow =
    args.frontageLengthFt == null && footprintRing
      ? frontageWindowFromFootprint(footprintRing, blockface, blockfaceLengthFt)
      : null;

  let frontageStart: number;
  let frontageEnd: number;
  let frontageSource: EligibilityResult["frontage"]["source"];
  if (footprintWindow) {
    frontageStart = footprintWindow.startFt;
    frontageEnd = footprintWindow.endFt;
    frontageSource = "building_footprint";
  } else {
    // Fallback: center an assumed window on the geocoded address point.
    const projected = projectOntoLine(
      args.geocoded.mar.latitude,
      args.geocoded.mar.longitude,
      blockface,
    );
    const frontageCenter = projected.positionFt;
    frontageStart = Math.max(0, frontageCenter - frontageLengthFt / 2);
    frontageEnd = Math.min(
      blockfaceLengthFt,
      frontageCenter + frontageLengthFt / 2,
    );
    frontageSource =
      args.frontageLengthFt != null ? "operator_override" : "assumed_default";
  }

  // 2. Hard disqualifiers that override everything else.
  const hardDisqualifiers: string[] = [];
  const adjacentBikeLanes = args.curbFeatures.bicycleLanes.filter(
    (b) => b.metadata.adjacentToParkingLane === true,
  );
  if (adjacentBikeLanes.length > 0) {
    hardDisqualifiers.push(
      "Bicycle lane runs adjacent to the parking lane on this block — a streatery here would block the bike lane",
    );
  }

  // 3. Build forbidden intervals from features (after determining whether
  // the blockface endpoints have crosswalks nearby).
  const crosswalksNearStart = hasFeatureNearMeasure(
    args.curbFeatures.crosswalks,
    blockface,
    0,
    15,
  );
  const crosswalksNearEnd = hasFeatureNearMeasure(
    args.curbFeatures.crosswalks,
    blockface,
    blockfaceLengthFt,
    15,
  );
  const forbiddenIntervals = buildForbiddenIntervals(
    blockface,
    args.curbFeatures,
    crosswalksNearStart,
    crosswalksNearEnd,
    blockfaceLengthFt,
  );

  // 4. Find the longest gap inside the frontage window.
  const forbiddenForGap = forbiddenIntervals.map<[number, number]>((f) => [
    f.start,
    f.end,
  ]);
  const gap = longestGapInWindow(frontageStart, frontageEnd, forbiddenForGap);
  const envelopeLengthFt = Math.max(0, gap.end - gap.start);

  // 5. Identify binding constraints — the forbidden intervals that actually
  // touch one of the envelope's edges. These are what's "limiting" the
  // result; non-binding ones are nearby but not driving the answer.
  const bindingConstraints: BindingConstraint[] = [];
  for (const f of forbiddenIntervals) {
    const distToStart = gap.start - f.end; // positive if forbidden ends before envelope starts
    const distToEnd = f.start - gap.end; // positive if forbidden starts after envelope ends
    const touchingStartEdge =
      Math.abs(distToStart) < 0.5 && f.end <= gap.start;
    const touchingEndEdge = Math.abs(distToEnd) < 0.5 && f.start >= gap.end;

    if (touchingStartEdge || touchingEndEdge) {
      // "Northern/southern edge" is just a friendly label. We don't know
      // compass orientation here — use start/end and the UI can map to
      // the right wording later.
      const limits = touchingStartEdge ? "southern edge" : "northern edge";
      bindingConstraints.push({
        type: f.type,
        description: f.description,
        bufferFt: f.bufferFt,
        distanceFromEnvelopeFt: 0,
        limits,
      });
    }
  }

  // 6. Build the envelope object.
  const envelopeGeometry =
    envelopeLengthFt > 0
      ? sliceLineByMeasure(blockface, gap.start, gap.end)
      : null;
  const envelope: BuildableEnvelope = {
    lengthFt: envelopeLengthFt,
    widthFt: args.geocoded.block.parkingLaneWidthPerSideFt ?? 8,
    approximateParkingSpaces:
      Math.round((envelopeLengthFt / STANDARD_PARKING_SPACE_FT) * 10) / 10,
    recommendedTemplate: templateFor(envelopeLengthFt),
    geometry: envelopeGeometry,
    startAlongBlockfaceFt: gap.start,
    endAlongBlockfaceFt: gap.end,
  };

  // 7. Verdict.
  let verdict: Verdict;
  if (hardDisqualifiers.length > 0) {
    verdict = "INELIGIBLE";
  } else if (envelopeLengthFt >= VERDICT_ELIGIBLE_MIN_FT) {
    verdict = "ELIGIBLE";
  } else if (envelopeLengthFt >= VERDICT_CAVEATS_MIN_FT) {
    verdict = "ELIGIBLE_WITH_CAVEATS";
  } else {
    verdict = "INELIGIBLE";
  }

  // 8. Frontage extension opportunity. What if the operator got consent
  // to extend into their neighbor's frontage on both sides? (The regs
  // allow this with adjacent-owner + ground-floor-tenant letters, even
  // though DDOT hasn't approved one yet — worth surfacing as a "what
  // if," never as the default envelope.)
  const extendedStart = Math.max(0, frontageStart - EXTENSION_PER_SIDE_FT);
  const extendedEnd = Math.min(
    blockfaceLengthFt,
    frontageEnd + EXTENSION_PER_SIDE_FT,
  );
  const extendedFrontageFt = extendedEnd - extendedStart;
  const extendedGap = longestGapInWindow(
    extendedStart,
    extendedEnd,
    forbiddenForGap,
  );
  const extendedLength = Math.max(0, extendedGap.end - extendedGap.start);
  const couldHelp =
    extendedLength > envelopeLengthFt + 2 && // not just numerical noise
    extendedLength >= VERDICT_CAVEATS_MIN_FT &&
    envelopeLengthFt < VERDICT_ELIGIBLE_MIN_FT;

  return {
    verdict,
    envelope,
    bindingConstraints,
    hardDisqualifiers,
    frontage: {
      startAlongBlockfaceFt: frontageStart,
      endAlongBlockfaceFt: frontageEnd,
      lengthFt: frontageEnd - frontageStart,
      source: frontageSource,
    },
    extensionOpportunity: {
      couldHelp,
      extendedEnvelopeLengthFt: extendedLength,
      extendedFrontageFt,
    },
  };
}

// ---------- Helpers ----------

function templateFor(lengthFt: number): BuildableEnvelope["recommendedTemplate"] {
  if (lengthFt < VERDICT_CAVEATS_MIN_FT) return "none";
  if (lengthFt < 2 * STANDARD_PARKING_SPACE_FT) return "1-space";
  if (lengthFt < 3 * STANDARD_PARKING_SPACE_FT) return "2-space";
  return "3-space+";
}

function hasFeatureNearMeasure(
  features: CurbFeature[],
  blockface: Feature<LineString>,
  targetFt: number,
  toleranceFt: number,
): boolean {
  for (const f of features) {
    const { positionFt, distanceFromLineFt } = projectOntoLine(
      f.location.latitude,
      f.location.longitude,
      blockface,
    );
    if (distanceFromLineFt > OPPOSITE_SIDE_THRESHOLD_FT) continue;
    if (Math.abs(positionFt - targetFt) < toleranceFt) return true;
  }
  return false;
}

function inelligibleResult(reason: string): EligibilityResult {
  return {
    verdict: "INELIGIBLE",
    envelope: {
      lengthFt: 0,
      widthFt: 0,
      approximateParkingSpaces: 0,
      recommendedTemplate: "none",
      geometry: null,
      startAlongBlockfaceFt: 0,
      endAlongBlockfaceFt: 0,
    },
    bindingConstraints: [],
    hardDisqualifiers: [reason],
    frontage: {
      startAlongBlockfaceFt: 0,
      endAlongBlockfaceFt: 0,
      lengthFt: 0,
      source: "assumed_default",
    },
    extensionOpportunity: {
      couldHelp: false,
      extendedEnvelopeLengthFt: 0,
      extendedFrontageFt: 0,
    },
  };
}
