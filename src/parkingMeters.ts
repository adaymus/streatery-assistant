/**
 * Parking Meters fetcher.
 *
 * SIMPLIFIED FROM SPEC: the main spec classified meters as Tier 3 (address-
 * keyed: "{block_start} {street} {side}"). In practice the meters layer
 * (`DDOT/Parking/FeatureServer/8`) carries both `ROUTEID` and `SIDE`
 * (Right/Left) — exactly the same join we use for Roadway Blockface. So
 * meters are effectively Tier 1: query directly by ROUTEID + SIDE, no
 * address string parsing required.
 *
 * Block-level precision: filter by MEASURE between the block's FROMMEASURE
 * and TOMEASURE. Both layers use the same route-measure coordinate, so
 * this isolates the meters on exactly the restaurant's block.
 *
 * Per spec note: the architect uses the full meter list on a blockface,
 * not just those within the eventual envelope. We return all meters on the
 * relevant block + side without filtering by distance.
 */

import { fetchJson, buildQuery } from "./http.js";
import type { CurbFeature } from "./curbFeatures.js";
import type { Side } from "./geocode.js";

const METERS_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DDOT/Parking/FeatureServer/8/query";

/**
 * Fetch all parking meters on the given blockface.
 *
 * `fromMeasure`/`toMeasure` come from the Roadway Block result and constrain
 * the result to one block. Pass null/null to get the entire route's meters
 * on that side (useful for debugging, not for production).
 */
export async function fetchMetersOnBlockface(
  routeId: string,
  side: Side,
  fromMeasure: number | null,
  toMeasure: number | null,
): Promise<CurbFeature[]> {
  // Build the WHERE clause. ROUTEID + SIDE is the core filter; the MEASURE
  // range narrows from "all meters on this side of this whole street" down
  // to "all meters on this block."
  let where = `ROUTEID = '${routeId}' AND SIDE = '${side}'`;
  if (fromMeasure != null && toMeasure != null) {
    where += ` AND MEASURE >= ${fromMeasure} AND MEASURE <= ${toMeasure}`;
  }

  const url =
    METERS_URL +
    "?" +
    buildQuery({
      where,
      outFields:
        "ADDRESS,SIDE,METERID,METER_ID,LAT,LON,PARKING_SPACES,METERTYPE,POLICY_DESC,MEASURE",
      returnGeometry: "false",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        ADDRESS?: string;
        SIDE?: string;
        METERID?: string;
        METER_ID?: number;
        LAT?: number;
        LON?: number;
        PARKING_SPACES?: number;
        METERTYPE?: string;
        POLICY_DESC?: string;
        MEASURE?: number;
      };
    }>;
  };

  return (raw.features ?? []).map((feature) => {
    const attrs = feature.attributes ?? {};
    return {
      type: "parking_meter" as const,
      location: {
        latitude: attrs.LAT ?? 0,
        longitude: attrs.LON ?? 0,
      },
      metadata: {
        // METERID (string) is the long ID; METER_ID (numeric) is the short
        // legacy ID. Surface both so downstream code can match either.
        meterId: attrs.METERID ?? null,
        legacyId: attrs.METER_ID ?? null,
        address: attrs.ADDRESS ?? null,
        side: attrs.SIDE ?? null,
        // MULTI = pay station serving multiple spaces; SINGLE = one space.
        // PARKING_SPACES tells you how many spaces the meter governs.
        type: attrs.METERTYPE ?? null,
        spaces: attrs.PARKING_SPACES ?? null,
        policy: attrs.POLICY_DESC ?? null,
        measure: attrs.MEASURE ?? null,
      },
    };
  });
}
