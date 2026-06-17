/**
 * Street-side elevation renderer: StreateryDesign → SVG.
 *
 * This is the view from the roadway looking at the structure's long
 * face — Martha Dear A100's "ELEVATION - EAST" / Queen's English
 * A2.00's "ELEVATION A". It's the drawing with the most information
 * density: barrier, rails, posts, roof line, tree, plus the dimension
 * strings the §5.2 checklist requires ("dimensions of streatery and any
 * proposed roof structure").
 *
 * Coordinate system: 1 SVG unit = 1 foot. x = structure-local station;
 * SVG's y grows DOWNWARD, so heights are drawn at (groundY − heightFt).
 * Everything is positioned with that one yOf() helper — if a component
 * ever looks like it's floating or buried, the bug is in its heightFt,
 * not in per-element math.
 */

import {
  BEAM_DEPTH_IN,
  BEAM_LABEL,
  ENCLOSURE_TOP_IN,
  JERSEY_BARRIER_LABEL,
  PLATFORM_DECK_LABEL,
  POST_ACTUAL_IN,
  POST_LABEL,
  RAIL_MID_LABEL,
  RAIL_TOP_LABEL,
  ROOF_PALETTE_LABELS,
} from "../templateConstants.js";
import { sheetTitleForView } from "../sheetIndex.js";
import type { RenderOptions, SegmentFt, StreateryDesign } from "../types.js";
import {
  escapeXml,
  ftIn,
  horizontalDim,
  labelStack,
  leaderLabel,
  verticalDim,
} from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

const MARGIN_LEFT_FT = 10; // room for the vertical dimension strings
const MARGIN_RIGHT_FT = 36; // room for the material-label column (longest palette label ~30 ft)
const SKY_FT = 5; // headroom above the roof
const DIM_BAND_FT = 6; // below ground: horizontal dimension strings

/** Rail heights (feet) for the street-side enclosure: stacked 2x4s under a 2x6 cap at 42" — gaps ≤19" per §4.2. */
const RAIL_HEIGHTS_FT = [10 / 12, 17.5 / 12, 25 / 12, 32.5 / 12];
const RAIL_THICKNESS_FT = 3.5 / 12; // 2x4 face
const CAP_RAIL_THICKNESS_FT = 5.5 / 12; // 2x6 face

