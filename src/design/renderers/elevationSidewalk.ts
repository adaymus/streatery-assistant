/**
 * Sidewalk-side elevation renderer: StreateryDesign → SVG.
 *
 * The view from the sidewalk looking at the structure's long face —
 * Martha Dear A100's "ELEVATION - WEST" / Queen's English A2.00's
 * "ELEVATION C". This is the public face: it carries the entry opening
 * (drawn as a real gap, not hidden-line) and the two §4.7 signage
 * placards, which only exist on this side.
 *
 * Drafting convention: opposite elevations are MIRROR images, so a
 * point at structure-local station s appears here at x = L − s. That
 * way the two long elevations "fold" correctly — the barrier end is on
 * the left here if it was on the right from the street.
 *
 * Coordinate system matches the street-side renderer: 1 SVG unit =
 * 1 foot, x = mirrored station, y grows downward, roadway grade at
 * y = 0 (the sidewalk is ~6" above it, same as the deck).
 */

import {
  BEAM_DEPTH_IN,
  ENCLOSURE_TOP_IN,
  PLATFORM_DECK_LABEL,
  POST_ACTUAL_IN,
  POST_LABEL,
  RAIL_MID_LABEL,
  RAIL_TOP_LABEL,
  ROOF_PALETTE_LABELS,
  ROOF_SLOPE_RATIO,
  SIGNAGE_HEIGHT_IN,
  SIGNAGE_LABEL,
  SIGNAGE_WIDTH_IN,
} from "../templateConstants.js";
import type { RenderOptions, SegmentFt, StreateryDesign } from "../types.js";
import { sheetTitleForView } from "../sheetIndex.js";
import { ftIn, horizontalDim, labelStack, leaderLabel, verticalDim } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const MARGIN_LEFT_FT = 10;
// ALL-CAPS labels run ~0.58 ft/char at font-size 1; the polycarbonate
// palette label is the longest (~41 ft) and still overflows — same
// standing issue as the street-side renderer (M1). A measured-text
// pass is M6 sheet-composition polish; 42 covers everything else.
const MARGIN_RIGHT_FT = 42;
const SKY_FT = 5;
const DIM_BAND_FT = 6;

/** Same rail stack as the street side: 2x4s under a 2x6 cap at 42". */
const RAIL_HEIGHTS_FT = [10 / 12, 17.5 / 12, 25 / 12, 32.5 / 12];
const RAIL_THICKNESS_FT = 3.5 / 12;
const CAP_RAIL_THICKNESS_FT = 5.5 / 12;

