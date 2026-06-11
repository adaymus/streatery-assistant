/**
 * Helpers shared by every drawing renderer.
 *
 * Lives separately so the Site Plan (M2), Sections (M3), etc. all
 * produce drawings that LOOK like one set: same dimension style, same
 * watermark, same feet-and-inches formatting. (sitePlanMockup.ts has
 * private copies of some of these — it adopts this module when it
 * becomes the real Site Plan renderer in M2.)
 */

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format decimal feet the way architects write them: 25.5 → 25'-6".
 * Inches round to the nearest 1/2" (finer than that is survey
 * territory, not drawing territory).
 */
export function ftIn(decimalFeet: number): string {
  const sign = decimalFeet < 0 ? "-" : "";
  const abs = Math.abs(decimalFeet);
  let feet = Math.floor(abs);
  // Round inches to the nearest half inch.
  let inches = Math.round((abs - feet) * 12 * 2) / 2;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  const inchStr = Number.isInteger(inches)
    ? `${inches}`
    : `${Math.floor(inches)} 1/2`;
  return `${sign}${feet}'-${inchStr}"`;
}

/**
 * A horizontal dimension string: extension lines, arrows, centered text.
 * (x1,x2) in drawing units, y = the dimension line's height; the
 * measured object sits at yObject (extension lines run from there).
 */
export function horizontalDim(
  x1: number,
  x2: number,
  y: number,
  yObject: number,
  label: string,
): string {
  const mid = (x1 + x2) / 2;
  const a = 0.8; // arrowhead size, drawing units
  return [
    // Extension lines from the object down/up to the dimension line.
    `<line x1="${x1}" y1="${yObject}" x2="${x1}" y2="${y}" stroke="#1c1917" stroke-width="0.06" />`,
    `<line x1="${x2}" y1="${yObject}" x2="${x2}" y2="${y}" stroke="#1c1917" stroke-width="0.06" />`,
    // The dimension line itself.
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#1c1917" stroke-width="0.08" />`,
    // Arrowheads (drawn as small slashes, architectural style).
    `<line x1="${x1 - a / 2}" y1="${y + a / 2}" x2="${x1 + a / 2}" y2="${y - a / 2}" stroke="#1c1917" stroke-width="0.12" />`,
    `<line x1="${x2 - a / 2}" y1="${y + a / 2}" x2="${x2 + a / 2}" y2="${y - a / 2}" stroke="#1c1917" stroke-width="0.12" />`,
    `<text x="${mid}" y="${y - 0.4}" font-size="1.1" font-family="sans-serif" text-anchor="middle" fill="#1c1917">${escapeXml(label)}</text>`,
  ].join("\n");
}

/**
 * A vertical dimension string, same anatomy rotated. xObject = the
 * measured object's x (extension lines run from there to the line at x).
 */
export function verticalDim(
  y1: number,
  y2: number,
  x: number,
  xObject: number,
  label: string,
): string {
  const mid = (y1 + y2) / 2;
  const a = 0.8;
  return [
    `<line x1="${xObject}" y1="${y1}" x2="${x}" y2="${y1}" stroke="#1c1917" stroke-width="0.06" />`,
    `<line x1="${xObject}" y1="${y2}" x2="${x}" y2="${y2}" stroke="#1c1917" stroke-width="0.06" />`,
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#1c1917" stroke-width="0.08" />`,
    `<line x1="${x - a / 2}" y1="${y1 + a / 2}" x2="${x + a / 2}" y2="${y1 - a / 2}" stroke="#1c1917" stroke-width="0.12" />`,
    `<line x1="${x - a / 2}" y1="${y2 + a / 2}" x2="${x + a / 2}" y2="${y2 - a / 2}" stroke="#1c1917" stroke-width="0.12" />`,
    `<text x="${x - 0.4}" y="${mid}" font-size="1.1" font-family="sans-serif" text-anchor="middle" fill="#1c1917" transform="rotate(-90 ${x - 0.4} ${mid})">${escapeXml(label)}</text>`,
  ].join("\n");
}

/**
 * A label with a leader line from the text to the labeled point —
 * the annotation style both approved sets use for materials.
 */
export function leaderLabel(
  textX: number,
  textY: number,
  targetX: number,
  targetY: number,
  label: string,
): string {
  return [
    `<line x1="${textX - 0.3}" y1="${textY - 0.35}" x2="${targetX}" y2="${targetY}" stroke="#57534e" stroke-width="0.05" />`,
    `<circle cx="${targetX}" cy="${targetY}" r="0.12" fill="#57534e" />`,
    `<text x="${textX}" y="${textY}" font-size="1.0" font-family="sans-serif" fill="#1c1917">${escapeXml(label)}</text>`,
  ].join("\n");
}

/**
 * Lay out a column of leader labels so the stack never descends into
 * the ground-line zone. Stacks were fixed-pitch from a fixed top, which
 * let a 7-label column walk straight through the grade line (the
 * spacing check caught "ROADWAY" × "CONCRETE JERSEY BARRIER").
 *
 * Strategy: tighten the pitch toward minSpacing first; if the column
 * still can't fit above minBottom, raise the top instead (callers give
 * the extra headroom to the sheet's sky margin).
 */
export function labelStack(
  topFt: number,
  count: number,
  minBottomFt = 2.5,
  maxSpacingFt = 1.7,
  minSpacingFt = 1.25,
): { startFt: number; spacingFt: number } {
  if (count <= 1) return { startFt: Math.max(topFt, minBottomFt), spacingFt: maxSpacingFt };
  const natural = (topFt - minBottomFt) / (count - 1);
  const spacingFt = Math.min(maxSpacingFt, Math.max(minSpacingFt, natural));
  const startFt = Math.max(topFt, minBottomFt + (count - 1) * spacingFt);
  return { startFt, spacingFt };
}

/** The diagonal draft watermark every generated drawing carries until architect-sealed. */
export function draftWatermark(
  centerX: number,
  centerY: number,
  fontSize: number,
): string {
  return (
    `<text x="${centerX}" y="${centerY}" font-size="${fontSize}" font-family="sans-serif" ` +
    `font-weight="900" fill="#1c1917" fill-opacity="0.06" text-anchor="middle" ` +
    `dominant-baseline="middle" transform="rotate(-20 ${centerX} ${centerY})">` +
    `AUTOMATED DRAFT — ARCHITECT REVIEW REQUIRED</text>`
  );
}
