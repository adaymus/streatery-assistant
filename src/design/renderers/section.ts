/**
 * Section renderers: StreateryDesign → SVG, cut across the width.
 *
 * Queen's English A2.00's "SECTION 1/2" — the cut-through drawings the
 * §5.2 checklist (item 3) wants for "articulating complex elements."
 * Two cuts cover what reviewers actually ask about:
 *
 *   - "typical"  — through the seating area: the full deck build-up
 *     (adjustable pedestals → 2x4 PT sleepers → composite decking),
 *     the §4.6 drainage channel with flow direction, the curb plate,
 *     and the roof assembly (beams cut, joist running with the slope).
 *   - "entry"    — through the entry opening: how accessibility is
 *     provided. Sidewalk-side enclosure absent, flush threshold via
 *     the 3/8" steel plate, accessible-route arrow from the sidewalk.
 *
 * Section convention: members the cut plane passes THROUGH get an X
 * across their profile (cut lumber); members beyond the cut are drawn
 * plain. The cut plane runs perpendicular to the structure's length, so
 * lengthwise members (beams, sleepers, rails) show cut end profiles and
 * width-spanning members (joists, decking) run with the drawing.
 *
 * Coordinate system matches the end elevation: x = 0 at the platform's
 * street edge, x = W at the curb face, y down, roadway grade at y = 0.
 */

import {
  BEAM_DEPTH_IN,
  BEAM_LABEL,
  DRAINAGE_CHANNEL_FT,
  ENCLOSURE_TOP_IN,
  ENTRY_MIN_WIDTH_IN,
  JOIST_LABEL,
  PLATFORM_MAX_RISE_IN,
  POST_LABEL,
  RAIL_MID_LABEL,
  ROOF_PALETTE_LABELS,
  ROOF_SLOPE_RATIO,
  TRAVEL_SIDE_BUFFER_FT,
} from "../templateConstants.js";
import { sheetTitleForView } from "../sheetIndex.js";
import type { StreateryDesign } from "../types.js";
import { ftIn, horizontalDim, labelStack, leaderLabel, verticalDim } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const MARGIN_LEFT_FT = 12;
// ALL-CAPS labels run ~0.58 ft/char at font-size 1 — clear the longest (~33 ft).
const MARGIN_RIGHT_FT = 46;
const SKY_FT = 5;
const DIM_BAND_FT = 6;
const SIDEWALK_CONTEXT_FT = 8;

// Deck build-up (feet). Decking + sleepers + pedestals must total the
// deck height — the pedestals are the ADJUSTABLE layer that absorbs
// street crown/slope, which is the §4.4 reason this assembly exists.
const DECKING_T_FT = 1 / 12; // composite board thickness
const SLEEPER_T_FT = 1.5 / 12; // 2x4 laid flat
const SLEEPER_W_FT = 3.5 / 12;
const SLEEPER_SPACING_FT = 16 / 12; // @ 16" O.C.
const PEDESTAL_W_FT = 4 / 12;

// Cut profiles of the lengthwise members.
const RAIL_HEIGHTS_FT = [10 / 12, 17.5 / 12, 25 / 12, 32.5 / 12];
const RAIL_CUT_W_FT = 1.5 / 12; // 2x4 end: 1.5" wide
const RAIL_CUT_H_FT = 3.5 / 12; // × 3.5" tall
const CAP_CUT_W_FT = 5.5 / 12; // 2x6 cap laid flat: 5.5" wide
const CAP_CUT_H_FT = 1.5 / 12;
const BEAM_CUT_W_FT = 3 / 12; // doubled 2x10: two 1.5" plies
const JOIST_DEPTH_FT = 5.5 / 12; // 2x6 running with the slope

