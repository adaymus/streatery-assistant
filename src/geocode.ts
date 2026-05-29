/**
 * The geocoding pipeline: address -> structured road-network identifiers.
 *
 *   1. MAR Geocoder      -> MAR_ID, lat/lon, normalized address, confidence
 *   2. Address Points    -> BLOCKKEY, ROUTEID
 *   3. Roadway Block     -> address ranges, speed, class, parking lane, etc.
 *   4. Roadway Blockface -> BLOCKFACEKEY + curb polyline geometry
 *
 * Plus side-of-street derivation (Right/Left) from address parity and range
 * checks against the Roadway Block result.
 *
 * The top-level export is `geocodeAddress()`, which runs the full pipeline
 * and returns one bundled object that downstream curbside-data fetchers
 * (loading zones, hydrants, meters, etc.) can read from.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import {
  fetchBuildingFootprint,
  type BuildingFootprintResult,
} from "./buildingFootprint.js";

// ---------- Types ----------

export type Side = "Right" | "Left";

export interface MarResult {
  marId: number;
  fullAddress: string;
  streetNumber: number;
  latitude: number;
  longitude: number;
  confidenceScore: number; // 0-100, where 100 means exact match
}

export interface AddressPointResult {
  blockKey: string;
  routeId: string;
  subBlockKey: string | null;
}

export interface RoadwayBlockResult {
  blockName: string; // e.g. "3100 - 3145 BLOCK OF MOUNT PLEASANT STREET NW"
  fromStreet: string; // bounding cross street on the low-address end
  toStreet: string; //   bounding cross street on the high-address end
  // Route measure (mile/foot offset along the parent route) bounding this
  // block. Lets us filter point-on-route features (like parking meters) to
  // exactly this block via MEASURE BETWEEN fromMeasure AND toMeasure.
  fromMeasure: number | null;
  toMeasure: number | null;
  addressRangeRightLow: number;
  addressRangeRightHigh: number;
  addressRangeLeftLow: number;
  addressRangeLeftHigh: number;
  speedLimitMph: number | null;
  functionalClassFhwa: number | null;
  functionalClassDc: number | null;
  parkingLaneWidthPerSideFt: number | null;
  totalParkingLanes: number | null;
  hasBusLane: boolean;
  wardId: string | null;
  ancId: string | null;
}

export interface BlockfaceResult {
  blockfaceKey: string;
  geometry: unknown; // raw ArcGIS polyline (WGS84); we'll model this later
  vertexCount: number;
  // Combined route-measure range across the stitched sub-segments (in
  // meters — these align with Roadway Block FROMMEASURE/TOMEASURE).
  // Used to clip the polyline to the block's section so the geometry's
  // endpoints correspond to the actual cross-street intersections.
  combinedMeasFrom: number | null;
  combinedMeasTo: number | null;
}

/**
 * The full result of geocoding an address. Bundles every field a downstream
 * curbside-data fetcher might need so they can take one argument instead of
 * five.
 */
export interface GeocodedAddress {
  query: string; // the raw address the caller passed in
  mar: MarResult;
  addressPoint: AddressPointResult;
  block: RoadwayBlockResult;
  side: Side;
  blockface: BlockfaceResult;
  /**
   * Building polygon containing the address point, sourced from DC's
   * Building Footprints layer. Null when the address point doesn't
   * fall inside any building polygon (rare for restaurants, but
   * happens for addresses in alleys or the public right-of-way).
   *
   * Important: corner buildings span multiple addresses. The same
   * polygon may be returned for several MAR addresses.
   */
  buildingFootprint: BuildingFootprintResult | null;
}

// ---------- Step 1: MAR Geocoder ----------

// MAR geocoder base path. In Node (CLI scripts) we hit citizen-atlas
// directly. In the browser, citizen-atlas doesn't send CORS headers, so
// we go through the Vite proxy / production proxy at `/api/mar/...`.
const MAR_BASE =
  typeof window === "undefined"
    ? "https://citizenatlas.dc.gov/newwebservices/locationverifier.asmx"
    : "/api/mar";

