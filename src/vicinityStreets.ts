/**
 * Vicinity street fetcher — the G1.00 cover sheet's vicinity map.
 *
 * Layer: Roadway Block (Transportation 163), queried by envelope around
 * the address. Each block record carries its centerline geometry and a
 * BLOCK_NAME like "3100 - 3145 BLOCK OF MOUNT PLEASANT STREET NW", which
 * gives us both the polyline to draw and the street name to label.
 *
 * Geometry comes back already converted to LOCAL east/north feet
 * relative to the address point — the cover renderer just scales the
 * box; it never touches lat/lon.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";

const ROADWAY_BLOCK_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/163/query";

const FT_PER_DEG_LAT = 364_000;

export interface VicinityStreet {
  /** Street name parsed from BLOCK_NAME, e.g. "MOUNT PLEASANT STREET NW". */
  name: string;
  /** Centerline in local feet: x = east of the address, y = north of it. */
  path: Array<{ xFt: number; yFt: number }>;
}

export async function fetchVicinityStreets(
  latitude: number,
  longitude: number,
  radiusFt = 1000,
): Promise<VicinityStreet[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    ROADWAY_BLOCK_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "BLOCK_NAME",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: { BLOCK_NAME?: string };
      geometry?: { paths?: number[][][] };
    }>;
  };

  const ftPerDegLon =
    FT_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);

  const streets: VicinityStreet[] = [];
  for (const feature of raw.features ?? []) {
    const blockName = feature.attributes?.BLOCK_NAME ?? "";
    // "3100 - 3145 BLOCK OF MOUNT PLEASANT STREET NW" → the street name.
    // Records without the "BLOCK OF" form (rare) keep the full label.
    const name =
      blockName.match(/BLOCK OF (.+)$/)?.[1]?.trim() ?? blockName.trim();
    for (const path of feature.geometry?.paths ?? []) {
      if (path.length < 2) continue;
      streets.push({
        name,
        path: path.map(([lon, lat]) => ({
          xFt: (lon! - longitude) * ftPerDegLon,
          yFt: (lat! - latitude) * FT_PER_DEG_LAT,
        })),
      });
    }
  }
  return streets;
}
