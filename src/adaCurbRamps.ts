/**
 * ADA Curb Ramps fetcher.
 *
 * Layer: `Transportation_ADA_WebMercator/MapServer/3`.
 * Tier 4 (bbox spatial). Pedestrian ramps at intersections — NOT vehicle
 * driveway curb cuts (those are a separate layer; see driveways.ts).
 *
 * Curb ramps anchor crosswalk locations and pedestrian flow. The DDOT
 * Section 3 buffer table doesn't list a specific ramp buffer, but they
 * generally indicate the presence of a crosswalk above (which gets a 10
 * ft buffer) and an intersection (20 ft buffer if no crosswalk).
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import type { CurbFeature } from "./curbFeatures.js";

const CURB_RAMPS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_ADA_WebMercator/MapServer/3/query";

export async function fetchAdaCurbRampsNear(
  latitude: number,
  longitude: number,
  radiusFt = 150,
): Promise<CurbFeature[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    CURB_RAMPS_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields:
        "GIS_ID,CONDITION,INTERSECTION_ID,STATUS,YEAR_INSPECTED",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        GIS_ID?: string;
        CONDITION?: string;
        INTERSECTION_ID?: number;
        STATUS?: number;
        YEAR_INSPECTED?: number;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  return (raw.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
    .map((feature) => {
      const attrs = feature.attributes ?? {};
      return {
        type: "ada_curb_ramp" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          gisId: attrs.GIS_ID ?? null,
          condition: attrs.CONDITION ?? null,
          intersectionId: attrs.INTERSECTION_ID ?? null,
          // STATUS is a coded integer (1=existing, etc — DDOT doesn't
          // document the codes publicly). Surface raw for downstream
          // inspection.
          status: attrs.STATUS ?? null,
          yearInspected: attrs.YEAR_INSPECTED ?? null,
        },
      };
    });
}
