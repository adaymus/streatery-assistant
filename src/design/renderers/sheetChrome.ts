/**
 * Shared "sheet furniture" for every drawing view: background, NOTES
 * block, title block, scale bar, and draft watermark, assembled around
 * the view's content elements.
 *
 * Extracted so the M2 views (sidewalk elevation, end elevations,
 * sections) and everything after them produce sheets that LOOK like one
 * set — same notes sizing, same title block, same scale bar. The
 * street-side elevation (M1, validated against the approved sets) still
 * carries a private copy of this furniture; it adopts this module the
 * next time that file is touched, so the validated renderer stays
 * byte-stable for now.
 *
 * Coordinate convention matches the renderers: 1 SVG unit = 1 foot,
 * y grows downward, the roadway grade sits at y = 0.
 */

import type { StreateryDesign } from "../types.js";
import { draftWatermark, escapeXml } from "./shared.js";

/**
 * Approximate glyph width at font-size 1, used to size the notes wrap.
 * 0.55 is deliberately generous for mixed-case sans-serif (~0.5 true
 * average) — the spacing check showed 0.45 underestimating enough for
 * long note lines to run under the title block.
 */
const CHAR_WIDTH_FACTOR = 0.55;
const NOTE_FONT_SIZE = 0.85;
const NOTE_LINE_HEIGHT = 1.15;

/** Title block footprint (drawing units = feet). Same on every sheet. */
const TITLE_BLOCK_W = 26;
const TITLE_BLOCK_H = 12;
/** Architect seal box, drawn LEFT of the title block — notes must clear it too. */
const SEAL_BLOCK_W = 9;
const SEAL_BLOCK_GAP = 0.8;

export interface SheetSpec {
  /** The view name printed in the title block, e.g. "ELEVATION — SIDEWALK SIDE". */
  viewTitle: string;
  design: StreateryDesign;
  /** Horizontal extent of the sheet (world feet). */
  sheetMinX: number;
  sheetMaxX: number;
  /** Top of the sheet (negative = above grade). */
  sheetMinY: number;
  /**
   * Where the drawing content (including dimension strings) ends.
   * The NOTES block and title block are laid out below this line.
   */
  contentBottomY: number;
  /** Where to center the diagonal draft watermark. */
  watermarkCenter: { x: number; y: number };
  /**
   * Skip the NOTES band entirely. For sheets whose CONTENT already is
   * text (G1.00 cover, G1.01 general notes, A4.00 details) a second
   * notes block would duplicate or clutter — the title block and
   * watermark still render.
   */
  hideNotesBand?: boolean;
  /**
   * Schematic mode: drop the title block, architect seal box, scale
   * bar, and notes band, and replace the "ARCHITECT REVIEW REQUIRED"
   * watermark with a plain-language SCHEMATIC caption. The whole point
   * of schematic output is to NOT look like a sealed sheet, so the
   * furniture that signals "finished drawing" comes off here in one
   * place rather than in every renderer.
   */
  schematic?: boolean;
}

/**
 * Wrap a view's content elements in the standard sheet furniture and
 * return the complete SVG document.
 *
 * The notes band is sized from CONTENT, not a constant — note count
 * varies per site and a fixed band either wastes paper or overflows.
 * Wrap width stops short of the title block's column so they can never
 * collide.
 */
