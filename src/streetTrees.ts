/**
 * Street Trees fetcher (UFA = Urban Forestry Administration).
 *
 * Layer: `Urban_Tree_Canopy/MapServer/23` (UFA Street Trees).
 * Tier 4 (bbox spatial). No road-network join keys, so we query within a
 * bounding box around the address.
 *
 * Streateries cannot be built where trees would be displaced or damaged.
 * Each tree is a point feature; the tree box (TBOX_L × TBOX_W) extends
 * around it. For v1 we treat the point as the tree's location and let the
 * eligibility engine apply a buffer based on tree-box dimensions.
 */

import { fetchJson, buildQuery } from "./http.js";
import { bboxAroundPoint, bboxToArcgisGeometry } from "./bbox.js";
import type { CurbFeature } from "./curbFeatures.js";

const STREET_TREES_URL =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Urban_Tree_Canopy/MapServer/23/query";

export async function fetchStreetTreesNear(
  latitude: number,
  longitude: number,
  radiusFt = 150,
): Promise<CurbFeature[]> {
  const bbox = bboxAroundPoint(latitude, longitude, radiusFt);

  const url =
    STREET_TREES_URL +
    "?" +
    buildQuery({
      geometry: bboxToArcgisGeometry(bbox),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields:
        "FACILITYID,CMMN_NM,SCI_NM,GENUS_NAME,DBH,TBOX_L,TBOX_W,CURB,SIDEWALK,DISEASE,VICINITY,RETIREDDT,DATE_PLANT",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

  const raw = (await fetchJson(url)) as {
    features?: Array<{
      attributes?: {
        FACILITYID?: string;
        CMMN_NM?: string;
        SCI_NM?: string;
        GENUS_NAME?: string;
        DBH?: number;
        TBOX_L?: number;
        TBOX_W?: number;
        CURB?: string;
        SIDEWALK?: string;
        DISEASE?: string;
        VICINITY?: string;
        RETIREDDT?: number | null;
        DATE_PLANT?: number | null;
      };
      geometry?: { x?: number; y?: number };
    }>;
  };

  return (raw.features ?? [])
    .filter((f) => f.geometry?.x != null && f.geometry?.y != null)
    // Skip retired/removed trees — RETIREDDT being non-null means the tree
    // is no longer there. A streatery doesn't need to buffer empty tree boxes.
    .filter((f) => f.attributes?.RETIREDDT == null)
    .map((feature) => {
      const attrs = feature.attributes ?? {};
      return {
        type: "street_tree" as const,
        location: {
          latitude: feature.geometry!.y!,
          longitude: feature.geometry!.x!,
        },
        metadata: {
          facilityId: attrs.FACILITYID ?? null,
          commonName: attrs.CMMN_NM ?? null,
          scientificName: attrs.SCI_NM ?? null,
          genus: attrs.GENUS_NAME ?? null,
          // DBH = diameter at breast height (inches). Bigger DBH = bigger
          // canopy = bigger no-go zone for a streatery.
          dbhInches: attrs.DBH ?? null,
          // Tree-box footprint in feet (L × W). The streatery can't sit on
          // top of the tree box, only adjacent to it.
          treeBoxLengthFt: attrs.TBOX_L ?? null,
          treeBoxWidthFt: attrs.TBOX_W ?? null,
          curbPosition: attrs.CURB ?? null,
          sidewalkPosition: attrs.SIDEWALK ?? null,
          disease: attrs.DISEASE ?? null,
          vicinity: attrs.VICINITY ?? null,
        },
      };
    });
}
