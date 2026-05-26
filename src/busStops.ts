/**
 * Metro Bus Stops fetcher.
 *
 * Layer: `Transportation_Rail_Bus_WebMercator/MapServer/53`.
 * Join: BLOCKKEY (Tier 2). Native `BLOCKKEY` and `SUBBLOCKKEY` fields make
 * this an exceptionally clean join — schema is "designed for relating to
 * roadway data" per the spec.
 *
 * Buffer per DDOT Section 3: 15 ft from any bus zone.
 *
 * The fetcher returns stops on both sides of the street. Stops on the
 * opposite side don't constrain a streatery here, but the geometric
 * distance check in the eligibility engine handles that correctly.
 */

import { fetchJson, buildQuery } from "./http.js";
import type { CurbFeature } from "./curbFeatures.js";

const BUS_STOPS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Rail_Bus_WebMercator/MapServer/53/query";

export async function fetchBusStopsOnBlock(
  blockKey: string,
): Promise<CurbFeature[]> {
  const url =
    BUS_STOPS_URL +
    "?" +
    buildQuery({
      where: `BLOCKKEY = '${blockKey}'`,
      outFields: "REG_ID,BSTP_GEO_ID,AT_STR,ON_STR,BSTP_MSG_TEXT,SUBBLOCKKEY",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        REG_ID?: number;
        BSTP_GEO_ID?: number;
        AT_STR?: string; // cross street where the stop is
        ON_STR?: string; // street the stop is on
        BSTP_MSG_TEXT?: string;
        SUBBLOCKKEY?: string;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  return (raw.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
    .map((feature) => {
      const attrs = feature.attributes ?? {};
      return {
        type: "bus_stop" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          regionalId: attrs.REG_ID ?? null,
          stopGeoId: attrs.BSTP_GEO_ID ?? null,
          onStreet: attrs.ON_STR ?? null,
          atStreet: attrs.AT_STR ?? null,
          description: attrs.BSTP_MSG_TEXT ?? null,
          subBlockKey: attrs.SUBBLOCKKEY ?? null,
        },
      };
    });
}