export function composeSheet(spec: SheetSpec, content: string[]): string {
  // Schematic sheets get their own minimal furniture and bail early —
  // none of the title-block / seal / notes machinery below runs.
  if (spec.schematic) return composeSchematicSheet(spec, content);

  const { design, sheetMinX, sheetMaxX, sheetMinY } = spec;

  const tbX = sheetMaxX - TITLE_BLOCK_W - 1;
  // Notes wrap short of the SEAL box (the leftmost bottom-right
  // furniture), not the title block — they share the same rows.
  const furnitureX = tbX - SEAL_BLOCK_W - SEAL_BLOCK_GAP;
  const notesX = sheetMinX + 2;
  const noteMaxChars = Math.max(
    40,
    Math.floor((furnitureX - notesX - 1.5) / (NOTE_FONT_SIZE * CHAR_WIDTH_FACTOR)),
  );
  const noteLines: string[] = spec.hideNotesBand
    ? []
    : design.notes.flatMap((note, i) =>
        wrapText(`${i + 1}. ${note}`, noteMaxChars),
      );
  const notesHeightFt = spec.hideNotesBand
    ? 0
    : 1.5 + 1.6 + noteLines.length * NOTE_LINE_HEIGHT + design.notes.length * 0.25;
  const sheetMaxY =
    spec.contentBottomY + Math.max(notesHeightFt + 2, TITLE_BLOCK_H + 3);

  const el: string[] = [];

  // ---------- Background ----------

  el.push(
    `<rect x="${sheetMinX}" y="${sheetMinY}" width="${sheetMaxX - sheetMinX}" height="${sheetMaxY - sheetMinY}" fill="#fefdfb" />`,
  );

  // ---------- The view's content ----------

  el.push(...content);

  // ---------- Notes block ----------

  if (!spec.hideNotesBand) {
    let notesY = spec.contentBottomY + 1.5;
    el.push(
      `<text x="${notesX}" y="${notesY}" font-size="1.15" font-family="sans-serif" font-weight="700" fill="#1c1917">NOTES</text>`,
    );
    notesY += 1.6;
    for (let i = 0; i < noteLines.length; i++) {
      el.push(
        `<text x="${notesX}" y="${notesY}" font-size="${NOTE_FONT_SIZE}" font-family="sans-serif" fill="#44403c">${escapeXml(noteLines[i]!)}</text>`,
      );
      notesY += NOTE_LINE_HEIGHT;
      // A touch of extra air before each numbered note starts.
      if (/^\d+\. /.test(noteLines[i + 1] ?? "")) {
        notesY += 0.25;
      }
    }
  }

  // ---------- Title block + architect seal space ----------
  // The seal box sits left of the title block: name line + an empty
  // square where the architect's stamp lands. Both approved sets carry
  // an architect (AIA) seal — no PE required (see the v3 teardown).

  const tbY = sheetMaxY - TITLE_BLOCK_H - 1;
  const sealW = SEAL_BLOCK_W;
  const sealX = furnitureX;
  el.push(
    `<g id="architect-seal">`,
    `<rect x="${sealX}" y="${tbY}" width="${sealW}" height="${TITLE_BLOCK_H}" fill="white" stroke="#1c1917" stroke-width="0.12" />`,
    `<text x="${sealX + 0.7}" y="${tbY + 1.5}" font-size="0.8" font-family="sans-serif" fill="#78716c">ARCHITECT:</text>`,
    `<line x1="${sealX + 0.7}" y1="${tbY + 3.1}" x2="${sealX + sealW - 0.7}" y2="${tbY + 3.1}" stroke="#a8a29e" stroke-width="0.06" />`,
    `<circle cx="${sealX + sealW / 2}" cy="${tbY + 7.6}" r="3" fill="none" stroke="#d6d3d1" stroke-width="0.08" stroke-dasharray="0.5,0.4" />`,
    `<text x="${sealX + sealW / 2}" y="${tbY + 7.9}" font-size="0.7" font-family="sans-serif" text-anchor="middle" fill="#a8a29e">SEAL</text>`,
    `</g>`,
  );
  el.push(
    `<g id="title-block">`,
    `<rect x="${tbX}" y="${tbY}" width="${TITLE_BLOCK_W}" height="${TITLE_BLOCK_H}" fill="white" stroke="#1c1917" stroke-width="0.12" />`,
    `<text x="${tbX + 1}" y="${tbY + 1.8}" font-size="1.3" font-family="sans-serif" font-weight="700" fill="#1c1917">${escapeXml(design.businessName.toUpperCase())}</text>`,
    `<text x="${tbX + 1}" y="${tbY + 3.3}" font-size="0.95" font-family="sans-serif" fill="#44403c">${escapeXml(design.address)}</text>`,
    `<text x="${tbX + 1}" y="${tbY + 5.2}" font-size="1.05" font-family="sans-serif" font-weight="700" fill="#1c1917">${escapeXml(spec.viewTitle)}</text>`,
    `<text x="${tbX + 1}" y="${tbY + 6.6}" font-size="0.85" font-family="sans-serif" fill="#44403c">SEATING CAPACITY: ${design.seating.capacity} (${design.seating.areaSf} SF / 15)</text>`,
    `<text x="${tbX + 1}" y="${tbY + 7.9}" font-size="0.85" font-family="sans-serif" fill="#44403c">GENERATED ${escapeXml(design.generatedAt.slice(0, 10))} — SCALE: 1 UNIT = 1 FT</text>`,
    `<text x="${tbX + 1}" y="${tbY + 9.7}" font-size="0.8" font-family="sans-serif" font-style="italic" fill="#a8a29e">AUTOMATED DRAFT — generated by streatery pre-screener v3.</text>`,
    `<text x="${tbX + 1}" y="${tbY + 10.8}" font-size="0.8" font-family="sans-serif" font-style="italic" fill="#a8a29e">Architect review, refinement, and seal required before submission.</text>`,
    `</g>`,
  );

  // ---------- Scale bar + watermark ----------

  el.push(
    `<g id="scale-bar" transform="translate(${sheetMinX + 2}, ${sheetMinY + 2})">`,
    `<rect x="0" y="0" width="5" height="0.5" fill="#1c1917" />`,
    `<rect x="5" y="0" width="5" height="0.5" fill="white" stroke="#1c1917" stroke-width="0.06" />`,
    `<text x="0" y="-0.4" font-size="0.8" font-family="sans-serif" fill="#1c1917">0</text>`,
    `<text x="5" y="-0.4" font-size="0.8" font-family="sans-serif" text-anchor="middle" fill="#1c1917">5</text>`,
    `<text x="10" y="-0.4" font-size="0.8" font-family="sans-serif" text-anchor="middle" fill="#1c1917">10 FT</text>`,
    `</g>`,
  );
  el.push(
    draftWatermark(spec.watermarkCenter.x, spec.watermarkCenter.y, 3.2),
  );

  // ---------- Assemble ----------

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sheetMinX} ${sheetMinY} ${sheetMaxX - sheetMinX} ${sheetMaxY - sheetMinY}" preserveAspectRatio="xMidYMid meet">`,
    el.join("\n"),
    `</svg>`,
  ].join("\n");
}

