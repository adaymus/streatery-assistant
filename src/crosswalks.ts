/**
 * Crosswalks fetcher.
 *
 * RESOLVES SPEC DATA GAP: spec called crosswalks a confirmed data gap
 * requiring a site walk. The Pavement Marking dataset
 * (`Transportation_Traffic_Calming_WebMercator/MapServer/96`) contains
 * crosswalk locations as point features. Filter by
 * `MARKINGDETAIL IN (3, 4, 5)` (Standard, Diagonal, Longitudinal).
 *
 * Tier 4 (bbox spatial). Buffer per DDOT Section 3: 10 ft from any
 * crosswalk.
 *
 * 16,117 crosswalk records citywide; 152 in the Mt Pleasant area.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import type { CurbFeature } from "./curbFeatures.js";

const PAVEMENT_MARKINGS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Traffic_Calming_WebMercator/MapServer/96/query";

// MARKINGDETAIL codes for crosswalks (per spec addendum):
//   3 = Standard
//   4 = Diagonal
//   5 = Longitudinal
const CROSSWALK_MARKING_DETAILS = [3, 4, 5] as const;

export async function fetchCrosswalksNear(
  latitude: number,
  longitude: number,
  radiusFt = 150,
): Promise<CurbFeature[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    PAVEMENT_MARKINGS_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      where: `MARKINGDETAIL IN (${CROSSWALK_MARKING_DETAILS.join(",")})`,
      outFields:
        "MARKINGID,MARKINGTYPE,MARKINGDETAIL,MARKINGCONDITION,STREETJUNCTIONID,COMMENTS",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        MARKINGID?: number;
        MARKINGTYPE?: number;
        MARKINGDETAIL?: number;
        MARKINGCONDITION?: number;
        STREETJUNCTIONID?: number;
        COMMENTS?: string;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  // Map the integer MARKINGDETAIL code to a human-readable label so
  // downstream UIs don't have to repeat the lookup table.
  const detailLabel = (code: number | undefined): string => {
    switch (code) {
      case 3:
        return "standard";
      case 4:
        return "diagonal";
      case 5:
        return "longitudinal";
      default:
        return "unknown";
    }
  };

  return (raw.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
    .map((feature) => {
      const attrs = feature.attributes ?? {};
      return {
        type: "crosswalk" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          markingId: attrs.MARKINGID ?? null,
          markingType: attrs.MARKINGTYPE ?? null,
          detail: detailLabel(attrs.MARKINGDETAIL),
          detailCode: attrs.MARKINGDETAIL ?? null,
          condition: attrs.MARKINGCONDITION ?? null,
          junctionId: attrs.STREETJUNCTIONID ?? null,
          comments: attrs.COMMENTS ?? null,
        },
      };
    });
}
