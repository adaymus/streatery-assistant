/**
 * PrescreenResult → SiteContext: everything the Site Plan needs that
 * StreateryDesign deliberately does NOT carry.
 *
 * StreateryDesign is the resolved structure (platform, posts, barrier,
 * roof) in structure-local stations. The Site Plan must also show the
 * BLOCK around it — building footprint, meters with numbers, hydrants,
 * tree boxes, cross streets, right-of-way widths. That context lives
 * here, projected into the BLOCKFACE station frame (0 at the block's
 * low-measure cross street), which is the frame design.anchor points
 * back into. Same split as ParametricInputs vs StreateryDesign: data
 * resolution happens once, renderers only draw.
 *
 * Critically, the projections reuse the SAME clipped blockface line the
 * envelope engine used (rebuilt via the identical clipBlockfaceToBlock
 * call), so a meter at station 86 here and an envelope starting at
 * station 86 in design.anchor are the same physical spot on the curb.
 *
 * Offsets are referenced to the REAL curb, not the blockface line —
 * the blockface geometry follows the route alignment ~15-25 ft into
 * the street (see planFrame.ts). extractSiteContext is async because
 * it fetches the Planimetrics curb layer to establish that reference.
 *
 * Coordinate convention: stationFt = feet along the curb from the
 * low-measure cross street; offsetFt = feet from the CURB FACE, SIGNED,
 * positive into the street (matching types.ts). Buildings come out
 * negative, travel lanes positive.
 */

import { length } from "@turf/length";

import {
  arcgisToLineString,
  clipBlockfaceToBlock,
} from "../envelope.js";
import { fetchCurbPathsNear } from "../curbs.js";
import { fetchOwnerLotAtPoint } from "../ownerLot.js";
import {
  fetchVicinityStreets,
  type VicinityStreet,
} from "../vicinityStreets.js";
import type { PrescreenResult } from "../prescreen.js";
import {
  createPlanFrame,
  estimateCurbOffsetFt,
  type PlanPoint,
} from "./planFrame.js";

const FT_PER_KM = 3280.84;

/** Same cutoff envelope.ts / extractInputs.ts use to drop opposite-side features. */
const SAME_SIDE_MAX_OFFSET_FT = 25;
/** Trees beyond this curb offset aren't curbside trees (matches extractInputs). */
const CURBSIDE_TREE_MAX_OFFSET_FT = 12;
/**
 * Urban Forestry uses TBOX_L = 99 as a sentinel for "unknown / extended
 * planter strip" — NOT a literal 99 ft tree box (CLAUDE.md addendum).
 */
const TREE_BOX_SENTINEL = 99;

// ---------- Types ----------

/** A point feature on the plan: station along curb + signed curb offset. */
export type StationedPoint = PlanPoint;

export interface MeterOnPlan extends StationedPoint {
  /** The long METERID string — the format DDOT wants on the site plan. */
  meterId: string | null;
  /** How many spaces this meter governs (MULTI pay stations serve 5-10). */
  spaces: number | null;
  /** Curbside regulation description, e.g. metered-hours text. */
  policy: string | null;
}

export interface TreeOnPlan extends StationedPoint {
  commonName: string | null;
  /** Tree box footprint (L along curb × W); null when unknown. */
  boxLengthFt: number | null;
  boxWidthFt: number | null;
  /** True when Urban Forestry reported the 99 sentinel (or nothing). */
  boxIsUnknown: boolean;
}

export interface HydrantOnPlan extends StationedPoint {
  assetNum: string | null;
}

export interface LabeledPoint extends StationedPoint {
  label: string;
}

export interface SiteContext {
  blockfaceLengthFt: number;
  blockName: string;
  fromStreet: string;
  toStreet: string;