export async function geocodeWithMar(rawAddress: string): Promise<MarResult> {
  // DC's Master Address Repository (MAR) geocoder. findLocation2 does the
  // fuzzy work: normalizes "Mt" -> "MOUNT", fills missing quadrants, and
  // ranks candidates by confidence (0-100).
  const url =
    `${MAR_BASE}/findLocation2?` + buildQuery({ str: rawAddress, f: "json" });

  const raw = (await fetchJson(url)) as {
    returnDataset?: {
      Table1?: Array<{
        MARID?: number;
        FULLADDRESS?: string;
        ADDRNUM?: number;
        LATITUDE?: number;
        LONGITUDE?: number;
        // PascalCase, unlike the rest of the response. Verified against the
        // live API — see CLAUDE.md addendum corrections table.
        ConfidenceLevel?: number;
      }>;
    };
  };

  const best = (raw.returnDataset?.Table1 ?? [])[0];
  if (!best || best.MARID == null) {
    throw new Error(
      `MAR geocoder returned no candidates for "${rawAddress}". ` +
        `Raw response (truncated): ${JSON.stringify(raw).slice(0, 300)}`,
    );
  }

  return {
    marId: best.MARID,
    fullAddress: best.FULLADDRESS ?? rawAddress,
    streetNumber: best.ADDRNUM ?? 0,
    latitude: best.LATITUDE ?? 0,
    longitude: best.LONGITUDE ?? 0,
    confidenceScore: best.ConfidenceLevel ?? 0,
  };
}

// ---------- Step 2: Address Points ----------

export async function fetchAddressPoint(
  marId: number,
): Promise<AddressPointResult> {
  // Address Points (FeatureServer layer 0) has every addressable point in DC
  // with the road-network keys attached.
  const url =
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Location_WebMercator/FeatureServer/0/query?" +
    buildQuery({
      where: `MAR_ID = ${marId}`,
      outFields: "MAR_ID,BLOCKKEY,SUBBLOCKKEY,ROUTEID",
      returnGeometry: "false",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        BLOCKKEY?: string;
        SUBBLOCKKEY?: string;
        ROUTEID?: string | number;
      };
    }>;
  };

  const attrs = raw.features?.[0]?.attributes;
  if (!attrs?.BLOCKKEY || attrs.ROUTEID == null) {
    throw new Error(
      `Address Points lookup found no record for MAR_ID ${marId}. ` +
        `Raw response (truncated): ${JSON.stringify(raw).slice(0, 300)}`,
    );
  }

  return {
    blockKey: attrs.BLOCKKEY,
    routeId: String(attrs.ROUTEID),
    subBlockKey: attrs.SUBBLOCKKEY ?? null,
  };
}

// ---------- Step 3: Roadway Block ----------

