/**
 * PrescreenResult → ParametricInputs.
 *
 * This is the bridge between the data world (lat/lon, ArcGIS layers,
 * eligibility verdicts) and the drawing world (feet along the curb).
 * Everything downstream of here works in plain numbers; everything
 * geographic gets resolved in this one file.
 *
 * The key move: rebuild the SAME clipped blockface LineString the
 * envelope engine used, then project features onto it with the same
 * projectOntoLine() helper. Reusing the identical line is what makes
 * envelope.startAlongBlockfaceFt and our feature stations commensurable
 * — two different lines (raw vs clipped) would silently shear every
 * coordinate by the clip offset.
 */

import { length } from "@turf/length";

import {
  arcgisToLineString,
  clipBlockfaceToBlock,
} from "../envelope.js";
import { createPlanFrame } from "./planFrame.js";
import type { PrescreenResult } from "../prescreen.js";
import {
  barrierTypeForFunctionalClass,
  DEFAULT_ROOF_PALETTE,
  MIN_VIABLE_PLATFORM_WIDTH_FT,
  TRAVEL_SIDE_BUFFER_FT,
  type RoofPalette,
} from "./templateConstants.js";
import type { ParametricInputs, TreeInput } from "./types.js";

const FT_PER_KM = 3280.84;

/**
 * Trees more than this far (feet) from the CURB FACE are NOT curbside
 * trees — they're projections of trees deeper in the streetscape or on
 * private property, and shouldn't punch holes in the platform.
 * Curbside tree boxes hug the curb (the trunk is typically 2-6 ft from
 * the curb face).
 *
 * "From the curb face" matters: the Roadway Blockface LINE runs ~15-25
 * ft street-ward of the real curb (see planFrame.ts), so distances must
 * be corrected by curbOffsetFt before this cutoff means anything. The
 * uncorrected version of this filter could never match a real curbside
 * tree — the latent bug behind every M1/M2 run reporting "no trees in
 * structure".
 */
const CURBSIDE_TREE_MAX_OFFSET_FT = 12;

/**
 * Crosswalk centers live IN the roadway. Accept anything from just
 * behind our curb to the far side of the street — §4.3's roof buffer
 * applies to crosswalks crossing our street regardless of which half
 * of the roadway the center point landed in.
 */
const CROSSWALK_MIN_OFFSET_FT = -10;
const CROSSWALK_MAX_OFFSET_FT = 60;

/** What the operator can override; everything has a sensible default. */
export interface OperatorOverrides {
  /** Business name for the title block. Defaults to the address. */
  businessName?: string;
  /** Entry position, structure-local feet. Defaults to mid-structure. */
  entryStationFt?: number;
  /** Roof material choice (the one aesthetic axis). */
  roofPalette?: RoofPalette;
  /** Build shorter than the full envelope (e.g. operator wants 1 space of a 2-space envelope). */
  structureLengthCapFt?: number;
}

/** Pipeline-derived geometry corrections (not operator choices). */
export interface GeometryOptions {
  /**
   * How far the blockface line sits street-ward of the real curb
   * (siteContext.curbReference.offsetFt). Defaults to 0, which keeps
   * the raw line distances — fine for stations, wrong for curb-relative
   * filters, so the CLI always passes the measured value through.
   */
  curbOffsetFt?: number;
}

