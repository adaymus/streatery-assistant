/**
 * Owner lot (SSL) fetcher.
 *
 * Layer: `Property_and_Land_WebMercator/MapServer/40` ("Owner Polygons —
 * Common Ownership Layer"). Tier 4 (point-in-polygon) — same query
 * pattern as Building Footprints: the MAR address point falls inside
 * the tax lot polygon.
 *
 * Why the drawing pipeline wants it: the G1.00 cover sheet's project
 * data block lists Square-Suffix-Lot (the Queen's English cover does),
 * and the SSL is how DDOT/DOB cross-reference the property in TOPS and
 * ProjectDox.
 */

import { fetchJson, buildQuery } from "./http.js";

const OWNER_POLYGONS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40/query";

export interface OwnerLotResult {
  /** Normalized "SQUARE-LOT", e.g. "2596-0639". */
  ssl: string;
  /** The lot's premise address per the assessor — a cross-check against MAR. */
  premiseAddress: string | null;
}

export async function fetchOwnerLotAtPoint(
  latitude: number,
  longitude: number,
): Promise<OwnerLotResult | null> {
  const url =
    OWNER_POLYGONS_URL +
    "?" +
    buildQuery({
      geometry: JSON.stringify({
        x: longitude,
        y: latitude,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "SSL,PREMISEADD",
      returnGeometry: "false",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: { SSL?: string; PREMISEADD?: string };
    }>;
  };

  const attrs = raw.features?.[0]?.attributes;
  if (!attrs?.SSL) return null;

  // The layer pads SSL with internal spaces ("2596    0695") — normalize
  // to the SQUARE-LOT form people actually write.
  const parts = attrs.SSL.trim().split(/\s+/);
  const ssl = parts.length >= 2 ? `${parts[0]}-${parts[parts.length - 1]}` : parts[0]!;

  return {
    ssl,
    premiseAddress: attrs.PREMISEADD?.trim() ?? null,
  };
}
