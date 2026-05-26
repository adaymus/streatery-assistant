/**
 * Loading Zones fetcher.
 *
 * RECLASSIFIED FROM SPEC: the main spec lists Loading Zones as Tier 1
 * (BLOCKFACEKEY). In practice the DDOT/Parking/FeatureServer/0 layer has no
 * BLOCKFACEKEY field — its only road-network reference is a SEGID that
 * doesn't match the ROUTEID/BLOCKKEY scheme we use elsewhere. So this is
 * actually a Tier 4 (spatial bbox) dataset.
 *
 * Each loading zone is marked by 2-3 sign posts. We dedupe by LZ_ID so the
 * count reflects unique loading zones, not individual signs.
 *
 * The fetcher returns ALL loading zones inside the bbox; distance-to-envelope
 * filtering happens downstream in the eligibility engine.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import type { CurbFeature } from "./curbFeatures.js";

const LOADING_ZONE_SIGNS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DDOT/Parking/FeatureServer/0/query";

/**
 * Fetch loading zones near an address.
 *
 * `radiusFt` defaults to 200 — enough to cover the whole blockface plus
 * adjacent properties (for frontage-extension calculations later). The
 * eligibility engine will narrow this to the 10 ft buffer per Section 3 of
 * the DDOT guidelines.
 */
export async function fetchLoadingZonesNear(
  latitude: number,
  longitude: number,
  radiusFt = 200,
): Promise<CurbFeature[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  // ArcGIS spatial query parameters:
  //   geometry: the bbox we want to search inside
  //   geometryType: tells ArcGIS we're passing an envelope (rectangle)
  //   inSR: our bbox is in WGS84 (EPSG:4326)
  //   spatialRel: "intersects" means return any feature that touches the bbox
  //   outSR: ask for results back in WGS84 too (saves a coordinate transform)
  const url =
    LOADING_ZONE_SIGNS_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "LZ_ID,BLOCK,STREET,SIDEOFSTREET,NEARBYADDRESS,SIGNSTATUS",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        LZ_ID?: string;
        BLOCK?: string;
        STREET?: string;
        SIDEOFSTREET?: number;
        NEARBYADDRESS?: string;
        SIGNSTATUS?: number;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  const features = raw.features ?? [];

  // Signs come in pairs (start and end of each zone). Dedupe by LZ_ID so we
  // count unique loading zones. We keep the first sign's geometry as the
  // representative location; the eligibility engine can refine this later
  // by pulling the polyline from layer 6 if needed.
  const byLzId = new Map<string, CurbFeature>();
  for (const feature of features) {
    const lzId = feature.attributes?.LZ_ID;
    const x = feature.geometry?.x;
    const y = feature.geometry?.y;
    if (!lzId || x == null || y == null) continue;

    // SIGNSTATUS = 1 means active. Skip removed/inactive signs.
    if (feature.attributes?.SIGNSTATUS !== 1) continue;

    if (byLzId.has(lzId)) continue;

    byLzId.set(lzId, {
      type: "loading_zone",
      location: { latitude: y, longitude: x },
      metadata: {
        lzId,
        block: feature.attributes?.BLOCK ?? null,
        street: feature.attributes?.STREET ?? null,
        // SIDEOFSTREET is an undocumented integer code. Empirically on Mt
        // Pleasant Street: 1 = Right/East, 3 = Left/West. May differ on
        // streets with different digitizing directions — surface the raw
        // value so downstream code can decide.
        sideOfStreetCode: feature.attributes?.SIDEOFSTREET ?? null,
        nearbyAddress: feature.attributes?.NEARBYADDRESS ?? null,
      },
    });
  }

  return Array.from(byLzId.values());
}
