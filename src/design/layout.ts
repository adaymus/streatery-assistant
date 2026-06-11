/**
 * The layout solver: ParametricInputs → StreateryDesign.
 *
 * Takes the site-driven parameters and places every component of the
 * kit-of-parts. This file is deliberately pure geometry + rules — no
 * data fetching, no SVG. That keeps it unit-testable with hand-built
 * inputs (no network) and means every renderer downstream shares one
 * resolved truth.
 *
 * Rules implemented here, with sources:
 *   - Jersey barrier at the vehicular approach end, angled in   (§4.2)
 *   - Enclosure rails on remaining street-side runs             (§4.2)
 *   - Posts at even bays ≤ 10 ft (Queen's English precedent)
 *   - Roof extent = structure minus §4.3 exclusions (reuses the
 *     envelope engine's longestGapInWindow — same algorithm, different
 *     buffer table)
 *   - 12" trunk clearance at trees (UFD, per Martha Dear A100)
 *   - Seating capacity = floor(usable sf / 15)                  (§4.8)
 *   - Two sidewalk-facing signs                                 (§4.7)
 *
 * Notes (the human-readable flags on every sheet) come from the M4
 * notes library, evaluated against the assembled design at the end —
 * this file decides GEOMETRY, src/design/notes/ decides WORDING and
 * which conditions warrant a note.
 */

import { longestGapInWindow } from "../envelope.js";
import { evaluateNotes } from "./notes/index.js";
import {
  ENTRY_DEFAULT_WIDTH_IN,
  JERSEY_BARRIER_HEIGHT_IN,
  JERSEY_BARRIER_LENGTH_FT,
  MAX_POST_BAY_FT,
  MIN_ROOF_RUN_FT,
  PLATFORM_DECK_HEIGHT_IN,
  POST_ACTUAL_IN,
  ROOF_BUFFER_CROSSWALK_FT,
  ROOF_BUFFER_INTERSECTION_NO_XWALK_FT,
  ROOF_BUFFER_TREE_TRUNK_FT,
  ROOF_EDGE_HEIGHT_FT,
  ROOF_FASCIA_HEIGHT_FT,
  ROOF_SLOPE_LABEL,
  SEATING_SF_PER_SEAT,
  TREE_TRUNK_CLEARANCE_IN,
} from "./templateConstants.js";
import type {
  ParametricInputs,
  PostPlacement,
  SegmentFt,
  StreateryDesign,
  TreeClearance,
} from "./types.js";

/** Shortest structure the kit-of-parts makes sense for (barrier + one usable bay). */
const MIN_STRUCTURE_FT = 10;

