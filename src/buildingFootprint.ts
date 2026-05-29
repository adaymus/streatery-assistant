/**
 * Building Footprint fetcher.
 *
 * Layer: `Facility_and_Structure_WebMercator/MapServer/1` ("Building
 * Footprints"). DC's canonical building polygon layer, captured via
 * planimetric flyovers (most Mt Pleasant cohort buildings captured
 * 2015-04; some refresh captures as recent as 2023).
 *
 * The layer has NO address or MAR_ID fields — only geometry. To find
 * the building for an address, we feed the address point lat/lon as a
 * spatial query (`esriSpatialRelIntersects`) and the layer returns any
 * polygon that contains the point. In practice this is always 0 or 1
 * polygon — addresses inside building footprints return one, addresses
 * in the public right-of-way (rare for restaurants) return none.
 *
 * Note: corner buildings span multiple addresses. A spatial query for
 * 3155 Mount Pleasant and 1620 Lamont will return the SAME polygon —
 * that's correct (one building, two valid entrance addresses), not a
 * bug. Downstream code should treat the polygon as the building, not
 * as "the polygon for this exact address."
 */

import { fetchJson, buildQuery } from "./http.js";

const BUILDING_FOOTPRINTS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Facility_and_Structure_WebMercator/MapServer/1/query";

export interface BuildingFootprintResult {
  /** Polygon ring in WGS84: [[lon, lat], [lon, lat], ...]. Closed ring (first == last). */
  ring: number[][];
  /** Approximate footprint area in square feet, useful for sanity checks. */
  approximateAreaFt2: number;
  /** When DC captured this polygon (UNIX ms). Older captures may not reflect renovations. */
  capturedAt: number | null;
  /** "Building" for normal building footprints. */
  description: string | null;
}

/**
 * Find the building footprint that contains the given address point.
 * Returns null when the point isn't inside any building polygon (rare
 * for restaurants, but happens for addresses in alleys or right-of-way).
 */
export async function fetchBuildingFootprint(
  latitude: number,
  longitude: number,
): Promise<BuildingFootprintResult | null> {
  const url =
    BUILDING_FOOTPRINTS_URL +
    "?" +
    buildQuery({
      // ArcGIS accepts a point as "x,y" for spatial queries. Address
      // point goes in, polygon containing it comes out.
      geometry: `${longitude},${latitude}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FEATURECODE,DESCRIPTION,CAPTUREYEAR",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        FEATURECODE?: number;
        DESCRIPTION?: string;
        CAPTUREYEAR?: number;
      };
      geometry?: { rings?: number[][][] };
    }>;
  };

  const first = raw.features?.[0];
  const ring = first?.geometry?.rings?.[0];
  if (!ring || ring.length < 3) return null;

  return {
    ring,
    approximateAreaFt2: approximateRingAreaFt2(ring),
    capturedAt: first?.attributes?.CAPTUREYEAR ?? null,
    description: first?.attributes?.DESCRIPTION ?? null,
  };
}

/**
 * Shoelace formula on a WGS84 ring, converted to square feet using
 * flat-earth scale factors at the ring's centroid latitude. Accurate
 * to within ~0.1% for typical building-sized polygons.
 */
function approximateRingAreaFt2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  // Centroid latitude for the longitude scale factor.
  const meanLat =
    ring.reduce((sum, p) => sum + (p[1] ?? 0), 0) / ring.length;
  const FT_PER_DEG_LAT = 364_000;
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);

  let areaDeg2 = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i]?.[0] ?? 0;
    const y0 = ring[i]?.[1] ?? 0;
    const x1 = ring[i + 1]?.[0] ?? 0;
    const y1 = ring[i + 1]?.[1] ?? 0;
    areaDeg2 += x0 * y1 - x1 * y0;
  }
  return (Math.abs(areaDeg2) / 2) * FT_PER_DEG_LAT * ftPerDegLon;
}
