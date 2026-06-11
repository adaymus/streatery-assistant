/**
 * End elevation renderer: StreateryDesign → SVG, short axis.
 *
 * The view looking at the structure's end face — Martha Dear A100's
 * "ELEVATION - NORTH/SOUTH" / Queen's English A2.00's "ELEVATION B/D".
 * This is where the cross-street geometry lives: the 2:12 roof slope
 * (which the long elevations can only show as a band), the curb and
 * sidewalk relationship, the §4.6 drainage channel, and the §4.2
 * travel-side buffer.
 *
 * The two ends differ only in whether the Jersey barrier is present
 * (it guards the vehicular-approach end). One renderer, parameterized.
 *
 * Coordinate system: 1 SVG unit = 1 foot. x = 0 at the platform's
 * STREET-side edge, x = W at the curb face — both ends are drawn
 * street-left for clarity (the structure-local model has no compass, so
 * folded mirror-image ends would imply an orientation we don't know;
 * the title carries which end this is instead). y grows downward,
 * roadway grade at y = 0.
 */

import {
  BEAM_DEPTH_IN,
  DRAINAGE_CHANNEL_FT,
  ENCLOSURE_TOP_IN,
  JERSEY_BARRIER_LABEL,
  JERSEY_BARRIER_WIDTH_FT,
  PLATFORM_DECK_LABEL,
  POST_ACTUAL_IN,
  POST_LABEL,
  RAIL_TOP_LABEL,
  ROOF_PALETTE_LABELS,
  ROOF_SLOPE_RATIO,
  TRAVEL_SIDE_BUFFER_FT,
} from "../templateConstants.js";
import { sheetTitleForView } from "../sheetIndex.js";
import type { StreateryDesign } from "../types.js";
import { ftIn, horizontalDim, leaderLabel, verticalDim } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const MARGIN_LEFT_FT = 12; // travel lane context + vertical dims
// ALL-CAPS labels run ~0.58 ft/char at font-size 1 (not the 0.45
// mixed-case average) — the column must clear the longest label (~34 ft).
const MARGIN_RIGHT_FT = 46;
const SKY_FT = 5;
const DIM_BAND_FT = 6;
const SIDEWALK_CONTEXT_FT = 8; // how much sidewalk to draw beyond the curb

const RAIL_HEIGHTS_FT = [10 / 12, 17.5 / 12, 25 / 12, 32.5 / 12];
const RAIL_THICKNESS_FT = 3.5 / 12;
const CAP_RAIL_THICKNESS_FT = 5.5 / 12;

