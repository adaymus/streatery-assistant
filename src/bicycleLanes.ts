/**
 * Bicycle Lanes fetcher.
 *
 * Layer: `Transportation_Bikes_Trails_WebMercator/MapServer/2`.
 * Join: BLOCKKEY (Tier 2).
 *
 * Key field for streatery eligibility: `BIKELANE_PARKINGLANE_ADJACENT`.
 * If a bike lane runs alongside the parking lane on this block, that's a
 * configuration where a streatery (which occupies the parking lane) would
 * block the bike lane — a disqualifier per DDOT guidelines.
 *
 * Other bike-lane configurations on the block (e.g., a protected lane
 * separate from the parking lane) are NOT necessarily disqualifying — we
 * surface them as context but the eligibility engine decides.
 */

import { fetchJson, buildQuery } from "./http.js";
import type { CurbFeature } from "./curbFeatures.js";

const BIKE_LANES_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Bikes_Trails_WebMercator/MapServer/2/query";

export async function fetchBicycleLanesOnBlock(
  blockKey: string,
): Promise<CurbFeature[]> {
  const url =
    BIKE_LANES_URL +
    "?" +
    buildQuery({
      where: `BLOCKKEY = '${blockKey}'`,
      outFields:
        "ROUTENAME,STREETNAME,BIKELANE_PARKINGLANE_ADJACENT,BIKELANE_THROUGHLANE_ADJACENT,BIKELANE_PROTECTED,BIKELANE_BUFFERED,BIKELANE_CONVENTIONAL,BIKELANE_CONTRAFLOW,TOTALBIKELANES,TOTALBIKELANEWIDTH",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: Record<string, unknown>;
      // Polyline geometry — paths is an array of paths, each an array of
      // [lon, lat] pairs. We pick the midpoint as a representative location.
      geometry?: { paths?: number[][][] };
    }>;
  };

  // Helper: is a string attribute populated (not null/None/empty)?
  const populated = (v: unknown): boolean =>
    v != null && v !== "None" && v !== "";

  return (raw.features ?? []).map((feature) => {
    const attrs = feature.attributes ?? {};

    // Use the midpoint of the first path as a representative location.
    // Bike lane polylines tend to be simple (one path per block), so this
    // is a reasonable proxy. The eligibility engine will use the full
    // geometry for proper distance checks.
    const path = feature.geometry?.paths?.[0] ?? [];
    const midIndex = Math.floor(path.length / 2);
    const midpoint = path[midIndex] ?? [0, 0];
    const lon = midpoint[0] ?? 0;
    const lat = midpoint[1] ?? 0;

    return {
      type: "bicycle_lane" as const,
      location: { latitude: lat, longitude: lon },
      metadata: {
        streetName: attrs.STREETNAME ?? null,
        // This is the disqualifier-relevant field. If "Y" or similar, the
        // bike lane sits next to the parking lane — a streatery on that
        // parking lane would block it.
        adjacentToParkingLane: populated(attrs.BIKELANE_PARKINGLANE_ADJACENT),
        adjacentToThroughLane: populated(attrs.BIKELANE_THROUGHLANE_ADJACENT),
        // Type indicators — useful UI context.
        isProtected: populated(attrs.BIKELANE_PROTECTED),
        isBuffered: populated(attrs.BIKELANE_BUFFERED),
        isConventional: populated(attrs.BIKELANE_CONVENTIONAL),
        isContraflow: populated(attrs.BIKELANE_CONTRAFLOW),
        totalLanes: attrs.TOTALBIKELANES ?? null,
        totalWidthFt: attrs.TOTALBIKELANEWIDTH ?? null,
        // Full polyline geometry — useful for map visualization and proper
        // distance-to-envelope checks. Surfaced through metadata so we
        // don't have to thread geometry into the CurbFeature type itself.
        geometry: feature.geometry ?? null,
      },
    };
  });
}
