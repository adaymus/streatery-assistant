/**
 * Curb edge fetcher (DC Planimetrics).
 *
 * Layer: `Planimetrics_2023/MapServer/3` ("Curb - 2023"). Tier 4 (bbox
 * spatial) — polyline geometry of the PHYSICAL curb face, no join keys.
 *
 * Why the drawing pipeline needs it: the Roadway Blockface polyline is
 * NOT the curb — it follows the route alignment ~15-25 ft street-ward
 * of the real curb (measured on Mt Pleasant's 3100 block, 2026-06-11).
 * Stations along the blockface are fine; perpendicular OFFSETS are not.
 * The Site Plan re-references offsets against these curb polylines so
 * "6 ft from the curb" on the sheet means the actual curb face.
 *
 * Returns raw polyline paths rather than CurbFeature points — a curb is
 * a line, and the consumer (planFrame.estimateCurbOffsetFt) wants the
 * segments, not a centroid.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";

const CURBS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Planimetrics_2023/MapServer/3/query";

/** Each path is a polyline of [lon, lat] vertices (WGS84). */
export async function fetchCurbPathsNear(
  latitude: number,
  longitude: number,
  radiusFt = 200,
): Promise<number[][][]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    CURBS_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OBJECTID",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{ geometry?: { paths?: number[][][] } }>;
  };

  return (raw.features ?? []).flatMap(
    (feature) => feature.geometry?.paths ?? [],
  );
}