export function layoutStreatery(inputs: ParametricInputs): StreateryDesign {
  const L = inputs.structureLengthFt;
  const W = inputs.platformWidthFt;

  if (L < MIN_STRUCTURE_FT) {
    throw new Error(
      `Structure length ${L.toFixed(1)} ft is below the ${MIN_STRUCTURE_FT} ft ` +
        `minimum for the reference template (Jersey barrier + one usable bay).`,
    );
  }

  // ---------- 1. Jersey barrier at the vehicular approach end ----------

  const barrierAtLow = inputs.vehicularApproachEnd === "low";
  const barrierSegment: SegmentFt = barrierAtLow
    ? { startFt: 0, endFt: JERSEY_BARRIER_LENGTH_FT }
    : { startFt: L - JERSEY_BARRIER_LENGTH_FT, endFt: L };

  // ---------- 2. Street-side enclosure = everything the barrier doesn't cover ----------
  // (§4.2's 3 ft safety gaps every 60-100 ft are a notes-library
  // condition — Mt Pleasant envelopes run well under 60 ft, so we note
  // rather than model until a site needs it.)

  const enclosureSegments: SegmentFt[] = barrierAtLow
    ? [{ startFt: barrierSegment.endFt, endFt: L }]
    : [{ startFt: 0, endFt: barrierSegment.startFt }];

  // ---------- 3. Tree clearances (the layout-vs-eligibility distinction) ----------
  // The envelope engine rightly gives trees no ground buffer (they live
  // in the planter strip, not the parking lane) — but the STRUCTURE must
  // still clear each trunk by 12" and hold the roof back 5 ft (§4.3).

  const trees: TreeClearance[] = inputs.trees.map((t) => ({
    stationFt: t.stationFt,
    clearanceRadiusFt: TREE_TRUNK_CLEARANCE_IN / 12,
    commonName: t.commonName,
  }));

  // ---------- 4. Posts: even bays, nudged off tree trunks ----------

  const bayCount = Math.max(1, Math.ceil(L / MAX_POST_BAY_FT));
  const bayFt = L / bayCount;
  const postHalfWidthFt = POST_ACTUAL_IN / 12 / 2;
  const posts: PostPlacement[] = [];
  for (let i = 0; i <= bayCount; i++) {
    const idealFt = i * bayFt;
    // A post can't stand inside a tree's clearance circle. Nudge it just
    // outside (toward whichever side keeps it on the platform).
    const conflict = trees.find(
      (t) =>
        Math.abs(idealFt - t.stationFt) <
        t.clearanceRadiusFt + postHalfWidthFt,
    );
    if (!conflict) {
      posts.push({ stationFt: idealFt, shifted: false });
      continue;
    }
    const clearance = conflict.clearanceRadiusFt + postHalfWidthFt + 0.25;
    const shiftedLow = conflict.stationFt - clearance;
    const shiftedHigh = conflict.stationFt + clearance;
    // Prefer the direction that stays inside the structure.
    const stationFt =
      shiftedLow >= 0 && idealFt <= conflict.stationFt
        ? shiftedLow
        : Math.min(shiftedHigh, L);
    posts.push({ stationFt, shifted: true });
  }

  // ---------- 5. Roof extent: the envelope algorithm, §4.3 buffer table ----------
  // Same interval subtraction that sized the ground envelope, with the
  // overhead-structure exclusions instead of the §3.4 ground buffers.

  const roofForbidden: Array<[number, number]> = [];
  for (const t of trees) {
    roofForbidden.push([
      t.stationFt - ROOF_BUFFER_TREE_TRUNK_FT,
      t.stationFt + ROOF_BUFFER_TREE_TRUNK_FT,
    ]);
  }
  for (const xw of inputs.crosswalkStationsFt) {
    roofForbidden.push([
      xw - ROOF_BUFFER_CROSSWALK_FT,
      xw + ROOF_BUFFER_CROSSWALK_FT,
    ]);
  }
  // Intersections only bite when no crosswalk is nearby — if a crosswalk
  // sits at the corner, its own (tighter) 25 ft buffer governs instead
  // of the bare-intersection 40 ft. "Nearby" = within 15 ft, the same
  // tolerance the envelope engine uses for its end-of-block checks.
  for (const ix of inputs.intersectionStationsFt) {
    const hasCrosswalk = inputs.crosswalkStationsFt.some(
      (xw) => Math.abs(xw - ix) < 15,
    );
    if (!hasCrosswalk) {
      roofForbidden.push([
        ix - ROOF_BUFFER_INTERSECTION_NO_XWALK_FT,
        ix + ROOF_BUFFER_INTERSECTION_NO_XWALK_FT,
      ]);
    }
  }

  const roofGap = longestGapInWindow(0, L, roofForbidden);
  const roofRunFt = roofGap.end - roofGap.start;
  const roofSegments: SegmentFt[] =
    roofRunFt >= MIN_ROOF_RUN_FT
      ? [{ startFt: roofGap.start, endFt: roofGap.end }]
      : [];

  // ---------- 6. Entry (sidewalk side) ----------

  const entryWidthFt = ENTRY_DEFAULT_WIDTH_IN / 12;
  // Clamp so the opening stays fully on the platform and off the barrier run.
  const entryMin =
    (barrierAtLow ? barrierSegment.endFt : 0) + entryWidthFt / 2;
  const entryMax =
    (barrierAtLow ? L : barrierSegment.startFt) - entryWidthFt / 2;
  const entryStationFt = Math.min(
    Math.max(inputs.entryStationFt, entryMin),
    entryMax,
  );

  // ---------- 7. Signage (§4.7): two signs, sidewalk-facing, near each end ----------

  const signageStationsFt = [2, L - 2];

  // ---------- 8. Seating capacity (§4.8) ----------
  // Usable area = platform minus the barrier run minus tree openings.
  // (§4.8's own worked example: 6 ft × 18 ft = 108 sf → 7 seats.)

  const treeCutoutSf = trees.reduce(
    (sum, t) => sum + Math.PI * t.clearanceRadiusFt ** 2,
    0,
  );
  const usableSf = Math.max(
    0,
    (L - JERSEY_BARRIER_LENGTH_FT) * W - treeCutoutSf,
  );
  const capacity = Math.floor(usableSf / SEATING_SF_PER_SEAT);

  // ---------- 9. Assemble, then let the notes library read the result ----------

  const design: StreateryDesign = {
    businessName: inputs.businessName,
    address: inputs.address,
    streetName: inputs.streetName,
    roofPalette: inputs.roofPalette,
    barrierType: inputs.barrierType,
    generatedAt: new Date().toISOString(),
    platform: {
      lengthFt: L,
      widthFt: W,
      deckHeightFt: PLATFORM_DECK_HEIGHT_IN / 12,
    },
    posts,
    enclosureSegments,
    entry: { stationFt: entryStationFt, widthFt: entryWidthFt },
    jerseyBarrier: {
      atEnd: inputs.vehicularApproachEnd,
      segment: barrierSegment,
      heightFt: JERSEY_BARRIER_HEIGHT_IN / 12,
      angledInward: true,
    },
    roofSegments,
    roof: {
      edgeHeightFt: ROOF_EDGE_HEIGHT_FT,
      peakHeightFt: ROOF_FASCIA_HEIGHT_FT,
      slopeLabel: ROOF_SLOPE_LABEL,
      permittedRunFt: roofRunFt,
    },
    trees,
    signageStationsFt,
    seating: { areaSf: Math.round(usableSf), capacity },
    anchor: {
      structureStartStationFt: inputs.structureStartStationFt,
      blockfaceLengthFt: inputs.blockfaceLengthFt,
      vehicularApproachEnd: inputs.vehicularApproachEnd,
    },
    notes: [],
  };

  // The library's "layout" scope reproduces what this file used to word
  // inline — condition predicates over the assembled design + inputs.
  design.notes = evaluateNotes("layout", { design, inputs });
  return design;
}