export function buildEndElevationSvg(
  design: StreateryDesign,
  end: "low" | "high",
): string {
  const W = design.platform.widthFt;
  const deckTopFt = design.platform.deckHeightFt;
  const enclosureTopFt = ENCLOSURE_TOP_IN / 12;
  const beamDepthFt = BEAM_DEPTH_IN / 12;
  const postWidthFt = POST_ACTUAL_IN / 12;
  const hasBarrier = design.jerseyBarrier.atEnd === end;

  // Sloped-roof heights across the width (street edge low, sidewalk
  // edge high) — same derivation as the sidewalk elevation; the model
  // stores the street-side fascia dims per the Martha Dear precedent.
  const fasciaDepthFt = design.roof.peakHeightFt - design.roof.edgeHeightFt;
  const lowEdgeFt = design.roof.edgeHeightFt;
  const highEdgeFt = lowEdgeFt + ROOF_SLOPE_RATIO * W;
  const hasRoof = design.roofSegments.length > 0;

  const curbX = W; // curb face
  const sheetMinX = -MARGIN_LEFT_FT;
  const sheetMaxX = curbX + SIDEWALK_CONTEXT_FT + MARGIN_RIGHT_FT - 8;
  const sheetMinY = -((hasRoof ? highEdgeFt + fasciaDepthFt : enclosureTopFt) + SKY_FT);
  const yOf = (heightFt: number): number => -heightFt;

  const el: string[] = [];

  // ---------- Ground: roadway up to the curb, then the raised sidewalk ----------

  el.push(
    `<line x1="${sheetMinX + 2}" y1="0" x2="${curbX}" y2="0" stroke="#1c1917" stroke-width="0.22" />`,
  );
  // Curb face and sidewalk grade (deck is flush with the curb top, §4.4).
  el.push(
    `<line x1="${curbX}" y1="0" x2="${curbX}" y2="${yOf(deckTopFt)}" stroke="#1c1917" stroke-width="0.22" />`,
    `<line x1="${curbX}" y1="${yOf(deckTopFt)}" x2="${curbX + SIDEWALK_CONTEXT_FT}" y2="${yOf(deckTopFt)}" stroke="#1c1917" stroke-width="0.22" />`,
  );
  for (let x = Math.ceil(sheetMinX + 2); x < curbX; x += 2) {
    el.push(
      `<line x1="${x}" y1="0" x2="${x - 0.8}" y2="0.8" stroke="#1c1917" stroke-width="0.05" />`,
    );
  }
  el.push(
    `<text x="${sheetMinX + 2}" y="1.6" font-size="1.0" font-family="sans-serif" fill="#57534e">TRAVEL LANE →</text>`,
    `<text x="${curbX + 1}" y="${yOf(deckTopFt) - 0.6}" font-size="1.0" font-family="sans-serif" fill="#57534e">SIDEWALK</text>`,
  );

  // ---------- Platform end face ----------
  // Solid band from grade to deck top; the §4.6 drainage channel at the
  // curb side is an OPENING in that face (water must flow along the
  // gutter under the platform), drawn as a dashed void.

  el.push(
    `<rect x="0" y="${yOf(deckTopFt)}" width="${W - DRAINAGE_CHANNEL_FT}" height="${deckTopFt}" fill="#e7e5e4" stroke="#1c1917" stroke-width="0.08" />`,
    `<rect x="${W - DRAINAGE_CHANNEL_FT}" y="${yOf(deckTopFt)}" width="${DRAINAGE_CHANNEL_FT}" height="${deckTopFt - 0.08}" fill="none" stroke="#78716c" stroke-width="0.06" stroke-dasharray="0.3,0.25" />`,
  );

  // ---------- Rails across the end face ----------

  el.push(`<g id="enclosure">`);
  for (const railFt of RAIL_HEIGHTS_FT) {
    el.push(
      `<rect x="0" y="${yOf(deckTopFt + railFt + RAIL_THICKNESS_FT)}" width="${W}" height="${RAIL_THICKNESS_FT}" fill="#fff" stroke="#1c1917" stroke-width="0.07" />`,
    );
  }
  el.push(
    `<rect x="0" y="${yOf(enclosureTopFt)}" width="${W}" height="${CAP_RAIL_THICKNESS_FT}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
  );
  el.push(`</g>`);

  // ---------- Corner posts ----------
  // Street-side post rises to the low roof edge, sidewalk-side post to
  // the high edge — the posts make the slope legible.

  el.push(`<g id="posts">`);
  const postTops: Array<{ x: number; topFt: number }> = [
    { x: 0, topFt: hasRoof ? lowEdgeFt - beamDepthFt : enclosureTopFt },
    {
      x: W - postWidthFt,
      topFt: hasRoof ? highEdgeFt - beamDepthFt : enclosureTopFt,
    },
  ];
  for (const post of postTops) {
    el.push(
      `<rect x="${post.x}" y="${yOf(post.topFt)}" width="${postWidthFt}" height="${post.topFt - deckTopFt}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.09" />`,
    );
  }
  el.push(`</g>`);

  // ---------- Roof: the sloped panel, finally drawn AS a slope ----------

  if (hasRoof) {
    el.push(`<g id="roof">`);
    // Beam ends (doubled 2x10 reads as a deep block) atop each post.
    el.push(
      `<rect x="${-0.2}" y="${yOf(lowEdgeFt)}" width="${postWidthFt + 0.4}" height="${beamDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
      `<rect x="${W - postWidthFt - 0.2}" y="${yOf(highEdgeFt)}" width="${postWidthFt + 0.4}" height="${beamDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
    );
    // The sloped translucent panel: a thin parallelogram with a small
    // overhang past each beam, low at the street, high at the sidewalk.
    const panelT = 0.15;
    el.push(
      `<polygon points="${-0.7},${yOf(lowEdgeFt)} ${W + 0.7},${yOf(highEdgeFt)} ${W + 0.7},${yOf(highEdgeFt + panelT)} ${-0.7},${yOf(lowEdgeFt + panelT)}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
    // Fascia boards at both eaves.
    el.push(
      `<rect x="${-0.7}" y="${yOf(lowEdgeFt + panelT)}" width="0.25" height="${fasciaDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.07" />`,
      `<rect x="${W + 0.45}" y="${yOf(highEdgeFt + panelT)}" width="0.25" height="${fasciaDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.07" />`,
    );
    // Slope arrow + ratio, pointing the drainage direction (to curb...
    // which §4.6 routes along the gutter — toward the STREET-side eave).
    const midX = W / 2;
    const midY = yOf((lowEdgeFt + highEdgeFt) / 2 + 1.2);
    el.push(
      `<line x1="${midX + 2}" y1="${midY - 0.35}" x2="${midX - 2}" y2="${midY + 0.35}" stroke="#1c1917" stroke-width="0.07" />`,
      `<polygon points="${midX - 2},${midY + 0.35} ${midX - 1.3},${midY + 0.05} ${midX - 1.45},${midY + 0.55}" fill="#1c1917" />`,
      `<text x="${midX}" y="${midY - 0.7}" font-size="0.9" font-family="sans-serif" text-anchor="middle" fill="#1c1917">${design.roof.slopeLabel}</text>`,
    );
    el.push(`</g>`);
  }

  // ---------- Jersey barrier (vehicular-approach end only) ----------
  // End-on we see the barrier's iconic safety-shape cross-section. It
  // sits at the structure's street edge per the Type-2 placement the
  // long elevation models; exact in-buffer position is the architect's
  // call (§4.2: angled 45-60° inward, 12" off the travel lane).

  if (hasBarrier) {
    const jbH = design.jerseyBarrier.heightFt;
    const half = JERSEY_BARRIER_WIDTH_FT / 2;
    const cx = 0; // centered on the street-side platform edge
    el.push(
      `<g id="jersey-barrier">`,
      `<path d="M ${cx - half} 0 ` +
        `L ${cx - half} ${yOf(0.25)} ` +
        `L ${cx - 0.3} ${yOf(1.1)} ` +
        `L ${cx - 0.25} ${yOf(jbH)} ` +
        `L ${cx + 0.25} ${yOf(jbH)} ` +
        `L ${cx + 0.3} ${yOf(1.1)} ` +
        `L ${cx + half} ${yOf(0.25)} ` +
        `L ${cx + half} 0 Z" fill="#d6d3d1" stroke="#1c1917" stroke-width="0.1" />`,
      `<circle cx="${cx}" cy="${yOf(jbH / 2)}" r="0.18" fill="#facc15" stroke="#1c1917" stroke-width="0.04" />`,
      `</g>`,
    );
  }

  // ---------- Material labels ----------

  const labelX = curbX + SIDEWALK_CONTEXT_FT + 2;
  const labels: Array<{ text: string; targetX: number; targetY: number }> = [];
  if (hasRoof) {
    labels.push({
      text: ROOF_PALETTE_LABELS[design.roofPalette],
      targetX: W * 0.6,
      targetY: yOf((lowEdgeFt + highEdgeFt) / 2 + ROOF_SLOPE_RATIO * W * 0.1),
    });
  }
  labels.push(
    {
      text: POST_LABEL,
      targetX: W - postWidthFt / 2,
      targetY: yOf((deckTopFt + enclosureTopFt) / 2 + 1.2),
    },
    {
      text: RAIL_TOP_LABEL,
      targetX: W * 0.4,
      targetY: yOf(enclosureTopFt - CAP_RAIL_THICKNESS_FT / 2),
    },
    {
      text: PLATFORM_DECK_LABEL,
      targetX: W * 0.4,
      targetY: yOf(deckTopFt / 2),
    },
    {
      text: `${ftIn(DRAINAGE_CHANNEL_FT)} CLEAR STORMWATER CHANNEL AT CURB (§4.6)`,
      targetX: W - DRAINAGE_CHANNEL_FT / 2,
      targetY: yOf(deckTopFt / 2 - 0.05),
    },
  );
  if (hasBarrier) {
    labels.push({
      text: `${JERSEY_BARRIER_LABEL} — ANGLED 45-60° INWARD (§4.2)`,
      targetX: 0.3,
      targetY: yOf(design.jerseyBarrier.heightFt - 0.4),
    });
  }
  el.push(`<g id="labels">`);
  const labelTopFt = hasRoof ? highEdgeFt + fasciaDepthFt : enclosureTopFt + 3;
  labels.forEach((lab, i) => {
    el.push(
      leaderLabel(labelX, yOf(labelTopFt - i * 1.7), lab.targetX, lab.targetY, lab.text),
    );
  });
  el.push(`</g>`);

  // ---------- Dimension strings ----------

  el.push(`<g id="dimensions">`);
  // Platform width and the §4.2 travel-side buffer, below grade.
  el.push(horizontalDim(0, W, 2.9, 0, ftIn(W)));
  // Second row: the buffer label is wide and was colliding with the
  // platform-width text when both shared one dimension row.
  el.push(
    horizontalDim(
      -TRAVEL_SIDE_BUFFER_FT,
      0,
      4.7,
      0,
      `${ftIn(TRAVEL_SIDE_BUFFER_FT)} BUFFER`,
    ),
  );
  // Heights on the left: deck, enclosure top, both roof edges.
  el.push(verticalDim(yOf(deckTopFt), 0, -3, 0, ftIn(deckTopFt)));
  el.push(verticalDim(yOf(enclosureTopFt), 0, -5.5, 0, ftIn(enclosureTopFt)));
  if (hasRoof) {
    el.push(
      verticalDim(yOf(lowEdgeFt), 0, -8, 0, ftIn(lowEdgeFt)),
      verticalDim(
        yOf(highEdgeFt),
        yOf(deckTopFt),
        curbX + SIDEWALK_CONTEXT_FT - 1,
        curbX,
        ftIn(highEdgeFt),
      ),
    );
  }
  el.push(`</g>`);

  // ---------- Compose ----------

  // Title must fit the 26-unit title block (~40 caps chars at this size).
  return composeSheet(
    {
      viewTitle: sheetTitleForView(`end-${end}`, hasBarrier ? " (APPROACH)" : ""),
      design,
      sheetMinX,
      sheetMaxX,
      sheetMinY,
      contentBottomY: DIM_BAND_FT,
      watermarkCenter: {
        x: (sheetMinX + sheetMaxX) / 2,
        y: yOf(enclosureTopFt + 2),
      },
    },
    el,
  );
}
