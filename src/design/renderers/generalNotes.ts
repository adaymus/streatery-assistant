/**
 * G1.01 — General Notes + DDOT Requirements sheet.
 *
 * The Queen's English set's G1.01 is mostly conditional boilerplate;
 * the M4 notes library holds exactly that as its "general" scope. This
 * renderer consumes the scope wholesale: evaluate, group by category,
 * flow into two columns. A note whose condition doesn't hold for this
 * site simply isn't on the sheet (the bike-lane concrete-block toggle
 * being the canonical example).
 *
 * Site-specific layout notes stay on their drawing sheets — this sheet
 * carries the set-wide requirements, with each note's regs citation in
 * the margin so a PSC reviewer can trace every line.
 */

import { evaluateNoteInstances, type NoteCategory } from "../notes/index.js";
import { sheetTitleForView } from "../sheetIndex.js";
import type { SiteContext } from "../siteContext.js";
import type { StreateryDesign } from "../types.js";
import { escapeXml } from "./shared.js";
import { composeSheet, wrapText } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const SHEET_W = 112;
const COL_W = 52;
const COL_GAP = 4;
const MARGIN = 2;
const NOTE_FONT = 1.0;
const LINE_H = 1.45;
/** ~chars per line at NOTE_FONT — generous 0.55 glyph factor (the spacing check caught 0.45 letting long lines cross into the next column). */
const COL_CHARS = Math.floor(COL_W / (NOTE_FONT * 0.55));

/** Print order + headings for the category groups. */
const CATEGORY_ORDER: Array<{ category: NoteCategory; heading: string }> = [
  { category: "regulatory", heading: "DDOT / ADA REQUIREMENTS" },
  { category: "architect", heading: "ARCHITECT CONFIRMATIONS" },
  { category: "site-walk", heading: "SITE-WALK VERIFICATIONS" },
  { category: "operator", heading: "OPERATOR ITEMS" },
  { category: "data-provenance", heading: "DATA PROVENANCE" },
];

export function buildGeneralNotesSvg(
  design: StreateryDesign,
  site: SiteContext,
): string {
  const notes = evaluateNoteInstances("general", { design, site });

  // ---------- Lay every group out as wrapped line runs first ----------
  // Each rendered line carries its own font treatment; computing the
  // full flat list up front makes the two-column split a simple cut at
  // the half-way line count.

  interface Line {
    text: string;
    kind: "heading" | "body" | "citation-gap";
  }
  const lines: Line[] = [];
  for (const { category, heading } of CATEGORY_ORDER) {
    const group = notes.filter((n) => n.category === category);
    if (group.length === 0) continue;
    lines.push({ text: heading, kind: "heading" });
    let number = 1;
    for (const note of group) {
      const cite = note.citation ? ` [${note.citation}]` : "";
      const wrapped = wrapText(`${number}. ${note.text}${cite}`, COL_CHARS);
      for (const w of wrapped) lines.push({ text: w, kind: "body" });
      lines.push({ text: "", kind: "citation-gap" });
      number++;
    }
  }

  // ---------- Flow into two columns ----------
  // Split at the line midpoint, but never orphan a heading at a column
  // bottom — push it to the next column instead.

  const half = Math.ceil(lines.length / 2);
  let splitAt = half;
  if (lines[splitAt - 1]?.kind === "heading") splitAt -= 1;
  const columns = [lines.slice(0, splitAt), lines.slice(splitAt)];

  const el: string[] = [];
  const topY = 0;

  el.push(
    `<text x="${MARGIN}" y="${topY}" font-size="1.6" font-family="sans-serif" font-weight="700" fill="#1c1917">GENERAL NOTES + DDOT REQUIREMENTS</text>`,
    `<text x="${MARGIN}" y="${topY + 1.7}" font-size="0.9" font-family="sans-serif" fill="#78716c">Conditions evaluated for this site — notes whose conditions do not apply are omitted, not crossed out. Site-specific notes appear on each drawing sheet.</text>`,
  );

  let maxBottomY = topY;
  columns.forEach((column, colIndex) => {
    const x = MARGIN + colIndex * (COL_W + COL_GAP);
    let y = topY + 4.2;
    for (const line of column) {
      if (line.kind === "heading") {
        y += 0.9; // air above each group
        el.push(
          `<text x="${x}" y="${y}" font-size="1.1" font-family="sans-serif" font-weight="700" fill="#1c1917">${escapeXml(line.text)}</text>`,
          `<line x1="${x}" y1="${y + 0.4}" x2="${x + COL_W}" y2="${y + 0.4}" stroke="#1c1917" stroke-width="0.07" />`,
        );
        y += LINE_H + 0.2;
      } else if (line.kind === "citation-gap") {
        y += 0.45;
      } else {
        el.push(
          `<text x="${x}" y="${y}" font-size="${NOTE_FONT}" font-family="sans-serif" fill="#44403c">${escapeXml(line.text)}</text>`,
        );
        y += LINE_H;
      }
    }
    maxBottomY = Math.max(maxBottomY, y);
  });

  return composeSheet(
    {
      viewTitle: sheetTitleForView("general-notes"),
      design,
      sheetMinX: 0,
      sheetMaxX: SHEET_W,
      sheetMinY: topY - 6,
      contentBottomY: maxBottomY + 1,
      watermarkCenter: { x: SHEET_W / 2, y: maxBottomY / 2 },
      hideNotesBand: true,
    },
    el,
  );
}
