/**
 * The plan frame: signed station/offset projection for the drawing
 * pipeline, shared by extractInputs (tree/crosswalk filtering) and
 * siteContext (everything on the site plan).
 *
 * Why this exists: projectOntoLine() gives station + UNSIGNED distance.
 * Drawings need to know which SIDE of the blockface line a point is on
 * (building side vs street side), so we add a flat-earth cross-product
 * sign test against the blockface CHORD (start→end).
 *
 * IMPORTANT discovery (2026-06-11, while building M3): the Roadway
 * Blockface polyline is NOT the physical curb. Measured against the
 * Planimetrics Curb layer, the "Left" blockface for Mt Pleasant's 3100
 * block runs ~15-25 ft street-ward of the real curb (the geometry
 * follows the route alignment; only its ATTRIBUTES describe a side).
 * Stations along it are still correct — the line runs parallel to the
 * curb — but raw perpendicular distances are systematically shifted.
 * Offsets must therefore be re-referenced to the real curb (see
 * curbOffsetFt in siteContext / extractInputs) before comparing against
 * curb-relative rules like "curbside trees hug the curb".
 *
 * Chord-based sign caveat: Mt Pleasant blockfaces are straight, so the
 * chord is a faithful stand-in for the polyline. On a strongly curved
 * block the sign could flip near the curve — a generalization TODO,
 * not handled.
 */

import type { Feature, LineString } from "geojson";

import { projectOntoLine } from "../envelope.js";

const FT_PER_DEG_LAT = 364_000;

export interface PlanPoint {
  /** Feet along the blockface from its low-measure end. */
  stationFt: number;
  /** Signed feet from the blockface LINE: positive toward the street. */
  offsetFt: number;
}

export interface PlanFrame {
  /** Project a lat/lon into the signed station/offset frame. */
  toPlan(lat: number, lon: number): PlanPoint;
  /** +1/-1: which cross-product side of the chord the building is on. */
  sidewalkSign: number;
  /** Chord unit vector in local east/north feet (for derived bearings). */
  chordUx: number;
  chordUy: number;
  /**
   * Rotation (degrees, clockwise) that takes an up-pointing arrow to
   * true north when the plan is drawn curb-horizontal, street-down.
   */
  northAngleDeg: number;
}

/**
 * Build the frame from the clipped blockface plus the point that
 * defines the "building side" (the MAR address point).
 */
export function createPlanFrame(
  blockface: Feature<LineString>,
  buildingLat: number,
  buildingLon: number,
): PlanFrame {
  const coords = blockface.geometry.coordinates;
  const start = coords[0]!;
  const end = coords[coords.length - 1]!;
  const lat0 = start[1]!;
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);

  // Local east/north feet relative to the chord start.
  const toLocal = (lon: number, lat: number): { x: number; y: number } => ({
    x: (lon - start[0]!) * ftPerDegLon,
    y: (lat - start[1]!) * FT_PER_DEG_LAT,
  });
  const chordEnd = toLocal(end[0]!, end[1]!);
  const chordLen = Math.hypot(chordEnd.x, chordEnd.y) || 1;
  const chordUx = chordEnd.x / chordLen;
  const chordUy = chordEnd.y / chordLen;

  /** +1 / -1 depending on which side of the chord the point falls. */
  const sideSign = (lon: number, lat: number): number => {
    const p = toLocal(lon, lat);
    return Math.sign(chordUx * p.y - chordUy * p.x) || 1;
  };

  const sidewalkSign = sideSign(buildingLon, buildingLat);

  const toPlan = (lat: number, lon: number): PlanPoint => {
    const proj = projectOntoLine(lat, lon, blockface);
    const sign = sideSign(lon, lat) === sidewalkSign ? -1 : 1;
    return {
      stationFt: proj.positionFt,
      offsetFt: sign * proj.distanceFromLineFt,
    };
  };

  // North arrow rotation. The plan's basis: +x = chord direction,
  // +y (SVG down) = perpendicular pointing INTO the street. Express
  // true north (east/north (0,1)) in that basis, then find the rotation
  // taking an up-pointing arrow to it.
  const perpCcwX = -chordUy;
  const perpCcwY = chordUx;
  // perpCcw points to the +1 cross-product side; flip if the building is there.
  const streetPerpY = sidewalkSign > 0 ? -perpCcwY : perpCcwY;
  const northXInPlan = chordUy; // dot((0,1), chordU)
  const northYDownInPlan = streetPerpY; // dot((0,1), streetPerp)
  const northAngleDeg =
    (Math.atan2(northXInPlan, -northYDownInPlan) * 180) / Math.PI;

  return { toPlan, sidewalkSign, chordUx, chordUy, northAngleDeg };
}

/**
 * Estimate how far the blockface LINE sits from the real curb on the
 * building's side, in feet (positive = the line is street-ward of the
 * curb, the observed case). Subtracting this re-references plan offsets
 * to the physical curb face: offsetFromCurb = offsetFt + curbOffsetFt.
 *
 * Method: sample stations along the blockface, measure each sample's
 * distance to the nearest Planimetrics curb SEGMENT on the building's
 * side, and take the median. The median shrugs off corner curb returns
 * and bulb-outs that a mean would average in.
 */
export function estimateCurbOffsetFt(
  blockface: Feature<LineString>,
  frame: PlanFrame,
  curbPaths: number[][][],
  sampleStationsFt: number[],
): number | null {
  if (curbPaths.length === 0 || sampleStationsFt.length === 0) return null;

  // Flatten curb paths to segments, keep only building-side ones (both
  // endpoints on the sidewalk side of the blockface line).
  const sidewalkSegments: Array<[number[], number[]]> = [];
  for (const path of curbPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const aSide = frame.toPlan(a[1]!, a[0]!).offsetFt < 0;
      const bSide = frame.toPlan(b[1]!, b[0]!).offsetFt < 0;
      if (aSide && bSide) sidewalkSegments.push([a, b]);
    }
  }
  if (sidewalkSegments.length === 0) return null;

  // For each sample station, the curb's offset is the LEAST-negative
  // curb-vertex offset near that station — i.e. the curb edge directly
  // opposite the sample. We approximate per-segment by midpoint.
  const distances: number[] = [];
  for (const stationFt of sampleStationsFt) {
    let best: number | null = null;
    for (const [a, b] of sidewalkSegments) {
      const mid = frame.toPlan((a[1]! + b[1]!) / 2, (a[0]! + b[0]!) / 2);
      if (Math.abs(mid.stationFt - stationFt) > 10) continue;
      if (best == null || mid.offsetFt > best) best = mid.offsetFt;
    }
    if (best != null) distances.push(-best); // curb at offset -d → line is d street-ward
  }
  if (distances.length === 0) return null;

  distances.sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)]!;
}
