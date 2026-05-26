/**
 * Buildable envelope + eligibility verdict.
 *
 * The geometric core of the pre-screener. Given the geocoded address, the
 * blockface curb polyline, and all the curb features fetched by the data
 * layer, this module:
 *
 *   1. Projects the building onto the blockface to find its "frontage
 *      window" (a 50 ft slice of curb in front of the operator's lot).
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

import * as turf from "@turf/turf";
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
 */
function arcgisToLineString(
  arcgisGeometry: unknown,
): Feature<LineString> | null {
  const paths = (arcgisGeometry as { paths?: number[][][] } | null)?.paths;
  const first = paths?.[0];
  if (!first || first.length < 2) return null;
  return turf.lineString(first);
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
 */
function clipBlockfaceToBlock(
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
  const lineLengthKm = turf.length(rawLine, { units: "kilometers" });
  const startFrac = (clipStart - blockfaceMeasFrom) / blockfaceMeasSpan;
  const endFrac = (clipEnd - blockfaceMeasFrom) / blockfaceMeasSpan;
  const startKm = startFrac * lineLengthKm;
  const endKm = endFrac * lineLengthKm;

  const startPoint = turf.along(rawLine, startKm, { units: "kilometers" });
  const endPoint = turf.along(rawLine, endKm, { units: "kilometers" });
  return turf.lineSlice(startPoint, endPoint, rawLine);
}

/**
 * Project a lat/lon point onto a line, returning the position along the
 * line (in feet from the line's start) and the perpendicular distance from
 * the point to the line.
 */
function projectOntoLine(
  lat: number,
  lon: number,
  line: Feature<LineString>,
): { positionFt: number; distanceFromLineFt: number } {
  const point = turf.point([lon, lat]);
  const snapped = turf.nearestPointOnLine(line, point, {
    units: "kilometers",
  });
  return {
    positionFt: (snapped.properties.location ?? 0) * FT_PER_KM,
    distanceFromLineFt: (snapped.properties.dist ?? 0) * FT_PER_KM,
  };
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
  const startPoint = turf.along(line, startFt * FT_PER_KM_INV, {
    units: "kilometers",
  });
  const endPoint = turf.along(line, endFt * FT_PER_KM_INV, {
    units: "kilometers",
  });
  return turf.lineSlice(startPoint, endPoint, line);
}

/**
 * Find the longest contiguous sub-interval of [windowStart, windowEnd]
 * that doesn't overlap any forbidden interval.
 *
 * This is the classic interval-coverage problem: sort, merge overlaps,
 * walk the merged intervals tracking the largest gap.
 */
function longestGapInWindow(
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
    turf.length(blockface, { units: "kilometers" }) * FT_PER_KM;

  // 1. Project the building onto the blockface to anchor the frontage window.
  const projected = projectOntoLine(
    args.geocoded.mar.latitude,
    args.geocoded.mar.longitude,
    blockface,
  );
  const frontageCenter = projected.positionFt;
  const frontageStart = Math.max(0, frontageCenter - frontageLengthFt / 2);
  const frontageEnd = Math.min(
    blockfaceLengthFt,
    frontageCenter + frontageLengthFt / 2,
  );

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
  // to extend into their neighbor's frontage on both sides?
  const extendedFrontageFt = frontageLengthFt + 50; // +25 ft on each side
  const extendedStart = Math.max(0, frontageCenter - extendedFrontageFt / 2);
  const extendedEnd = Math.min(
    blockfaceLengthFt,
    frontageCenter + extendedFrontageFt / 2,
  );
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
    extensionOpportunity: {
      couldHelp: false,
      extendedEnvelopeLengthFt: 0,
      extendedFrontageFt: 0,
    },
  };
}
