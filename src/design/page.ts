/**
 * Page fitting: put a composed sheet SVG onto real paper.
 *
 * Every renderer emits a sheet whose viewBox is in drawing units
 * (1 unit = 1 ft) sized to its content. That's ideal on screen but a
 * printer needs a fixed page. This module post-processes the composed
 * SVG — no renderer involvement — to:
 *
 *   1. Pick the LARGEST standard architectural scale (3" = 1'-0" down
 *      to 1/16" = 1'-0") at which the content fits inside the page
 *      margins. Snapping to a standard scale means the dimension
 *      strings are honest when someone puts an architect's scale ruler
 *      on the printed sheet — the thing "fit to page" scaling silently
 *      breaks.
 *   2. Expand the viewBox to exactly the page's footage at that scale
 *      (content centered, white page behind it, border at the margins).
 *   3. Set physical width/height on the <svg> so browsers and
 *      SVG→PDF tools print at true size.
 *   4. Stamp the page size + scale in the bottom-left margin.
 *
 * TOPS accepts uploads to ~25 MB (operator-reported, 2026-06; verify at
 * submission), so page choice is presentation, not a size constraint —
 * even the asset-heavy details sheet is well under 1 MB.
 *
 * Works on any sheet from either composer (sheetChrome or the M1
 * street elevation's private furniture) — both emit the same root tag.
 */

export type PageSizeId = "arch-d" | "tabloid" | "letter";

export interface PageSize {
  /** Label stamped on the sheet, e.g. "ARCH D 36×24". */
  label: string;
  widthIn: number;
  heightIn: number;
  /** Clear margin between the page edge and the drawing area. */
  marginIn: number;
}

/** All landscape — drawing sets read wide. */
export const PAGE_SIZES: Record<PageSizeId, PageSize> = {
  // The full-size drawing sheet both approved sets were plotted on.
  "arch-d": { label: "ARCH D 36×24", widthIn: 36, heightIn: 24, marginIn: 0.75 },
  // 11×17 ledger — the office-printer-friendly review size.
  tabloid: { label: "11×17", widthIn: 17, heightIn: 11, marginIn: 0.5 },
  // Letter, for quick reference printing.
  letter: { label: "LETTER 11×8.5", widthIn: 11, heightIn: 8.5, marginIn: 0.4 },
};

/**
 * Standard architectural scales, inches of paper per foot of world,
 * largest first. We walk down until the sheet fits.
 */
const ARCH_SCALES: Array<{ inPerFt: number; label: string }> = [
  { inPerFt: 3, label: '3" = 1\'-0"' },
  { inPerFt: 1.5, label: '1 1/2" = 1\'-0"' },
  { inPerFt: 1, label: '1" = 1\'-0"' },
  { inPerFt: 0.75, label: '3/4" = 1\'-0"' },
  { inPerFt: 0.5, label: '1/2" = 1\'-0"' },
  { inPerFt: 0.375, label: '3/8" = 1\'-0"' },
  { inPerFt: 0.25, label: '1/4" = 1\'-0"' },
  { inPerFt: 0.1875, label: '3/16" = 1\'-0"' },
  { inPerFt: 0.125, label: '1/8" = 1\'-0"' },
  { inPerFt: 0.09375, label: '3/32" = 1\'-0"' },
  { inPerFt: 0.0625, label: '1/16" = 1\'-0"' },
];

/**
 * Fit a composed sheet SVG onto a page. Returns a new SVG string; the
 * input is unchanged (so "auto" mode = just don't call this).
 */
export function fitSheetToPage(svg: string, pageId: PageSizeId): string {
  const page = PAGE_SIZES[pageId];

  // Both composers emit viewBox="minX minY width height" on the root.
  const match = svg.match(/<svg([^>]*)viewBox="([^"]+)"([^>]*)>/);
  if (!match) {
    throw new Error("Sheet SVG has no viewBox — cannot fit to a page.");
  }
  const [minX, minY, contentW, contentH] = match[2]!
    .trim()
    .split(/\s+/)
    .map(Number);
  if (
    minX == null || minY == null || contentW == null || contentH == null ||
    !Number.isFinite(contentW) || !Number.isFinite(contentH)
  ) {
    throw new Error(`Unparseable viewBox: "${match[2]}"`);
  }

  // ---------- 1. Largest standard scale that fits the margins ----------

  const usableWIn = page.widthIn - 2 * page.marginIn;
  const usableHIn = page.heightIn - 2 * page.marginIn;
  let scale = ARCH_SCALES.find(
    (s) => contentW * s.inPerFt <= usableWIn && contentH * s.inPerFt <= usableHIn,
  );
  let scaleNote = "";
  if (!scale) {
    // Content too big even at 1/16" — fall back to a raw fit and say so
    // loudly rather than refuse. (A ~450 ft full-block sheet would do
    // this; none of the current sheets should.)
    const rawInPerFt = Math.min(usableWIn / contentW, usableHIn / contentH);
    scale = { inPerFt: rawInPerFt, label: `1" = ${(1 / rawInPerFt).toFixed(1)}' (NON-STANDARD FIT)` };
    scaleNote = " — content exceeded 1/16\" scale; NOT rule-measurable";
  }

  // ---------- 2. ViewBox = the whole page, in feet at that scale ----------

  const pageWFt = page.widthIn / scale.inPerFt;
  const pageHFt = page.heightIn / scale.inPerFt;
  const marginFt = page.marginIn / scale.inPerFt;
  const newMinX = minX + contentW / 2 - pageWFt / 2;
  const newMinY = minY + contentH / 2 - pageHFt / 2;

  // ---------- 3. Page furniture, injected under/over the content ----------

  const labelFontFt = 0.11 / scale.inPerFt; // ~0.11" tall on paper
  const pageRect =
    `<rect x="${newMinX}" y="${newMinY}" width="${pageWFt}" height="${pageHFt}" fill="#ffffff" />`;
  const borderRect =
    `<rect x="${newMinX + marginFt}" y="${newMinY + marginFt}" width="${pageWFt - 2 * marginFt}" height="${pageHFt - 2 * marginFt}" fill="none" stroke="#1c1917" stroke-width="${labelFontFt * 0.12}" />`;
  const scaleStamp =
    `<text x="${newMinX + marginFt}" y="${newMinY + pageHFt - marginFt * 0.35}" ` +
    `font-size="${labelFontFt}" font-family="sans-serif" fill="#1c1917">` +
    `${page.label}  ·  SCALE ${escapeXmlLite(scale.label)}${escapeXmlLite(scaleNote)}</text>`;

  // ---------- 4. Reassemble: new root attrs + furniture ----------

  const newRoot =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${page.widthIn}in" height="${page.heightIn}in" ` +
    `viewBox="${newMinX} ${newMinY} ${pageWFt} ${pageHFt}" ` +
    `preserveAspectRatio="xMidYMid meet">`;

  return svg
    .replace(/<svg[^>]*>/, `${newRoot}\n${pageRect}`)
    .replace(/<\/svg>\s*$/, `${borderRect}\n${scaleStamp}\n</svg>`);
}

/** Just the three entities that can appear in scale labels. */
function escapeXmlLite(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
