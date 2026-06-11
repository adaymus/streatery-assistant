/**
 * G1.00 — Cover sheet.
 *
 * The Queen's English G1.00 pattern: project identity, the project
 * data block (address, SSL, civic context, headline dimensions), the
 * sheet index, and a vicinity map. Everything here is data the
 * pipeline already resolved — the vicinity map draws the real street
 * centerlines around the site (Roadway Block geometry), north-up, with
 * the site marked.
 */

import { SHEET_INDEX, sheetTitleForView } from "../sheetIndex.js";
import { ROOF_PALETTE_LABELS } from "../templateConstants.js";
import type { SiteContext } from "../siteContext.js";
import type { StreateryDesign } from "../types.js";
import { escapeXml, ftIn } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const SHEET_W = 110;
const LEFT_X = 2;
const RIGHT_X = 60;
const MAP_SIZE = 44;
/** Half-extent of the vicinity map's world window, feet. */
const MAP_RANGE_FT = 900;

export function buildCoverSvg(
  design: StreateryDesign,
  site: SiteContext,
): string {
  const el: string[] = [];

  // ---------- Title block (the big one — this IS the cover) ----------

  el.push(
    `<text x="${SHEET_W / 2}" y="2" font-size="3.2" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">${escapeXml(design.businessName.toUpperCase())}</text>`,
    `<text x="${SHEET_W / 2}" y="5.4" font-size="1.6" font-family="sans-serif" text-anchor="middle" fill="#44403c">STREATERY — DESIGN PERMIT DRAWING SET</text>`,
    `<text x="${SHEET_W / 2}" y="7.6" font-size="1.1" font-family="sans-serif" text-anchor="middle" fill="#78716c">${escapeXml(design.address)}</text>`,
    `<line x1="${LEFT_X}" y1="9.6" x2="${SHEET_W - 2}" y2="9.6" stroke="#1c1917" stroke-width="0.12" />`,
  );

  // ---------- Project data (left column) ----------

  let y = 13;
  el.push(
    `<text x="${LEFT_X}" y="${y}" font-size="1.3" font-family="sans-serif" font-weight="700" fill="#1c1917">PROJECT DATA</text>`,
  );
  y += 2;
  const dataRows: Array<[string, string]> = [
    ["ADDRESS", design.address],
    ["SQUARE-LOT (SSL)", site.civic.ssl ?? "— (not found; confirm with DOB)"],
    ["WARD / ANC", `${site.civic.wardId ?? "—"} / ${site.civic.ancId ?? "—"}`],
    ["BLOCK", site.blockName],
    [
      "STRUCTURE",
      `${ftIn(design.platform.lengthFt)} × ${ftIn(design.platform.widthFt)} parking-lane platform`,
    ],
    ["BARRIER TYPE (§4.2)", design.barrierType === "type1" ? "TYPE 1" : "TYPE 2"],
    ["ROOF", design.roofSegments.length > 0 ? ROOF_PALETTE_LABELS[design.roofPalette] : "NONE (§4.3 exclusions)"],
    [
      "SEATING CAPACITY (§4.8)",
      `${design.seating.capacity} (${design.seating.areaSf} SF / 15)`,
    ],
    ["GENERATED", design.generatedAt.slice(0, 10)],
  ];
  for (const [label, value] of dataRows) {
    el.push(
      `<text x="${LEFT_X}" y="${y}" font-size="0.95" font-family="sans-serif" fill="#78716c">${escapeXml(label)}</text>`,
      `<text x="${LEFT_X + 19}" y="${y}" font-size="0.95" font-family="sans-serif" fill="#1c1917">${escapeXml(value)}</text>`,
    );
    y += 1.6;
  }

  // ---------- Sheet index (left column, below project data) ----------

  y += 2;
  el.push(
    `<text x="${LEFT_X}" y="${y}" font-size="1.3" font-family="sans-serif" font-weight="700" fill="#1c1917">SHEET INDEX</text>`,
    `<text x="${LEFT_X + 14}" y="${y}" font-size="0.8" font-family="sans-serif" font-style="italic" fill="#a8a29e">one view per sheet; page order matches the combined PDF</text>`,
  );
  y += 2;
  for (const sheet of SHEET_INDEX) {
    el.push(
      `<text x="${LEFT_X}" y="${y}" font-size="0.95" font-family="sans-serif" font-weight="700" fill="#1c1917">${escapeXml(sheet.number)}</text>`,
      `<text x="${LEFT_X + 7}" y="${y}" font-size="0.95" font-family="sans-serif" fill="#44403c">${escapeXml(sheet.title)}</text>`,
    );
    y += 1.55;
  }

  // ---------- Vicinity map (right column) ----------
  // Real street centerlines in local feet around the site, north-up.
  // Clipped to the box; each distinct street labeled once along its
  // longest run inside the window.

  const mapX = RIGHT_X;
  const mapY = 12;
  const scale = MAP_SIZE / (2 * MAP_RANGE_FT);
  // World (east/north ft) → map coords. North up = SVG -y.
  const mx = (xFt: number): number => mapX + MAP_SIZE / 2 + xFt * scale;
  const my = (yFt: number): number => mapY + MAP_SIZE / 2 - yFt * scale;

  el.push(
    `<clipPath id="vicinity-clip"><rect x="${mapX}" y="${mapY}" width="${MAP_SIZE}" height="${MAP_SIZE}" /></clipPath>`,
    `<rect x="${mapX}" y="${mapY}" width="${MAP_SIZE}" height="${MAP_SIZE}" fill="#fafaf9" stroke="#1c1917" stroke-width="0.12" />`,
  );
  el.push(`<g id="vicinity-streets" clip-path="url(#vicinity-clip)">`);
  // Track the longest path per street name for label placement.
  const longestByName = new Map<
    string,
    { lengthFt: number; midX: number; midY: number; angleDeg: number }
  >();
  for (const street of site.vicinity) {
    const points = street.path
      .map((p) => `${mx(p.xFt).toFixed(2)},${my(p.yFt).toFixed(2)}`)
      .join(" ");
    el.push(
      `<polyline points="${points}" fill="none" stroke="#a8a29e" stroke-width="0.5" stroke-linecap="round" />`,
    );
    const first = street.path[0]!;
    const last = street.path[street.path.length - 1]!;
    const lengthFt = Math.hypot(last.xFt - first.xFt, last.yFt - first.yFt);
    const prev = longestByName.get(street.name);
    if (!prev || lengthFt > prev.lengthFt) {
      const midX = mx((first.xFt + last.xFt) / 2);
      const midY = my((first.yFt + last.yFt) / 2);
      // Text angle along the street; flipped if it would read upside down.
      let angleDeg =
        (Math.atan2(
          -(last.yFt - first.yFt), // SVG y is flipped
          last.xFt - first.xFt,
        ) *
          180) /
        Math.PI;
      if (angleDeg > 90) angleDeg -= 180;
      if (angleDeg < -90) angleDeg += 180;
      longestByName.set(street.name, { lengthFt, midX, midY, angleDeg });
    }
  }
  for (const [name, label] of longestByName) {
    if (label.lengthFt < 250) continue; // too short to carry a readable label
    // A label point at the box edge would render half-clipped and crowd
    // the caption below the frame — skip it; the street line still shows.
    if (
      label.midX < mapX + 2 || label.midX > mapX + MAP_SIZE - 2 ||
      label.midY < mapY + 2 || label.midY > mapY + MAP_SIZE - 2
    ) continue;
    el.push(
      `<text x="${label.midX}" y="${label.midY - 0.5}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#57534e" transform="rotate(${label.angleDeg.toFixed(1)} ${label.midX} ${label.midY})">${escapeXml(name)}</text>`,
    );
  }
  el.push(`</g>`);
  // The site: a filled marker at the map center (the address point).
  const siteX = mx(0);
  const siteY = my(0);
  el.push(
    `<circle cx="${siteX}" cy="${siteY}" r="0.9" fill="#1c1917" />`,
    `<circle cx="${siteX}" cy="${siteY}" r="1.6" fill="none" stroke="#1c1917" stroke-width="0.14" />`,
    `<text x="${siteX + 2.2}" y="${siteY + 0.4}" font-size="1.0" font-family="sans-serif" font-weight="700" fill="#1c1917">SITE</text>`,
  );
  // North arrow + caption.
  el.push(
    `<g transform="translate(${mapX + MAP_SIZE - 3}, ${mapY + 3.4})">`,
    `<polygon points="0,-1.8 -0.7,1.2 0,0.6 0.7,1.2" fill="#1c1917" />`,
    `<text x="0" y="3" font-size="0.9" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">N</text>`,
    `</g>`,
    `<text x="${mapX}" y="${mapY + MAP_SIZE + 1.6}" font-size="0.9" font-family="sans-serif" font-weight="700" fill="#1c1917">VICINITY MAP</text>`,
    `<text x="${mapX}" y="${mapY + MAP_SIZE + 2.9}" font-size="0.75" font-family="sans-serif" font-style="italic" fill="#78716c">DDOT Roadway Block centerlines, ±${MAP_RANGE_FT} ft window, north up. Scale: 1 unit = ${Math.round(1 / scale)} ft.</text>`,
  );

  const bottomY = Math.max(y, mapY + MAP_SIZE + 4);

  return composeSheet(
    {
      viewTitle: sheetTitleForView("cover"),
      design,
      sheetMinX: 0,
      sheetMaxX: SHEET_W,
      sheetMinY: -1,
      contentBottomY: bottomY + 1,
      watermarkCenter: { x: SHEET_W / 2, y: bottomY / 2 },
      hideNotesBand: true,
    },
    el,
  );
}