export async function fetchRoadwayBlock(
  blockKey: string,
): Promise<RoadwayBlockResult> {
  // BLOCKKEY uniquely identifies one block segment. Layer 163 carries
  // everything we need at the block level: speed, functional class, parking
  // lanes, address ranges per side, bus lanes, and civic context.
  const url =
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/163/query?" +
    buildQuery({
      where: `BLOCKKEY = '${blockKey}'`,
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{ attributes?: Record<string, unknown> }>;
  };

  const attrs = raw.features?.[0]?.attributes;
  if (!attrs) {
    throw new Error(
      `Roadway Block lookup found no record for BLOCKKEY '${blockKey}'`,
    );
  }

  // ArcGIS occasionally returns numeric fields as strings. Coerce safely and
  // return null for non-numeric values so callers can distinguish "missing"
  // from "zero" downstream.
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null => {
    if (v == null || v === "None" || v === "") return null;
    return String(v);
  };

  // Speed limit is split by direction. For a streatery we just need "what's
  // the speed on this block" — coalesce both directions (they're nearly
  // always equal on a city street).
  const speedLimit =
    num(attrs.SPEEDLIMITS_OB) ??
    num(attrs.SPEEDLIMITS_IB) ??
    num(attrs.SPEEDLIMITS_OB_ALT) ??
    num(attrs.SPEEDLIMITS_IB_ALT);

  // TOTALPARKINGLANEWIDTH is the SUM across both sides. Per-side is what
  // matters for streatery sizing.
  const totalParkingWidth = num(attrs.TOTALPARKINGLANEWIDTH);
  const totalParkingLanes = num(attrs.TOTALPARKINGLANES);
  const parkingLaneWidthPerSide =
    totalParkingWidth != null &&
    totalParkingLanes != null &&
    totalParkingLanes > 0
      ? totalParkingWidth / totalParkingLanes
      : null;

  const busLaneIb = attrs.BUSLANE_INBOUND;
  const busLaneOb = attrs.BUSLANE_OUTBOUND;
  const hasBusLane =
    (busLaneIb != null && busLaneIb !== "None" && busLaneIb !== "") ||
    (busLaneOb != null && busLaneOb !== "None" && busLaneOb !== "");

  return {
    blockName: str(attrs.BLOCK_NAME) ?? "",
    fromStreet: str(attrs.FROMSTREET) ?? "",
    toStreet: str(attrs.TOSTREET) ?? "",
    fromMeasure: num(attrs.FROMMEASURE),
    toMeasure: num(attrs.TOMEASURE),
    addressRangeRightLow: num(attrs.ADDRESS_RANGE_RIGHT_LOW) ?? 0,
    addressRangeRightHigh: num(attrs.ADDRESS_RANGE_RIGHT_HIGH) ?? 0,
    addressRangeLeftLow: num(attrs.ADDRESS_RANGE_LEFT_LOW) ?? 0,
    addressRangeLeftHigh: num(attrs.ADDRESS_RANGE_LEFT_HIGH) ?? 0,
    speedLimitMph: speedLimit,
    functionalClassFhwa: num(attrs.FHWAFUNCTIONALCLASS),
    functionalClassDc: num(attrs.DCFUNCTIONALCLASS),
    parkingLaneWidthPerSideFt: parkingLaneWidthPerSide,
    totalParkingLanes,
    hasBusLane,
    wardId: str(attrs.WARD_ID),
    ancId: str(attrs.ANC_ID),
  };
}

// ---------- Side-of-street derivation ----------

/**
 * Determine which side of the street a building number falls on.
 *
 * Primary test: is the number inside exactly one of the Right/Left address
 * ranges? Fallback: address parity. The fallback exists because DC's address
 * ranges occasionally overlap — see CLAUDE.md addendum for an example on
 * the 3140 block of Mt Pleasant St.
 *
 * Note: Right/Left here is relative to the route's digitizing direction —
 * compass direction (E/W/N/S) requires the side-mapping module.
 */
export function deriveSide(
  streetNumber: number,
  block: RoadwayBlockResult,
): Side {
  const inRight =
    streetNumber >= block.addressRangeRightLow &&
    streetNumber <= block.addressRangeRightHigh;
  const inLeft =
    streetNumber >= block.addressRangeLeftLow &&
    streetNumber <= block.addressRangeLeftHigh;

  if (inRight && !inLeft) return "Right";
  if (inLeft && !inRight) return "Left";

  // Both or neither range matches — fall back to parity. Mt Pleasant
  // convention: odd = Right (East). Re-verify before generalizing.
  return streetNumber % 2 === 1 ? "Right" : "Left";
}

// ---------- Step 4: Roadway Blockface ----------

export async function fetchBlockface(
  routeId: string,
  side: Side,
  latitude: number,
  longitude: number,
  blockFromMeasure: number | null,
  blockToMeasure: number | null,
): Promise<BlockfaceResult> {
  // IMPORTANT: layer 164 stores blockfaces as short curb sub-segments —
  // not one record per "block side." A single block side typically
  // comprises 2-5 sub-segments split at curb breaks (driveways, geometry
  // changes). Their MEAS_FROM/MEAS_TO are in route meters (not feet) and
  // align numerically with Roadway Block's FROMMEASURE/TOMEASURE.
  //
  // To get the full block side (so the polyline's endpoints actually ARE
  // the bounding intersections), we:
  //   1. Spatial query: find blockface candidates near the building
  //   2. Filter to those whose MEAS range overlaps the parent block
  //   3. Sort by MEAS_FROM and stitch their polylines head-to-tail
  //
  // outSR=4326 gives back WGS84 lat/lon directly (default is Web Mercator),
  // saving a coordinate transform later when we hand off to Turf.js.
  const bbox = bboxAroundPoint(latitude, longitude, 250);
  const url =
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/164/query?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      where: `ROUTEID = '${routeId}' AND SIDE = '${side}'`,
      outFields: "BLOCKFACEKEY,SIDE,MEAS_FROM,MEAS_TO",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        BLOCKFACEKEY?: string;
        MEAS_FROM?: number;
        MEAS_TO?: number;
      };
      geometry?: { paths?: number[][][] };
    }>;
  };

  const candidates = raw.features ?? [];
  if (candidates.length === 0) {
    throw new Error(
      `Blockface lookup found no record near (${latitude}, ${longitude}) for ROUTEID '${routeId}' SIDE '${side}'`,
    );
  }

  // Filter to candidates whose MEAS range overlaps the block. If we can't
  // filter (missing measures), fall back to all candidates and let the
  // proximity sort handle it.
  let matching = candidates;
  if (blockFromMeasure != null && blockToMeasure != null) {
    const overlapping = candidates.filter((c) => {
      const m = c.attributes;
      if (m?.MEAS_FROM == null || m.MEAS_TO == null) return false;
      // Two ranges overlap iff each starts before the other ends.
      return m.MEAS_FROM < blockToMeasure && m.MEAS_TO > blockFromMeasure;
    });
    if (overlapping.length > 0) matching = overlapping;
  }

  // Sort by MEAS_FROM so adjacent segments end up in route order — required
  // for clean head-to-tail concatenation.
  matching = [...matching].sort(
    (a, b) => (a.attributes?.MEAS_FROM ?? 0) - (b.attributes?.MEAS_FROM ?? 0),
  );

  // Stitch all matching sub-segments into one combined polyline. If the
  // last vertex of one segment equals the first vertex of the next, drop
  // the duplicate to keep the line continuous.
  const combinedPath: number[][] = [];
  for (const c of matching) {
    const path = c.geometry?.paths?.[0];
    if (!path || path.length === 0) continue;
    if (combinedPath.length === 0) {
      combinedPath.push(...path);
      continue;
    }
    const lastPt = combinedPath[combinedPath.length - 1]!;
    const firstPt = path[0]!;
    const isContinuous =
      lastPt[0] === firstPt[0] && lastPt[1] === firstPt[1];
    combinedPath.push(...(isContinuous ? path.slice(1) : path));
  }

  // The "primary" blockface key is the one whose midpoint is closest to
  // the building — used for hydrant queries (which join by BLOCKFACEKEY).
  // Hydrants on adjacent sub-segments of the same block side won't be
  // queried, but in practice they'd be outside the frontage window anyway.
  let primary = matching[0]!;
  let bestDistSq = Infinity;
  for (const c of matching) {
    const path = c.geometry?.paths?.[0];
    if (!path || path.length < 2) continue;
    const mid = path[Math.floor(path.length / 2)] ?? path[0]!;
    const dLat = (mid[1] ?? 0) - latitude;
    const dLon = (mid[0] ?? 0) - longitude;
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      primary = c;
    }
  }

  if (!primary.attributes?.BLOCKFACEKEY) {
    throw new Error(
      `Blockface candidate missing BLOCKFACEKEY for ROUTEID '${routeId}' SIDE '${side}'`,
    );
  }

  // Combined MEAS range across all stitched sub-segments. Some blockfaces
  // are short (per-block) and some span multiple blocks; the envelope
  // module uses these to clip the polyline to the building's actual block.
  const measFromValues = matching
    .map((c) => c.attributes?.MEAS_FROM)
    .filter((v): v is number => typeof v === "number");
  const measToValues = matching
    .map((c) => c.attributes?.MEAS_TO)
    .filter((v): v is number => typeof v === "number");
  const combinedMeasFrom =
    measFromValues.length > 0 ? Math.min(...measFromValues) : null;
  const combinedMeasTo =
    measToValues.length > 0 ? Math.max(...measToValues) : null;

  return {
    blockfaceKey: primary.attributes.BLOCKFACEKEY,
    geometry: { paths: [combinedPath] },
    vertexCount: combinedPath.length,
    combinedMeasFrom,
    combinedMeasTo,
  };
}

// ---------- Top-level orchestration ----------

/**
 * Run the full 4-call pipeline for an address. The returned object bundles
 * every identifier and attribute the downstream curbside-data fetchers need.
 *
 * This is the function the UI and the prescreen orchestrator both call.
 */
export async function geocodeAddress(
  rawAddress: string,
): Promise<GeocodedAddress> {
  const mar = await geocodeWithMar(rawAddress);
  const addressPoint = await fetchAddressPoint(mar.marId);
  const block = await fetchRoadwayBlock(addressPoint.blockKey);
  const side = deriveSide(mar.streetNumber, block);
  // Building footprint + blockface run in parallel — they're
  // independent network calls and both depend only on address point
  // info that's already resolved.
  const [blockface, buildingFootprint] = await Promise.all([
    fetchBlockface(
      addressPoint.routeId,
      side,
      mar.latitude,
      mar.longitude,
      block.fromMeasure,
      block.toMeasure,
    ),
    fetchBuildingFootprint(mar.latitude, mar.longitude),
  ]);

  return {
    query: rawAddress,
    mar,
    addressPoint,
    block,
    side,
    blockface,
    buildingFootprint,
  };
}