/**
 * Minimal furniture for a schematic sheet: a plain background, the
 * view's content, a one-line caption identifying the drawing, and a
 * light SCHEMATIC watermark. No title block, no seal, no scale bar, no
 * notes band — those are exactly the cues that make a draft look ready
 * to submit, and schematic output deliberately doesn't claim that.
 *
 * The caption sits just below the content (which already includes the
 * dimension strings), so the sheet height is content + a short caption
 * band rather than content + the tall title-block band.
 */
function composeSchematicSheet(spec: SheetSpec, content: string[]): string {
  const { design, sheetMinX, sheetMaxX, sheetMinY } = spec;
  // A short band under the content for the caption — far less than the
  // full set's title-block reservation (TITLE_BLOCK_H + 3 ≈ 15 ft).
  const CAPTION_BAND_FT = 6;
  const sheetMaxY = spec.contentBottomY + CAPTION_BAND_FT;

  const el: string[] = [];

  // Background.
  el.push(
    `<rect x="${sheetMinX}" y="${sheetMinY}" width="${sheetMaxX - sheetMinX}" height="${sheetMaxY - sheetMinY}" fill="#fefdfb" />`,
  );

  // The view's content (outline + dimension strings).
  el.push(...content);

  // Caption: identity on one line, an honest disclaimer on the next.
  // Font sizes are in drawing FEET, so a fixed size that fits a wide
  // sheet (a long elevation) overflows a narrow one (an end elevation).
  // fitFont() shrinks each line just enough to fit the sheet width —
  // never growing past the desired size. 0.62 ft/char is a deliberately
  // generous width estimate for bold caps so we under- rather than
  // overflow.
  const capX = sheetMinX + 2;
  const availW = sheetMaxX - sheetMinX - 4; // 2 ft inset each side
  const CAP_CHAR_W = 0.62;
  const fitFont = (text: string, desired: number): number =>
    Math.min(desired, availW / (Math.max(1, text.length) * CAP_CHAR_W));

  const titleText = `${design.businessName.toUpperCase()} — ${spec.viewTitle}`;
  const disclaimerText =
    "SCHEMATIC — DIMENSIONS ONLY. NOT AN ARCHITECTURAL DRAWING; NOT FOR SUBMISSION OR CONSTRUCTION.";

  let capY = spec.contentBottomY + 2;
  el.push(
    `<text x="${capX}" y="${capY}" font-size="${fitFont(titleText, 1.3)}" font-family="sans-serif" font-weight="700" fill="#1c1917">` +
      `${escapeXml(titleText)}</text>`,
  );
  capY += 1.6;
  el.push(
    `<text x="${capX}" y="${capY}" font-size="${fitFont(design.address, 0.95)}" font-family="sans-serif" fill="#44403c">${escapeXml(design.address)}</text>`,
  );
  capY += 1.5;
  el.push(
    `<text x="${capX}" y="${capY}" font-size="${fitFont(disclaimerText, 0.9)}" font-family="sans-serif" font-weight="700" fill="#b91c1c">` +
      `${escapeXml(disclaimerText)}</text>`,
  );

  // Light watermark, same diagonal placement style as the full set but
  // saying what this actually is. Sized to span (not overflow) the sheet
  // width — same drawing-feet problem as the caption above.
  const wmText = "SCHEMATIC — DIMENSIONS ONLY";
  const wmFont = Math.min(
    3.2,
    (sheetMaxX - sheetMinX) / (wmText.length * CAP_CHAR_W),
  );
  el.push(
    `<text x="${spec.watermarkCenter.x}" y="${spec.watermarkCenter.y}" font-size="${wmFont}" font-family="sans-serif" ` +
      `font-weight="900" fill="#1c1917" fill-opacity="0.05" text-anchor="middle" ` +
      `dominant-baseline="middle" transform="rotate(-20 ${spec.watermarkCenter.x} ${spec.watermarkCenter.y})">` +
      `${wmText}</text>`,
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sheetMinX} ${sheetMinY} ${sheetMaxX - sheetMinX} ${sheetMaxY - sheetMinY}" preserveAspectRatio="xMidYMid meet">`,
    el.join("\n"),
    `</svg>`,
  ].join("\n");
}

/** Greedy word wrap to a character budget per line. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
