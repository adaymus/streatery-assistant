/**
 * Driveway curb cuts fetcher.
 *
 * RESOLVES SPEC DATA GAP: the spec lists "driveway curb cuts" as a
 * confirmed data gap requiring a mandatory site walk caveat. The actual
 * dataset exists at `Transportation_ADA_WebMercator/MapServer/4` — labeled
 * "American with Disabilities Act - Driveway" but it's the vehicle-driveway
 * inventory we need for the 25 ft curb-cut buffer.
 *
 * Layer: `Transportation_ADA_WebMercator/MapServer/4`.
 * Tier 4 (bbox spatial). Same pattern as curb ramps and trees.
 *
 * Buffer per DDOT Section 3: 25 ft from any driveway/curb cut. This is the
 * largest buffer in the table, so even one driveway near the frontage can
 * eliminate the buildable envelope.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import type { CurbFeature } from "./curbFeatures.js";

const DRIVEWAYS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_ADA_WebMercator/MapServer/4/query";

export async function fetchDrivewaysNear(
  latitude: number,
  longitude: number,
  // 25 ft buffer + some slack to catch driveways at the edge of the
  // envelope. 200 ft is plenty for the largest viable streatery.
  radiusFt = 200,
): Promise<CurbFeature[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    DRIVEWAYS_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "GIS_ID,STREETSEGID,CONDITION,STATUS,YEAR_INSPECTED",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        GIS_ID?: string;
        STREETSEGID?: number;
        CONDITION?: string;
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
      // Note: we reuse the curb-cut concept under the existing curb-ramp
      // type since the eligibility logic treats them similarly (both
      // represent breaks in the parking lane). The metadata.subtype lets
      // downstream code differentiate.
      return {
        type: "ada_curb_ramp" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          subtype: "driveway", // distinguishes from pedestrian curb ramps
          gisId: attrs.GIS_ID ?? null,
          streetSegmentId: attrs.STREETSEGID ?? null,
          condition: attrs.CONDITION ?? null,
          status: attrs.STATUS ?? null,
          yearInspected: attrs.YEAR_INSPECTED ?? null,
        },
      };
    });
}
