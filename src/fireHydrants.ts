/**
 * Fire Hydrants fetcher.
 *
 * UPGRADED FROM SPEC: spec lists hydrants as Tier 2 (BLOCKKEY only,
 * geometric refinement needed). The actual layer
 * (`Public_Safety_WebMercator/MapServer/5`) carries `BLOCKFACEKEY`,
 * `BLOCKKEY`, `ROUTEID`, and `MEASURE`. We can join by BLOCKFACEKEY
 * directly — Tier 1 — which automatically excludes hydrants on the
 * opposite side of the street.
 *
 * Buffer per DDOT Section 3: 10 ft from any hydrant.
 */

import { fetchJson, buildQuery } from "./http.js";
import type { CurbFeature } from "./curbFeatures.js";

const HYDRANTS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Safety_WebMercator/MapServer/5/query";

export async function fetchHydrantsOnBlockface(
  blockfaceKey: string,
): Promise<CurbFeature[]> {
  const url =
    HYDRANTS_URL +
    "?" +
    buildQuery({
      where: `BLOCKFACEKEY = '${blockfaceKey}'`,
      outFields:
        "ASSETNUM,DESCRIPTION,LOCATIONDETAIL,INSERVICE,BANDCOLOR,FLOW,MEASURE,BLOCKFACEKEY",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        ASSETNUM?: string;
        DESCRIPTION?: string;
        LOCATIONDETAIL?: string;
        INSERVICE?: string;
        BANDCOLOR?: string;
        FLOW?: number;
        MEASURE?: number;
        BLOCKFACEKEY?: string;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  return (raw.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
    .map((feature) => {
      const attrs = feature.attributes ?? {};
      // Geometry comes back in WGS84 (we asked for outSR=4326), so x=longitude,
      // y=latitude. ArcGIS uses x/y while geographers usually say lon/lat —
      // remember: x is east-west, y is north-south, always.
      return {
        type: "fire_hydrant" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          assetNum: attrs.ASSETNUM ?? null,
          description: attrs.DESCRIPTION ?? null,
          locationDetail: attrs.LOCATIONDETAIL ?? null,
          // INSERVICE is "Y"/"N". Out-of-service hydrants still occupy space
          // and still need the buffer (someone has to repair them), so we
          // don't filter them out here — just surface the status.
          inService: attrs.INSERVICE === "Y",
          // AWWA color code indicating flow capacity (red < 500 gpm, etc).
          // Useful UI context but not part of buffer logic.
          bandColor: attrs.BANDCOLOR ?? null,
          flowGpm: attrs.FLOW ?? null,
        },
      };
    });
}
