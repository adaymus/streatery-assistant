/**
 * The view registry: one renderer per drawing view, keyed by the view
 * name used in both the CLI (`--view street`) and the sheet index
 * (`SHEET_INDEX[n].view`).
 *
 * This lives in src/design (not scripts/) because BOTH consumers need
 * it: the Node CLI (scripts/drawings.ts) and the browser print module
 * (src/drawingSetPrint.ts). Keeping one registry means adding a sheet
 * is still a one-line change that reaches every output format.
 *
 * Most views project from StreateryDesign alone; the site plan (and the
 * static sheets that show vicinity context) also take the SiteContext —
 * the block around the structure (footprint, meters, cross streets)
 * that the design model deliberately doesn't carry.
 */

import type { StreateryDesign } from "./types.js";
import type { SiteContext } from "./siteContext.js";
import { buildElevationSvg } from "./renderers/elevation.js";
import { buildSidewalkElevationSvg } from "./renderers/elevationSidewalk.js";
import { buildEndElevationSvg } from "./renderers/elevationEnd.js";
import { buildSectionSvg } from "./renderers/section.js";
import { buildSitePlanSvg } from "./renderers/sitePlan.js";
import { buildCoverSvg } from "./renderers/cover.js";
import { buildGeneralNotesSvg } from "./renderers/generalNotes.js";
import { buildLifeSafetySvg } from "./renderers/lifeSafety.js";
import { buildDdotDetailsSvg } from "./renderers/ddotDetails.js";

/** Every renderer takes the design + site context and returns an SVG string. */
export type ViewRenderer = (
  design: StreateryDesign,
  site: SiteContext,
) => string;

export const VIEWS: Record<string, ViewRenderer> = {
  street: (d) => buildElevationSvg(d),
  sidewalk: (d) => buildSidewalkElevationSvg(d),
  "end-low": (d) => buildEndElevationSvg(d, "low"),
  "end-high": (d) => buildEndElevationSvg(d, "high"),
  section: (d) => buildSectionSvg(d, "typical"),
  "section-entry": (d) => buildSectionSvg(d, "entry"),
  "site-plan": (d, s) => buildSitePlanSvg(d, s),
  // The M5 static / semi-static sheets.
  cover: (d, s) => buildCoverSvg(d, s),
  "general-notes": (d, s) => buildGeneralNotesSvg(d, s),
  "life-safety": (d) => buildLifeSafetySvg(d),
  "ddot-details": (d, s) => buildDdotDetailsSvg(d, s),
};