export function buildElevationSvg(
  design: StreateryDesign,
  opts?: RenderOptions,
): string {
  // Schematic mode draws the structure as a clean massing outline with
  // only its dimension strings — no rails/posts/corrugation, no
  // material call-outs, no ground hatching. See RenderOptions.
  const schematic = opts?.schematic ?? false;

  const L = design.platform.lengthFt;
  const deckTopFt = design.platform.deckHeightFt;
  const enclosureTopFt = ENCLOSURE_TOP_IN / 12;
  const beamDepthFt = BEAM_DEPTH_IN / 12;
  const postWidthFt = POST_ACTUAL_IN / 12;

  // Sheet geometry. Ground line sits at y = 0 in "world" terms; the SVG
  // viewBox starts above the roof. Sheet furniture (background, notes
  // band, title block, scale bar, watermark) comes from composeSheet —
  // this renderer adopted the shared chrome in M6, completing the
  // extraction that sheetChrome.ts documented since M2.
  // Schematic has no right-hand label column, so it needs only a little
  // breathing room on the right instead of the full label margin.
  const sheetMinX = -MARGIN_LEFT_FT;
  const sheetMaxX = L + (schematic ? 8 : MARGIN_RIGHT_FT);
  const sheetMinY = -(design.roof.peakHeightFt + SKY_FT);
  const yOf = (heightFt: number): number => -heightFt;

  const el: string[] = [];

  // ---------- Ground ----------

  // Roadway grade: heavy line. The full set adds hatch ticks and a
  // ROADWAY label (the architectural ground symbol); schematic keeps
  // just the reference line.
  el.push(
    `<line x1="${sheetMinX + 2}" y1="0" x2="${L + 6}" y2="0" stroke="#1c1917" stroke-width="0.22" />`,
  );
  if (!schematic) {
    for (let x = Math.ceil(sheetMinX + 2); x < L + 6; x += 2) {
      el.push(
        `<line x1="${x}" y1="0" x2="${x - 0.8}" y2="0.8" stroke="#1c1917" stroke-width="0.05" />`,
      );
    }
    el.push(
      `<text x="${L + 6.5}" y="0.4" font-size="1.0" font-family="sans-serif" fill="#57534e">ROADWAY</text>`,
    );
  }

  // ---------- Platform deck band ----------
  // Outline only in schematic (no gray fill) so the sheet reads as a
  // diagram, not a rendering.

  el.push(
    `<rect x="0" y="${yOf(deckTopFt)}" width="${L}" height="${deckTopFt}" fill="${schematic ? "none" : "#e7e5e4"}" stroke="#1c1917" stroke-width="0.08" />`,
  );

  // ---------- Jersey barrier ----------
  // Side profile reads as a low solid block; the 45-60° plan rotation is
  // a plan-view fact, noted rather than drawn here.

  const jb = design.jerseyBarrier;
  if (schematic) {
    // Just the barrier's massing — a plain block at its end.
    el.push(
      `<rect x="${jb.segment.startFt}" y="${yOf(jb.heightFt)}" width="${jb.segment.endFt - jb.segment.startFt}" height="${jb.heightFt}" fill="none" stroke="#1c1917" stroke-width="0.1" />`,
    );
  } else {
    el.push(
      `<g id="jersey-barrier">`,
      `<rect x="${jb.segment.startFt}" y="${yOf(jb.heightFt)}" width="${jb.segment.endFt - jb.segment.startFt}" height="${jb.heightFt}" fill="#d6d3d1" stroke="#1c1917" stroke-width="0.1" />`,
      // §4.2/Appendix 3: reflectors on the traffic face.
      `<circle cx="${(jb.segment.startFt + jb.segment.endFt) / 2 - 1.5}" cy="${yOf(jb.heightFt / 2)}" r="0.18" fill="#facc15" stroke="#1c1917" stroke-width="0.04" />`,
      `<circle cx="${(jb.segment.startFt + jb.segment.endFt) / 2 + 1.5}" cy="${yOf(jb.heightFt / 2)}" r="0.18" fill="#facc15" stroke="#1c1917" stroke-width="0.04" />`,
      `</g>`,
    );
  }

  // ---------- Enclosure ----------
  // Schematic: one outline box per enclosure run (deck → cap-rail top).
  // Full set: the actual 2x4 rail stack under a 2x6 cap.

  el.push(`<g id="enclosure">`);
  for (const seg of design.enclosureSegments) {
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
    // 2x6 cap rail, top at 42" above the roadway per §4.2.
    el.push(
      `<rect x="${seg.startFt}" y="${yOf(enclosureTopFt)}" width="${w}" height="${CAP_RAIL_THICKNESS_FT}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
    );
  }
  el.push(`</g>`);

  // ---------- Posts ----------
  // Posts inside a roof segment rise to the beam; posts outside stop at
  // the enclosure cap (no overhead structure where §4.3 forbids it).
  // They render in BOTH modes — posts are structure, not drawing finish,
  // and they're what makes the roof read as SUPPORTED rather than
  // floating. Schematic draws them as clean outlines and runs roofed
  // posts all the way to the roof edge (there's no beam to tuck under).

  const inRoof = (stationFt: number): SegmentFt | undefined =>
    design.roofSegments.find(
      (seg) => stationFt >= seg.startFt - 0.01 && stationFt <= seg.endFt + 0.01,
    );

  el.push(`<g id="posts">`);
  for (const post of design.posts) {
    const roofed = inRoof(post.stationFt);
    const topFt = roofed
      ? schematic
        ? design.roof.edgeHeightFt
        : design.roof.edgeHeightFt - beamDepthFt
      : enclosureTopFt;
    const x = Math.min(Math.max(post.stationFt - postWidthFt / 2, 0), L - postWidthFt);
    el.push(
      `<rect x="${x}" y="${yOf(topFt)}" width="${postWidthFt}" height="${topFt - deckTopFt}" fill="${schematic ? "none" : "#f5f5f4"}" stroke="#1c1917" stroke-width="0.09" />`,
    );
  }
  el.push(`</g>`);

  // ---------- Roof ----------
  // Schematic: a single outline band per roofed run (the massing).
  // Full set: beam band + fascia band + corrugation ticks.

  el.push(`<g id="roof">`);
  for (const seg of design.roofSegments) {
    const w = seg.endFt - seg.startFt;
    if (schematic) {
      el.push(
        `<rect x="${seg.startFt}" y="${yOf(design.roof.peakHeightFt)}" width="${w}" height="${design.roof.peakHeightFt - design.roof.edgeHeightFt}" fill="none" stroke="#1c1917" stroke-width="0.1" />`,
      );
      continue;
    }
    // Doubled beam band under the roof edge.
    el.push(
      `<rect x="${seg.startFt}" y="${yOf(design.roof.edgeHeightFt)}" width="${w}" height="${beamDepthFt}" fill="#fff" stroke="#1c1917" stroke-width="0.09" />`,
    );
    // Roof band: street-side edge up to the fascia top (the 2:12 slope
    // runs across the WIDTH, so from the street it reads as a band).
    el.push(
      `<rect x="${seg.startFt - 0.5}" y="${yOf(design.roof.peakHeightFt)}" width="${w + 1}" height="${design.roof.peakHeightFt - design.roof.edgeHeightFt}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
    // Corrugation/panel ticks so the band reads as roofing, not a beam.
    for (let x = seg.startFt + 1; x < seg.endFt; x += 2) {
      el.push(
        `<line x1="${x}" y1="${yOf(design.roof.peakHeightFt) + 0.12}" x2="${x}" y2="${yOf(design.roof.edgeHeightFt) - 0.12}" stroke="#a8a29e" stroke-width="0.04" />`,
      );
    }
  }
  el.push(`</g>`);

  // Everything below — trees, the hidden-line entry, and the material
  // call-out column — is descriptive finish, not dimension, so schematic
  // skips it entirely.
  if (!schematic) {
    // ---------- Trees (drawn in front, structure continues behind) ----------

    el.push(`<g id="trees">`);
    for (const tree of design.trees) {
      const x = tree.stationFt;
      // Trunk: slightly tapered vertical, ground to canopy.
      el.push(
        `<path d="M ${x - 0.5} 0 L ${x - 0.25} ${yOf(11)} L ${x + 0.25} ${yOf(11)} L ${x + 0.5} 0 Z" fill="#fff" stroke="#57534e" stroke-width="0.08" />`,
      );
      // Canopy: dashed outline circle (existing feature, not built work).
      el.push(
        `<circle cx="${x}" cy="${yOf(14)}" r="4.5" fill="none" stroke="#57534e" stroke-width="0.07" stroke-dasharray="0.5,0.35" />`,
      );
      el.push(
        `<text x="${x}" y="${yOf(19.5)}" font-size="0.95" font-family="sans-serif" text-anchor="middle" fill="#57534e">EXG. TREE${tree.commonName ? ` (${escapeXml(tree.commonName.toUpperCase())})` : ""} — MAINTAIN 12&quot; CLEAR TO TRUNK PER UFD</text>`,
      );
    }
    el.push(`</g>`);

    // ---------- Entry (on the sidewalk side → hidden-line convention) ----------

    const entryHalf = design.entry.widthFt / 2;
    el.push(
      `<g id="entry-beyond">`,
      `<line x1="${design.entry.stationFt - entryHalf}" y1="${yOf(deckTopFt)}" x2="${design.entry.stationFt - entryHalf}" y2="${yOf(enclosureTopFt)}" stroke="#78716c" stroke-width="0.07" stroke-dasharray="0.4,0.3" />`,
      `<line x1="${design.entry.stationFt + entryHalf}" y1="${yOf(deckTopFt)}" x2="${design.entry.stationFt + entryHalf}" y2="${yOf(enclosureTopFt)}" stroke="#78716c" stroke-width="0.07" stroke-dasharray="0.4,0.3" />`,
      `<text x="${design.entry.stationFt}" y="${yOf(enclosureTopFt + 0.6)}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#78716c">ENTRY BEYOND — ${escapeXml(ftIn(design.entry.widthFt))} CLR</text>`,
      `</g>`,
    );
  }

  // ---------- Material labels (leader-line column on the right) ----------

  const labelX = L + 4;
  const labels: Array<{ text: string; targetX: number; targetY: number }> = [];
  if (design.roofSegments.length > 0) {
    const seg = design.roofSegments[design.roofSegments.length - 1]!;
    labels.push(
      {
        text: `${ROOF_PALETTE_LABELS[design.roofPalette]} — ${design.roof.slopeLabel}`,
        targetX: seg.endFt - 1,
        targetY: yOf((design.roof.peakHeightFt + design.roof.edgeHeightFt) / 2),
      },
      {
        text: BEAM_LABEL,
        targetX: seg.endFt - 1.5,
        targetY: yOf(design.roof.edgeHeightFt - beamDepthFt / 2),
      },
    );
  }
  const lastPost = design.posts[design.posts.length - 1];
  if (lastPost) {
    labels.push({
      text: POST_LABEL,
      targetX: lastPost.stationFt,
      targetY: yOf((deckTopFt + enclosureTopFt) / 2 + 1.4),
    });
  }
  const lastEnclosure =
    design.enclosureSegments[design.enclosureSegments.length - 1];
  if (lastEnclosure) {
    labels.push(
      {
        text: RAIL_TOP_LABEL,
        targetX: lastEnclosure.endFt - 2,
        targetY: yOf(enclosureTopFt - CAP_RAIL_THICKNESS_FT / 2),
      },
      {
        text: RAIL_MID_LABEL,
        targetX: lastEnclosure.endFt - 2,
        targetY: yOf(deckTopFt + RAIL_HEIGHTS_FT[1]! + RAIL_THICKNESS_FT / 2),
      },
    );
  }
  labels.push(
    {
      text: JERSEY_BARRIER_LABEL,
      targetX: (jb.segment.startFt + jb.segment.endFt) / 2,
      targetY: yOf(jb.heightFt - 0.4),
    },
    {
      text: PLATFORM_DECK_LABEL,
      targetX: L * 0.7,
      targetY: yOf(deckTopFt / 2),
    },
  );
  const stack = labelStack(design.roof.peakHeightFt, labels.length);
  // The material call-out column is descriptive finish, not dimension,
  // so schematic skips rendering it (the labels array built above is
  // simply left unused — harmless, and keeps the diff small).
  if (!schematic) {
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
  // Overall length, below grade.
  el.push(horizontalDim(0, L, 2.5, 0, ftIn(L)));
  // Roof run, when it doesn't cover everything.
  for (const seg of design.roofSegments) {
    if (seg.endFt - seg.startFt < L - 0.5) {
      el.push(
        horizontalDim(
          seg.startFt,
          seg.endFt,
          yOf(design.roof.peakHeightFt + 1.5),
          yOf(design.roof.peakHeightFt),
          `ROOF ${ftIn(seg.endFt - seg.startFt)}`,
        ),
      );
    }
  }
  // Heights on the left: enclosure top and roof edge.
  el.push(verticalDim(yOf(enclosureTopFt), 0, -3, 0, ftIn(enclosureTopFt)));
  if (design.roofSegments.length > 0) {
    el.push(
      verticalDim(yOf(design.roof.edgeHeightFt), 0, -6.5, 0, ftIn(design.roof.edgeHeightFt)),
    );
  }
  el.push(`</g>`);

  // ---------- Compose ----------

  return composeSheet(
    {
      viewTitle: sheetTitleForView("street"),
      design,
      schematic,
      sheetMinX,
      sheetMaxX,
      // No label column in schematic, so the sheet top is just the roof
      // + sky; the full set raises it to clear the label stack.
      sheetMinY: schematic ? sheetMinY : Math.min(sheetMinY, -(stack.startFt + 1.2)),
      contentBottomY: DIM_BAND_FT,
      watermarkCenter: {
        x: (sheetMinX + sheetMaxX) / 2,
        y: yOf(design.roof.edgeHeightFt / 2 + 1),
      },
    },
    el,
  );
}