export function extractInputs(
  result: PrescreenResult,
  overrides: OperatorOverrides = {},
  geometry: GeometryOptions = {},
): ParametricInputs {
  const { geocoded, curbFeatures, eligibility } = result;

  // The drawing pipeline only makes sense for a site with a buildable
  // envelope. Fail loudly, not with a 0-ft drawing.
  if (!eligibility || eligibility.envelope.lengthFt <= 0) {
    throw new Error(
      `No buildable envelope for ${geocoded.mar.fullAddress} — ` +
        `verdict is ${eligibility?.verdict ?? "(early disqualifier)"}; nothing to draw.`,
    );
  }
  const envelope = eligibility.envelope;

  // ---------- 1. Rebuild the clipped blockface line ----------
  // Identical sequence to computeEligibility() so stations line up.

  const rawLine = arcgisToLineString(geocoded.blockface.geometry);
  if (!rawLine) {
    throw new Error("Blockface geometry unavailable — cannot place the structure.");
  }
  const blockface = clipBlockfaceToBlock(
    rawLine,
    geocoded.blockface.combinedMeasFrom,
    geocoded.blockface.combinedMeasTo,
    geocoded.block.fromMeasure,
    geocoded.block.toMeasure,
  );
  const blockfaceLengthFt =
    length(blockface, { units: "kilometers" }) * FT_PER_KM;

  // ---------- 2. Structure extent ----------

  const structureStartStationFt = envelope.startAlongBlockfaceFt;
  const fullLengthFt = envelope.lengthFt;
  const structureLengthFt =
    overrides.structureLengthCapFt != null
      ? Math.min(fullLengthFt, overrides.structureLengthCapFt)
      : fullLengthFt;

  // Blockface station → structure-local station.
  const toLocal = (stationFt: number): number =>
    stationFt - structureStartStationFt;

  // ---------- 3. Width formula ----------
  // teardown Part 2: platform = parking lane − travel-side buffer.
  // Mt Pleasant: 8 − 2 = 6 ft, which is exactly what Martha Dear built.

  const parkingLaneWidthFt = geocoded.block.parkingLaneWidthPerSideFt ?? 8;
  const platformWidthFt = parkingLaneWidthFt - TRAVEL_SIDE_BUFFER_FT;
  if (platformWidthFt < MIN_VIABLE_PLATFORM_WIDTH_FT) {
    throw new Error(
      `Parking lane is ${parkingLaneWidthFt} ft — platform would be ` +
        `${platformWidthFt} ft after the ${TRAVEL_SIDE_BUFFER_FT} ft travel-side ` +
        `buffer, below the ${MIN_VIABLE_PLATFORM_WIDTH_FT} ft viability floor.`,
    );
  }

  // ---------- 4. Project layout-shaping features to structure-local stations ----------
  // Signed offsets via the shared plan frame, corrected to the real
  // curb face so the curb-relative cutoffs mean what they say.

  const frame = createPlanFrame(
    blockface,
    geocoded.mar.latitude,
    geocoded.mar.longitude,
  );
  const curbOffsetFt = geometry.curbOffsetFt ?? 0;

  // Trees: only those actually inside the structure's run AND hugging
  // the curb. These become platform cutouts + roof holdbacks.
  const trees: TreeInput[] = [];
  for (const tree of curbFeatures.streetTrees) {
    const p = frame.toPlan(tree.location.latitude, tree.location.longitude);
    if (Math.abs(p.offsetFt + curbOffsetFt) > CURBSIDE_TREE_MAX_OFFSET_FT) {
      continue;
    }
    const localFt = toLocal(p.stationFt);
    if (localFt < 0 || localFt > structureLengthFt) continue;
    trees.push({
      stationFt: localFt,
      commonName:
        typeof tree.metadata.commonName === "string"
          ? tree.metadata.commonName
          : null,
    });
  }

  // Crosswalks: keep ALL crosswalks crossing our street, even outside
  // the structure — §4.3's 25 ft roof buffer reaches in from outside.
  const crosswalkStationsFt: number[] = [];
  for (const xw of curbFeatures.crosswalks) {
    const p = frame.toPlan(xw.location.latitude, xw.location.longitude);
    const curbRelative = p.offsetFt + curbOffsetFt;
    if (
      curbRelative < CROSSWALK_MIN_OFFSET_FT ||
      curbRelative > CROSSWALK_MAX_OFFSET_FT
    ) {
      continue;
    }
    crosswalkStationsFt.push(toLocal(p.stationFt));
  }

  // Intersections: the clipped blockface's endpoints ARE the bounding
  // cross streets (that's what clipBlockfaceToBlock guarantees).
  const intersectionStationsFt = [toLocal(0), toLocal(blockfaceLengthFt)];

  // ---------- 5. Vehicular approach end ----------
  // Heuristic: with right-hand traffic, the curb lane adjacent to the
  // RIGHT blockface flows in the route's digitizing direction, so
  // vehicles reach the structure's low-station end first. LEFT side is
  // the mirror image. One-way streets can break this — the layout
  // always emits a confirm note, and the architect sees it on the sheet.

  const vehicularApproachEnd: "low" | "high" =
    geocoded.side === "Right" ? "low" : "high";

  // ---------- 6. Barrier type from street classification ----------

  const barrier = barrierTypeForFunctionalClass(
    geocoded.block.functionalClassFhwa,
  );

  // ---------- 6b. Frontage provenance ----------
  // The envelope is confined to the business's street frontage (DDOT
  // approves against the real storefront width). When the engine had to
  // ASSUME that window because no building footprint came back, the
  // architect needs to know the length is unvalidated.

  const frontageNote =
    eligibility.frontage.source === "building_footprint"
      ? null
      : eligibility.frontage.source === "operator_override"
        ? `Frontage window OVERRIDDEN to ${Math.round(eligibility.frontage.lengthFt)} ft — ` +
          `extends past the business's own storefront. §4.1 requires letters of ` +
          `consent from the adjacent property owner(s) AND ground-floor tenant(s).`
        : `Frontage window ASSUMED at ${Math.round(eligibility.frontage.lengthFt)} ft ` +
          `(no DC Building Footprints polygon for this address). DDOT limits a ` +
          `streatery to the business's own storefront width — CONFIRM the actual ` +
          `frontage before relying on this structure length.`;

  // ---------- 7. Assemble ----------

  return {
    businessName: overrides.businessName ?? geocoded.mar.fullAddress,
    address: geocoded.mar.fullAddress,
    structureLengthFt,
    platformWidthFt,
    parkingLaneWidthFt,
    structureStartStationFt,
    blockfaceLengthFt,
    vehicularApproachEnd,
    barrierType: barrier.type,
    barrierTypeNote: barrier.note,
    frontageNote,
    trees,
    crosswalkStationsFt,
    intersectionStationsFt,
    entryStationFt: overrides.entryStationFt ?? structureLengthFt / 2,
    roofPalette: overrides.roofPalette ?? DEFAULT_ROOF_PALETTE,
    speedLimitMph: geocoded.block.speedLimitMph,
    functionalClassFhwa: geocoded.block.functionalClassFhwa,
    streetName: geocoded.block.blockName,
  };
}