export function buildSectionSvg(
  design: StreateryDesign,
  kind: "typical" | "entry",
): string {
  const W = design.platform.widthFt;
  const deckTopFt = design.platform.deckHeightFt;
  const enclosureTopFt = ENCLOSURE_TOP_IN / 12;
  const beamDepthFt = BEAM_DEPTH_IN / 12;

  const fasciaDepthFt = design.roof.peakHeightFt - design.roof.edgeHeightFt;
  const lowEdgeFt = design.roof.edgeHeightFt;
  const highEdgeFt = lowEdgeFt + ROOF_SLOPE_RATIO * W;
  const hasRoof = design.roofSegments.length > 0;

  const curbX = W;
  const sheetMinX = -MARGIN_LEFT_FT;
  const sheetMaxX = curbX + SIDEWALK_CONTEXT_FT + MARGIN_RIGHT_FT - 8;
  const sheetMinY = -((hasRoof ? highEdgeFt + fasciaDepthFt : enclosureTopFt) + SKY_FT);
  const yOf = (heightFt: number): number => -heightFt;

  const el: string[] = [];

  /** Cut-lumber profile: outlined rect with an X across it. */
  const cutMember = (x: number, topFt: number, w: number, h: number): string =>
    [
      `<rect x="${x}" y="${yOf(topFt)}" width="${w}" height="${h}" fill="#fff" stroke="#1c1917" stroke-width="0.06" />`,
      `<line x1="${x}" y1="${yOf(topFt)}" x2="${x + w}" y2="${yOf(topFt) + h}" stroke="#1c1917" stroke-width="0.03" />`,
      `<line x1="${x + w}" y1="${yOf(topFt)}" x2="${x}" y2="${yOf(topFt) + h}" stroke="#1c1917" stroke-width="0.03" />`,
    ].join("\n");

  // ---------- Ground, curb (cut concrete), sidewalk ----------

  el.push(
    `<line x1="${sheetMinX + 2}" y1="0" x2="${curbX}" y2="0" stroke="#1c1917" stroke-width="0.22" />`,
  );
  // Curb cut profile: solid block with diagonal concrete hatching.
  el.push(
    `<rect x="${curbX}" y="${yOf(deckTopFt)}" width="1.2" height="${deckTopFt + 0.8}" fill="#e7e5e4" stroke="#1c1917" stroke-width="0.12" />`,
  );
  for (let i = 0; i < 4; i++) {
    const off = 0.25 + i * 0.3;
    el.push(
      `<line x1="${curbX + off}" y1="${yOf(deckTopFt)}" x2="${curbX}" y2="${yOf(deckTopFt) + off}" stroke="#a8a29e" stroke-width="0.04" />`,
    );
  }
  el.push(
    `<line x1="${curbX + 1.2}" y1="${yOf(deckTopFt)}" x2="${curbX + SIDEWALK_CONTEXT_FT}" y2="${yOf(deckTopFt)}" stroke="#1c1917" stroke-width="0.22" />`,
    `<text x="${sheetMinX + 2}" y="1.6" font-size="1.0" font-family="sans-serif" fill="#57534e">TRAVEL LANE →</text>`,
    `<text x="${curbX + 1.6}" y="${yOf(deckTopFt) - 0.6}" font-size="1.0" font-family="sans-serif" fill="#57534e">SIDEWALK</text>`,
  );

  // ---------- Deck build-up ----------
  // Top down: decking → sleepers → pedestals → clear air to the road.
  // Pedestals stay out of the curb-side drainage channel; the channel
  // is open air under the deck where the gutter runs.

  const deckingTopFt = deckTopFt;
  const sleeperTopFt = deckingTopFt - DECKING_T_FT;
  const pedestalTopFt = sleeperTopFt - SLEEPER_T_FT;

  // Decking: continuous band (boards run with the cut).
  el.push(
    `<rect x="0" y="${yOf(deckingTopFt)}" width="${W}" height="${DECKING_T_FT}" fill="#e7e5e4" stroke="#1c1917" stroke-width="0.06" />`,
  );
  // Sleepers: cut 2x4 ends @ 16" O.C.
  el.push(`<g id="sleepers">`);
  for (let x = 0.2; x + SLEEPER_W_FT < W - 0.1; x += SLEEPER_SPACING_FT) {
    el.push(cutMember(x, sleeperTopFt, SLEEPER_W_FT, SLEEPER_T_FT));
  }
  el.push(`</g>`);
  // Pedestals: out of the drainage channel zone.
  el.push(`<g id="pedestals">`);
  for (let x = 0.4; x + PEDESTAL_W_FT < W - DRAINAGE_CHANNEL_FT; x += 2) {
    el.push(
      `<rect x="${x}" y="${yOf(pedestalTopFt)}" width="${PEDESTAL_W_FT}" height="${pedestalTopFt}" fill="#fff" stroke="#1c1917" stroke-width="0.07" />`,
      `<line x1="${x - 0.08}" y1="${yOf(pedestalTopFt / 2)}" x2="${x + PEDESTAL_W_FT + 0.08}" y2="${yOf(pedestalTopFt / 2)}" stroke="#1c1917" stroke-width="0.05" />`,
    );
  }
  el.push(`</g>`);

  // Drainage flow: arrow along the gutter under the deck, INTO the page
  // is meaningless in section, so the §4.6 story is told as clear space
  // + label (flow runs along the curb, perpendicular to this cut).
  el.push(
    `<circle cx="${W - DRAINAGE_CHANNEL_FT / 2}" cy="${yOf(pedestalTopFt / 2)}" r="0.22" fill="none" stroke="#1c1917" stroke-width="0.06" />`,
    `<circle cx="${W - DRAINAGE_CHANNEL_FT / 2}" cy="${yOf(pedestalTopFt / 2)}" r="0.05" fill="#1c1917" />`,
  );

  // ---------- 3/8" steel transition plate at the curb ----------
  // Flush sidewalk→deck per §4.4; drawn slightly heavy so it reads.

  el.push(
    `<line x1="${W - 0.6}" y1="${yOf(deckTopFt + PLATFORM_MAX_RISE_IN / 12)}" x2="${curbX + 0.6}" y2="${yOf(deckTopFt)}" stroke="#1c1917" stroke-width="0.12" />`,
  );

  // ---------- Street-side enclosure (cut rail ends) ----------

  el.push(`<g id="street-rails">`);
  for (const railFt of RAIL_HEIGHTS_FT) {
    el.push(
      cutMember(0.1, deckTopFt + railFt + RAIL_CUT_H_FT, RAIL_CUT_W_FT, RAIL_CUT_H_FT),
    );
  }
  el.push(cutMember(0.1 - (CAP_CUT_W_FT - RAIL_CUT_W_FT) / 2, enclosureTopFt, CAP_CUT_W_FT, CAP_CUT_H_FT));
  el.push(`</g>`);

  // ---------- Sidewalk-side: rails (typical) or open entry ----------

  if (kind === "typical") {
    el.push(`<g id="sidewalk-rails">`);
    for (const railFt of RAIL_HEIGHTS_FT) {
      el.push(
        cutMember(W - 0.1 - RAIL_CUT_W_FT, deckTopFt + railFt + RAIL_CUT_H_FT, RAIL_CUT_W_FT, RAIL_CUT_H_FT),
      );
    }
    el.push(
      cutMember(W - 0.1 - RAIL_CUT_W_FT - (CAP_CUT_W_FT - RAIL_CUT_W_FT) / 2, enclosureTopFt, CAP_CUT_W_FT, CAP_CUT_H_FT),
    );
    el.push(`</g>`);
  } else {
    // Entry cut: the opening — accessible route arrow from the sidewalk
    // onto the deck, flush threshold.
    const ay = yOf(deckTopFt) - 1.2;
    el.push(
      `<g id="accessible-route">`,
      `<line x1="${curbX + 4}" y1="${ay}" x2="${W - 2}" y2="${ay}" stroke="#1c1917" stroke-width="0.09" />`,
      `<polygon points="${W - 2},${ay} ${W - 1.3},${ay - 0.3} ${W - 1.3},${ay + 0.3}" fill="#1c1917" />`,
      `<text x="${curbX + 4}" y="${ay + 1.3}" font-size="0.9" font-family="sans-serif" fill="#1c1917">ACCESSIBLE ROUTE — FLUSH ENTRY, MAX ${PLATFORM_MAX_RISE_IN}&quot; RISE (§4.4)</text>`,
      `</g>`,
    );
  }

  // ---------- Roof assembly ----------

  if (hasRoof) {
    el.push(`<g id="roof">`);
    // Beams: cut end profiles (doubled 2x10) under each edge.
    el.push(
      cutMember(0.1, lowEdgeFt, BEAM_CUT_W_FT, beamDepthFt),
      cutMember(W - 0.1 - BEAM_CUT_W_FT, highEdgeFt, BEAM_CUT_W_FT, beamDepthFt),
    );
    // Joist: runs with the slope, beam to beam (drawn plain — the cut
    // plane is parallel to it, we see its side).
    el.push(
      `<polygon points="${0.1},${yOf(lowEdgeFt)} ${W - 0.1},${yOf(highEdgeFt)} ${W - 0.1},${yOf(highEdgeFt - JOIST_DEPTH_FT)} ${0.1},${yOf(lowEdgeFt - JOIST_DEPTH_FT)}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.07" />`,
    );
    // Panel over the joist, small overhangs.
    const panelT = 0.15;
    el.push(
      `<polygon points="${-0.7},${yOf(lowEdgeFt)} ${W + 0.7},${yOf(highEdgeFt)} ${W + 0.7},${yOf(highEdgeFt + panelT)} ${-0.7},${yOf(lowEdgeFt + panelT)}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
    // Posts beyond the cut (plain, lighter).
    el.push(
      `<rect x="0.1" y="${yOf(lowEdgeFt - beamDepthFt)}" width="${5.5 / 12}" height="${lowEdgeFt - beamDepthFt - deckTopFt}" fill="none" stroke="#a8a29e" stroke-width="0.06" />`,
      `<rect x="${W - 0.1 - 5.5 / 12}" y="${yOf(highEdgeFt - beamDepthFt)}" width="${5.5 / 12}" height="${highEdgeFt - beamDepthFt - deckTopFt}" fill="none" stroke="#a8a29e" stroke-width="0.06" />`,
    );
    el.push(`</g>`);
  }

  // ---------- Labels ----------

  const labelX = curbX + SIDEWALK_CONTEXT_FT + 2;
  const labels: Array<{ text: string; targetX: number; targetY: number }> = [
    {
      text: "COMPOSITE DECKING",
      targetX: W * 0.35,
      targetY: yOf(deckingTopFt - DECKING_T_FT / 2),
    },
    {
      text: '2x4 PT. WD. SLEEPERS @ 16" O.C.',
      targetX: 0.2 + SLEEPER_SPACING_FT + SLEEPER_W_FT / 2,
      targetY: yOf(sleeperTopFt - SLEEPER_T_FT / 2),
    },
    {
      text: "ADJUSTABLE PEDESTALS (LEVELING, NOT BOLTED — §4.4)",
      targetX: 0.4 + PEDESTAL_W_FT / 2 + 2,
      targetY: yOf(pedestalTopFt / 2),
    },
    {
      text: `${ftIn(DRAINAGE_CHANNEL_FT)} STORMWATER CHANNEL ALONG CURB — KEEP ACCESS (§4.6)`,
      targetX: W - DRAINAGE_CHANNEL_FT / 2,
      targetY: yOf(pedestalTopFt / 2),
    },
    {
      text: `3/8" STEEL TRANSITION PLATE, REMOVABLE, FLUSH (§4.4)`,
      targetX: curbX,
      targetY: yOf(deckTopFt) - 0.05,
    },
  ];
  if (hasRoof) {
    labels.push(
      {
        text: `${ROOF_PALETTE_LABELS[design.roofPalette]} — ${design.roof.slopeLabel}`,
        targetX: W * 0.55,
        targetY: yOf(lowEdgeFt + ROOF_SLOPE_RATIO * W * 0.55 + 0.1),
      },
      { text: BEAM_LABEL, targetX: 0.1 + BEAM_CUT_W_FT / 2, targetY: yOf(lowEdgeFt - beamDepthFt / 2) },
      { text: JOIST_LABEL, targetX: W * 0.7, targetY: yOf(lowEdgeFt + ROOF_SLOPE_RATIO * W * 0.7 - JOIST_DEPTH_FT / 2) },
      { text: `${POST_LABEL} (BEYOND)`, targetX: W - 0.1 - 5.5 / 24, targetY: yOf((deckTopFt + highEdgeFt) / 2) },
    );
  }
  if (kind === "typical") {
    labels.push({
      text: RAIL_MID_LABEL + " (CUT)",
      targetX: W - 0.1 - RAIL_CUT_W_FT / 2,
      targetY: yOf(deckTopFt + RAIL_HEIGHTS_FT[1]! + RAIL_CUT_H_FT / 2),
    });
  } else {
    labels.push({
      text: `ENTRY OPENING — ${ftIn(design.entry.widthFt)} CLR (MIN ${ENTRY_MIN_WIDTH_IN}", §4.4)`,
      targetX: W - 0.5,
      targetY: yOf(deckTopFt + 1.5),
    });
  }
  el.push(`<g id="labels">`);
  const stack = labelStack(
    hasRoof ? highEdgeFt + fasciaDepthFt : enclosureTopFt + 3,
    labels.length,
  );
  labels.forEach((lab, i) => {
    el.push(
      leaderLabel(labelX, yOf(stack.startFt - i * stack.spacingFt), lab.targetX, lab.targetY, lab.text),
    );
  });
  el.push(`</g>`);

  // ---------- Dimensions ----------

  el.push(`<g id="dimensions">`);
  el.push(horizontalDim(0, W, 2.9, 0, ftIn(W)));
  // Second row — the buffer label collided with the width text on a shared row.
  el.push(
    horizontalDim(-TRAVEL_SIDE_BUFFER_FT, 0, 4.7, 0, `${ftIn(TRAVEL_SIDE_BUFFER_FT)} BUFFER`),
  );
  el.push(verticalDim(yOf(deckTopFt), 0, -3, 0, ftIn(deckTopFt)));
  el.push(verticalDim(yOf(enclosureTopFt), 0, -5.5, 0, ftIn(enclosureTopFt)));
  if (hasRoof) {
    el.push(verticalDim(yOf(lowEdgeFt), 0, -8, 0, ftIn(lowEdgeFt)));
  }
  el.push(`</g>`);

  // ---------- Compose ----------

  return composeSheet(
    {
      viewTitle: sheetTitleForView(
        kind === "typical" ? "section" : "section-entry",
      ),
      design,
      sheetMinX,
      sheetMaxX,
      sheetMinY: Math.min(sheetMinY, -(stack.startFt + 1.2)),
      contentBottomY: DIM_BAND_FT,
      watermarkCenter: {
        x: (sheetMinX + sheetMaxX) / 2,
        y: yOf(enclosureTopFt + 2),
      },
    },
    el,
  );
}