  /**
   * How far the blockface LINE sits street-ward of the real curb, and
   * whether we could measure it. "planimetric" = measured against the
   * DC Curb layer; "unavailable" = no curb data came back, offsets are
   * raw line distances and the sheet must say so loudly.
   */
  curbReference: {
    offsetFt: number;
    source: "planimetric" | "unavailable";
  };

  /** Right-of-way band widths for the ROW cross-section dimensions. */
  rightOfWay: {
    /**
     * Curb-to-façade distance measured from the building footprint —
     * the honest "existing sidewalk width" (what Martha Dear's approved
     * A100 dimensions; DDOT's Roadway Block string includes the
     * planting zone). Null when no footprint.
     */
    facadeOffsetFt: number | null;
    /** DDOT Roadway Block raw strings ("14", "16+", "None"→null) + parsed values. */
    sidewalkInboundRaw: string | null;
    sidewalkInboundFt: number | null;
    sidewalkOutboundRaw: string | null;
    sidewalkOutboundFt: number | null;
    parkingLaneWidthFt: number;
    travelLaneCount: number | null;
    travelLaneWidthEachFt: number | null;
    hasBikeLane: boolean;
  };

  building: {
    /** Footprint ring in station/offset; null when DC has no polygon. */
    ring: StationedPoint[] | null;
    assumed: boolean;
    /** e.g. "captured 2015-04" — provenance for the architect. */
    captureLabel: string | null;
    addressLabel: string;
  };

  /** The frontage window the envelope was confined to (blockface frame). */
  frontage: {
    startFt: number;
    endFt: number;
    source: "building_footprint" | "operator_override" | "assumed_default";
  };

  meters: MeterOnPlan[];
  hydrants: HydrantOnPlan[];
  trees: TreeOnPlan[];
  driveways: StationedPoint[];
  adaRamps: StationedPoint[];
  busStops: StationedPoint[];
  loadingZones: LabeledPoint[];
  crosswalks: StationedPoint[];

  /** Cover-sheet project data: civic identifiers for the property. */
  civic: {
    wardId: string | null;
    ancId: string | null;
    /** Square-Lot from Owner Polygons, e.g. "2596-0639". Null = lot not found. */
    ssl: string | null;
  };

  /**
   * Street centerlines within ~1000 ft, in local east/north feet from
   * the address point — the G1.00 vicinity map's content.
   */
  vicinity: VicinityStreet[];

  /**
   * Rotation (degrees, clockwise) to apply to an up-pointing north
   * arrow so it points true north in the plan's station/offset frame.
   * Derived from the real curb bearing — the plan draws the street
   * horizontal regardless of its compass orientation.
   */
  northAngleDeg: number;
}

// ---------- Extraction ----------