export function buildSidewalkElevationSvg(
  design: StreateryDesign,
  opts?: RenderOptions,
): string {
  // Outline + dimensions only when schematic (see RenderOptions).
  const schematic = opts?.schematic ?? false;

  const L = design.platform.lengthFt;
  const W = design.platform.widthFt;
  const deckTopFt = design.platform.deckHeightFt;
  const enclosureTopFt = ENCLOSURE_TOP_IN / 12;
  const beamDepthFt = BEAM_DEPTH_IN / 12;
  const postWidthFt = POST_ACTUAL_IN / 12;

  // The mirror: structure-local station s → this view's x.
  const xm = (stationFt: number): number => L - stationFt;
  // Mirror a segment (endpoints swap roles).
  const segm = (seg: SegmentFt): SegmentFt => ({
    startFt: xm(seg.endFt),
    endFt: xm(seg.startFt),
  });

  // The roof slopes DOWN toward the street (2:12 across the width), so
  // from the sidewalk we see the HIGH edge. The design model stores the
  // street-side fascia heights (the Martha Dear precedent dimensions);
  // the sidewalk-side heights derive from the slope. Enriching the
  // model with both edges is a candidate follow-up — for now the
  // derivation lives here and in the end/section renderers.
  const fasciaDepthFt = design.roof.peakHeightFt - design.roof.edgeHeightFt;
  const highEdgeFt = design.roof.edgeHeightFt + ROOF_SLOPE_RATIO * W;
  const highFasciaFt = highEdgeFt + fasciaDepthFt;

  const sheetMinX = -MARGIN_LEFT_FT;
  // No right-hand label column in schematic, so a small margin suffices.
  const sheetMaxX = L + (schematic ? 8 : MARGIN_RIGHT_FT);
  const sheetMinY = -(highFasciaFt + SKY_FT);
  const yOf = (heightFt: number): number => -heightFt;

  const el: string[] = [];

  // ---------- Ground: sidewalk grade in front, roadway beyond ----------
  // The viewer stands on the sidewalk, which is ~deck height above the
  // roadway. Drawing the near grade at deck height keeps the structure
  // reading "flush with the sidewalk" — the §4.4 requirement.

  el.push(
    `<line x1="${sheetMinX + 2}" y1="${yOf(deckTopFt)}" x2="${L + 6}" y2="${yOf(deckTopFt)}" stroke="#1c1917" stroke-width="0.22" />`,
  );
  if (!schematic) {
    for (let x = Math.ceil(sheetMinX + 2); x < L + 6; x += 2) {
      el.push(
        `<line x1="${x}" y1="${yOf(deckTopFt)}" x2="${x - 0.8}" y2="${yOf(deckTopFt) + 0.8}" stroke="#1c1917" stroke-width="0.05" />`,
      );
    }
    el.push(
      `<text x="${L + 6.5}" y="${yOf(deckTopFt) + 0.4}" font-size="1.0" font-family="sans-serif" fill="#57534e">SIDEWALK</text>`,
    );
  }

  // ---------- Deck edge band (flush with the sidewalk, so just a face line) ----------

  el.push(
    `<rect x="0" y="${yOf(deckTopFt)}" width="${L}" height="0.12" fill="${schematic ? "none" : "#e7e5e4"}" stroke="#1c1917" stroke-width="0.06" />`,
  );

  // ---------- Jersey barrier BEYOND (hidden-line convention) ----------
  // The barrier lives on the street side; from the sidewalk it is
  // occluded by the near rails, so it's dashed — same convention the
  // street view uses for the entry. It's not a sidewalk-face dimension,
  // so schematic drops it.

  const jb = design.jerseyBarrier;
  const jbm = segm(jb.segment);
  if (!schematic) {
    el.push(
      `<g id="jersey-barrier-beyond">`,
      `<rect x="${jbm.startFt}" y="${yOf(jb.heightFt)}" width="${jbm.endFt - jbm.startFt}" height="${jb.heightFt - deckTopFt}" fill="none" stroke="#78716c" stroke-width="0.07" stroke-dasharray="0.4,0.3" />`,
      `<text x="${(jbm.startFt + jbm.endFt) / 2}" y="${yOf(jb.heightFt + 0.5)}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#78716c">JERSEY BARRIER BEYOND</text>`,
      `</g>`,
    );
  }

  // ---------- Sidewalk-side enclosure: full length minus the entry ----------
  // The design model stores STREET-side enclosure segments (those
  // exclude the barrier run). The sidewalk side is railed end to end
  // with one opening at the entry.

  const entryHalf = design.entry.widthFt / 2;
  const entryStart = design.entry.stationFt - entryHalf;
  const entryEnd = design.entry.stationFt + entryHalf;
  const railSegments: SegmentFt[] = [
    { startFt: 0, endFt: Math.max(0, entryStart) },
    { startFt: Math.min(L, entryEnd), endFt: L },
  ]
    .filter((seg) => seg.endFt - seg.startFt > 0.05)
    .map(segm);

  // Schematic: one outline box per railed run (deck → cap-rail top).
  // Full set: the actual 2x4 rail stack under a 2x6 cap.
  el.push(`<g id="enclosure">`);
  for (const seg of railSegments) {
    const w = seg.endFt - seg.startFt;
    if (schematic) {
      el.push(
        `<rect x="${seg.startFt}" y="${yOf(enclosureTopFt)}" width="${w}" height="${enclosureTopFt - deckTopFt}" fill="none" stroke="#1c1917" stroke-width="0.1" />`,
      );
      continue;
    }
    for (const railFt of RAIL_HEIGHTS_FT) {
      el.push(
        `<rect x="${seg.startFt}" y="${yOf(deckTopFt + railFt + RAIL_THICKNESS_FT)}" width="${w}" height="${RAIL_THICKNESS_FT}" fill="#fff" stroke="#1c1917" stroke-width="0.07" />`,
      );
    }
    el.push(
      `<rect x="${seg.startFt}" y="${yOf(enclosureTopFt)}" width="${w}" height="${CAP_RAIL_THICKNESS_FT}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
    );
  }
  el.push(`</g>`);

  // ---------- Posts ----------
  // Structure, not drawing finish — rendered in both modes so the roof
  // reads as supported. Schematic draws clean outlines, roofed posts run
  // to the roof edge (no beam to tuck under).

  const inRoof = (stationFt: number): SegmentFt | undefined =>
    design.roofSegments.find(
      (seg) => stationFt >= seg.startFt - 0.01 && stationFt <= seg.endFt + 0.01,
    );

  el.push(`<g id="posts">`);
  for (const post of design.posts) {
    const roofed = inRoof(post.stationFt);
    // Sidewalk-side posts rise to the HIGH edge of the sloped roof.
    const topFt = roofed
      ? schematic
        ? highEdgeFt
        : highEdgeFt - beamDepthFt
      : enclosureTopFt;
    const x = Math.min(
      Math.max(xm(post.stationFt) - postWidthFt / 2, 0),
      L - postWidthFt,
    );
    el.push(
      `<rect x="${x}" y="${yOf(topFt)}" width="${postWidthFt}" height="${topFt - deckTopFt}" fill="${schematic ? "none" : "#f5f5f4"}" stroke="#1c1917" stroke-width="0.09" />`,
    );
  }
  el.push(`</g>`);

  // ---------- Roof ----------
  // Schematic: a single outline band per roofed run. Full set: high-edge
  // beam band + fascia band + corrugation ticks.

  el.push(`<g id="roof">`);
  for (const seg of design.roofSegments.map(segm)) {
    const w = seg.endFt - seg.startFt;
    if (schematic) {
      el.push(
        `<rect x="${seg.startFt}" y="${yOf(highFasciaFt)}" width="${w}" height="${highFasciaFt - highEdgeFt}" fill="none" stroke="#1c1917" stroke-width="0.1" />`,
      );
      continue;
    }
    el.push(
      `<rect x="${seg.startFt}" y="${yOf(highEdgeFt)}" width="${w}" height="${beamDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
    );
    el.push(
      `<rect x="${seg.startFt - 0.5}" y="${yOf(highFasciaFt)}" width="${w + 1}" height="${fasciaDepthFt}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
    for (let x = seg.startFt + 1; x < seg.endFt; x += 2) {
      el.push(
        `<line x1="${x}" y1="${yOf(highFasciaFt) + 0.12}" x2="${x}" y2="${yOf(highEdgeFt) - 0.12}" stroke="#a8a29e" stroke-width="0.04" />`,
      );
    }
  }
  el.push(`</g>`);

  // ---------- Trees (full set only — existing context, not dimension) ----------

  if (!schematic) {
    el.push(`<g id="trees">`);
    for (const tree of design.trees) {
      const x = xm(tree.stationFt);
      el.push(
        `<path d="M ${x - 0.5} 0 L ${x - 0.25} ${yOf(11)} L ${x + 0.25} ${yOf(11)} L ${x + 0.5} 0 Z" fill="#fff" stroke="#57534e" stroke-width="0.08" />`,
      );
      el.push(
        `<circle cx="${x}" cy="${yOf(14)}" r="4.5" fill="none" stroke="#57534e" stroke-width="0.07" stroke-dasharray="0.5,0.35" />`,
      );
    }
    el.push(`</g>`);
  }

  // ---------- Entry opening (on THIS side — drawn solid) ----------
  // Kept in schematic: the entry is a real opening AND carries the §4.4
  // clear-width dimension below.

  const em = { startFt: xm(entryEnd), endFt: xm(entryStart) };
  el.push(
    `<g id="entry">`,
    // Jamb lines where the rails stop.
    `<line x1="${em.startFt}" y1="${yOf(deckTopFt)}" x2="${em.startFt}" y2="${yOf(enclosureTopFt)}" stroke="#1c1917" stroke-width="0.1" />`,
    `<line x1="${em.endFt}" y1="${yOf(deckTopFt)}" x2="${em.endFt}" y2="${yOf(enclosureTopFt)}" stroke="#1c1917" stroke-width="0.1" />`,
    `</g>`,
  );

  // §4.7 signage placards and the material call-out column are both
  // descriptive finish — schematic renders neither. labelStackTopFt
  // feeds the sheet-top calc in the compose call; it stays null in
  // schematic (the sheet top is then just roof + sky).
  let labelStackTopFt: number | null = null;
  if (!schematic) {
    // ---------- §4.7 signage placards (sidewalk-facing edge only) ----------
    // Drawn at TRUE size (≈0.46 × 0.71 ft) mounted near the cap rail —
    // they read small because they ARE small; the leader label carries
    // the content requirements.

    const signW = SIGNAGE_WIDTH_IN / 12;
    const signH = SIGNAGE_HEIGHT_IN / 12;
    el.push(`<g id="signage">`);
    for (const stationFt of design.signageStationsFt) {
      const x = xm(stationFt) - signW / 2;
      el.push(
        `<rect x="${x}" y="${yOf(enclosureTopFt - CAP_RAIL_THICKNESS_FT)}" width="${signW}" height="${signH}" fill="#fff" stroke="#1c1917" stroke-width="0.06" />`,
      );
    }
    el.push(`</g>`);

    // ---------- Material labels (leader-line column on the right) ----------

    const labelX = L + 4;
    const labels: Array<{ text: string; targetX: number; targetY: number }> = [];
    if (design.roofSegments.length > 0) {
      const seg = segm(design.roofSegments[0]!);
      labels.push({
        text: `${ROOF_PALETTE_LABELS[design.roofPalette]} — ${design.roof.slopeLabel}`,
        targetX: seg.endFt - 1,
        targetY: yOf((highFasciaFt + highEdgeFt) / 2),
      });
    }
    const firstPost = design.posts[0];
    if (firstPost) {
      labels.push({
        text: POST_LABEL,
        targetX: xm(firstPost.stationFt),
        targetY: yOf((deckTopFt + enclosureTopFt) / 2 + 1.4),
      });
    }
    if (railSegments.length > 0) {
      const seg = railSegments[railSegments.length - 1]!;
      labels.push(
        {
          text: RAIL_TOP_LABEL,
          targetX: seg.endFt - 2,
          targetY: yOf(enclosureTopFt - CAP_RAIL_THICKNESS_FT / 2),
        },
        {
          text: RAIL_MID_LABEL,
          targetX: seg.endFt - 2,
          targetY: yOf(deckTopFt + RAIL_HEIGHTS_FT[1]! + RAIL_THICKNESS_FT / 2),
        },
      );
    }
    if (design.signageStationsFt.length > 0) {
      labels.push({
        text: SIGNAGE_LABEL,
        targetX: xm(design.signageStationsFt[0]!),
        targetY: yOf(enclosureTopFt - CAP_RAIL_THICKNESS_FT - signH / 2),
      });
    }
    labels.push({
      text: PLATFORM_DECK_LABEL,
      targetX: L * 0.3,
      targetY: yOf(deckTopFt) + 0.06,
    });
    const stack = labelStack(highFasciaFt, labels.length);
    labelStackTopFt = stack.startFt;
    el.push(`<g id="labels">`);
    labels.forEach((lab, i) => {
      el.push(
        leaderLabel(labelX, yOf(stack.startFt - i * stack.spacingFt), lab.targetX, lab.targetY, lab.text),
      );
    });
    el.push(`</g>`);
  }

  // ---------- Dimension strings ----------

  el.push(`<g id="dimensions">`);
  el.push(horizontalDim(0, L, 2.5, 0, ftIn(L)));
  // The entry clear width — the §4.4 accessibility dimension.
  el.push(
    horizontalDim(
      em.startFt,
      em.endFt,
      yOf(enclosureTopFt + 1.2),
      yOf(enclosureTopFt),
      `${ftIn(design.entry.widthFt)} CLR ENTRY`,
    ),
  );
  el.push(verticalDim(yOf(enclosureTopFt), 0, -3, 0, ftIn(enclosureTopFt)));
  if (design.roofSegments.length > 0) {
    el.push(verticalDim(yOf(highEdgeFt), 0, -6.5, 0, ftIn(highEdgeFt)));
  }
  el.push(`</g>`);

  // ---------- Compose ----------

  return composeSheet(
    {
      viewTitle: sheetTitleForView("sidewalk"),
      design,
      schematic,
      sheetMinX,
      sheetMaxX,
      sheetMinY:
        labelStackTopFt != null
          ? Math.min(sheetMinY, -(labelStackTopFt + 1.2))
          : sheetMinY,
      contentBottomY: DIM_BAND_FT,
      watermarkCenter: {
        x: (sheetMinX + sheetMaxX) / 2,
        y: yOf(highEdgeFt / 2 + 1),
      },
    },
    el,
  );
}