export async function extractSiteContext(
  result: PrescreenResult,
): Promise<SiteContext> {
  const { geocoded, curbFeatures, eligibility } = result;
  if (!eligibility) {
    throw new Error(
      "Site plan requires an eligibility result — early disqualifiers short-circuited it.",
    );
  }

  // ---------- 1. The clipped blockface (identical to extractInputs) ----------

  const rawLine = arcgisToLineString(geocoded.blockface.geometry);
  if (!rawLine) {
    throw new Error("Blockface geometry unavailable — cannot build site context.");
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

  const frame = createPlanFrame(
    blockface,
    geocoded.mar.latitude,
    geocoded.mar.longitude,
  );

  // ---------- 2. Curb reference (the line-is-not-the-curb correction) ----------
  // Sample around the frontage (where the structure lives) rather than
  // the whole block — corner curb returns would pollute the estimate.

  const frontage = eligibility.frontage;
  // Three independent fetches: the curb layer (offset correction), the
  // owner lot (cover-sheet SSL), and vicinity streets (cover-sheet map).
  // None depends on another — run them concurrently like prescreen does.
  const [curbPaths, ownerLot, vicinity] = await Promise.all([
    fetchCurbPathsNear(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchOwnerLotAtPoint(geocoded.mar.latitude, geocoded.mar.longitude),
    fetchVicinityStreets(geocoded.mar.latitude, geocoded.mar.longitude),
  ]);
  const sampleLow = Math.max(0, frontage.startAlongBlockfaceFt - 60);
  const sampleHigh = Math.min(
    blockfaceLengthFt,
    frontage.endAlongBlockfaceFt + 60,
  );
  const sampleStations: number[] = [];
  for (let s = sampleLow; s <= sampleHigh; s += 10) sampleStations.push(s);
  const curbOffsetFt = estimateCurbOffsetFt(
    blockface,
    frame,
    curbPaths,
    sampleStations,
  );
  const curbReference: SiteContext["curbReference"] =
    curbOffsetFt != null
      ? { offsetFt: curbOffsetFt, source: "planimetric" }
      : { offsetFt: 0, source: "unavailable" };

  /** Project lat/lon → {stationFt, offsetFt-from-CURB}. */
  const toPlan = (lat: number, lon: number): StationedPoint => {
    const p = frame.toPlan(lat, lon);
    return { stationFt: p.stationFt, offsetFt: p.offsetFt + curbReference.offsetFt };
  };

  // ---------- 3. Building footprint ring → station/offset ----------

  const footprint = geocoded.buildingFootprint;
  let buildingRing: StationedPoint[] | null = null;
  if (footprint && footprint.ring.length >= 3) {
    buildingRing = footprint.ring.map(([lon, lat]) => toPlan(lat!, lon!));
  }

  // Curb-to-façade: the closest sidewalk-side ring vertex within the
  // frontage window IS the front wall. (Vertices outside the window are
  // cross-street wings or rear geometry — same filtering rationale as
  // frontageWindowFromFootprint in envelope.ts.)
  let facadeOffsetFt: number | null = null;
  if (buildingRing) {
    const frontVertices = buildingRing.filter(
      (v) =>
        v.offsetFt < 0 &&
        v.stationFt >= frontage.startAlongBlockfaceFt - 2 &&
        v.stationFt <= frontage.endAlongBlockfaceFt + 2,
    );
    if (frontVertices.length > 0) {
      facadeOffsetFt = Math.min(
        ...frontVertices.map((v) => Math.abs(v.offsetFt)),
      );
    }
  }

  // ---------- 4. Curb features → plan points ----------

  const meters: MeterOnPlan[] = [];
  for (const meter of curbFeatures.parkingMeters) {
    const p = toPlan(meter.location.latitude, meter.location.longitude);
    if (Math.abs(p.offsetFt) > SAME_SIDE_MAX_OFFSET_FT) continue;
    meters.push({
      ...p,
      meterId:
        typeof meter.metadata.meterId === "string"
          ? meter.metadata.meterId
          : null,
      spaces:
        typeof meter.metadata.spaces === "number"
          ? meter.metadata.spaces
          : null,
      policy:
        typeof meter.metadata.policy === "string"
          ? meter.metadata.policy
          : null,
    });
  }

  const hydrants: HydrantOnPlan[] = [];
  for (const hyd of curbFeatures.fireHydrants) {
    const p = toPlan(hyd.location.latitude, hyd.location.longitude);
    if (Math.abs(p.offsetFt) > SAME_SIDE_MAX_OFFSET_FT) continue;
    hydrants.push({
      ...p,
      assetNum:
        typeof hyd.metadata.assetNum === "string"
          ? hyd.metadata.assetNum
          : null,
    });
  }

  const trees: TreeOnPlan[] = [];
  for (const tree of curbFeatures.streetTrees) {
    const p = toPlan(tree.location.latitude, tree.location.longitude);
    if (Math.abs(p.offsetFt) > CURBSIDE_TREE_MAX_OFFSET_FT) continue;
    const rawL = tree.metadata.treeBoxLengthFt;
    const rawW = tree.metadata.treeBoxWidthFt;
    const boxL =
      typeof rawL === "number" && rawL > 0 && rawL < TREE_BOX_SENTINEL
        ? rawL
        : null;
    const boxW =
      typeof rawW === "number" && rawW > 0 && rawW < TREE_BOX_SENTINEL
        ? rawW
        : null;
    trees.push({
      ...p,
      commonName:
        typeof tree.metadata.commonName === "string"
          ? tree.metadata.commonName
          : null,
      boxLengthFt: boxL,
      boxWidthFt: boxW,
      boxIsUnknown: boxL == null || boxW == null,
    });
  }

  const simplePoints = (
    features: Array<{ location: { latitude: number; longitude: number } }>,
  ): StationedPoint[] =>
    features
      .map((f) => toPlan(f.location.latitude, f.location.longitude))
      .filter((p) => Math.abs(p.offsetFt) <= SAME_SIDE_MAX_OFFSET_FT);

  const loadingZones: LabeledPoint[] = curbFeatures.loadingZones
    .map((lz) => ({
      ...toPlan(lz.location.latitude, lz.location.longitude),
      label:
        typeof lz.metadata.lzId === "string" || typeof lz.metadata.lzId === "number"
          ? `LZ ${lz.metadata.lzId}`
          : "LZ",
    }))
    .filter((p) => Math.abs(p.offsetFt) <= SAME_SIDE_MAX_OFFSET_FT);

  // Crosswalks live IN the roadway (their point is the crosswalk
  // center), so the same-side cutoff doesn't apply — accept anything
  // from just behind the curb to the far side of the street.
  const crosswalks: StationedPoint[] = curbFeatures.crosswalks
    .map((xw) => toPlan(xw.location.latitude, xw.location.longitude))
    .filter((p) => p.offsetFt > -10 && p.offsetFt < 60);

  // ---------- 5. Assemble ----------

  return {
    blockfaceLengthFt,
    blockName: geocoded.block.blockName,
    fromStreet: geocoded.block.fromStreet,
    toStreet: geocoded.block.toStreet,
    curbReference,
    rightOfWay: {
      facadeOffsetFt,
      sidewalkInboundRaw: geocoded.block.sidewalkWidthInboundRaw,
      sidewalkInboundFt: geocoded.block.sidewalkWidthInboundFt,
      sidewalkOutboundRaw: geocoded.block.sidewalkWidthOutboundRaw,
      sidewalkOutboundFt: geocoded.block.sidewalkWidthOutboundFt,
      parkingLaneWidthFt: geocoded.block.parkingLaneWidthPerSideFt ?? 8,
      travelLaneCount: geocoded.block.totalTravelLanes,
      travelLaneWidthEachFt: geocoded.block.travelLaneWidthEachFt,
      hasBikeLane: curbFeatures.bicycleLanes.length > 0,
    },
    building: {
      ring: buildingRing,
      assumed: buildingRing == null,
      captureLabel: captureLabel(footprint?.capturedAt),
      addressLabel: geocoded.mar.fullAddress,
    },
    frontage: {
      startFt: frontage.startAlongBlockfaceFt,
      endFt: frontage.endAlongBlockfaceFt,
      source: frontage.source,
    },
    meters,
    hydrants,
    trees,
    driveways: simplePoints(curbFeatures.driveways),
    adaRamps: simplePoints(curbFeatures.adaCurbRamps),
    busStops: simplePoints(curbFeatures.busStops),
    loadingZones,
    crosswalks,
    civic: {
      wardId: geocoded.block.wardId,
      ancId: geocoded.block.ancId,
      ssl: ownerLot?.ssl ?? null,
    },
    vicinity,
    northAngleDeg: frame.northAngleDeg,
  };
}

function captureLabel(capturedAtMs: number | null | undefined): string | null {
  if (!capturedAtMs) return null;
  const d = new Date(capturedAtMs);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `captured ${d.getFullYear()}-${month}`;
}
