/**
 * The streatery kit-of-parts: every FIXED dimension in the reference
 * template, as typed constants.
 *
 * Source of truth: `docs/v3-reference-set-teardown.md` Part 2 — the
 * dimension table extracted from the two DDOT-APPROVED drawing sets
 * (Martha Dear, 3110 Mt Pleasant St NW; Queen's English, 3410 11th St NW)
 * read against the DDOT Streatery Guidelines (FINAL, Dec 5 2024).
 *
 * Design philosophy (matches the approved sets): two independent
 * architects converged on the same structural vocabulary, so we treat
 * that vocabulary as FIXED and vary only what the site forces us to vary
 * (length, width, barrier end, roof extent, tree clearances, entry
 * position). Anything in this file changing means the *template* changed
 * — which, per the PSC process, means re-review. Site-to-site variation
 * must come through ParametricInputs instead.
 *
 * Units: feet unless a name says inches (In). Lumber sizes are NOMINAL
 * (a "6x6" post is 5.5" actual) — drawings label nominal, per convention.
 */

// ---------- Structural members (both approved sets agree) ----------

/** 6x6 pressure-treated post. §4.3 caps vertical members above 42" at 6" wide — the 6x6 sits exactly at the cap. */
export const POST_NOMINAL_IN = 6;
export const POST_ACTUAL_IN = 5.5;
export const POST_LABEL = "6x6 PT. WD. POST TYP.";

/** Queen's English A2.00: doubled 2x10 PT beams carry the roof; Martha Dear uses 2x6. We standardize on the heavier section. */
export const BEAM_LABEL = "2x 2x10 PT. WD. BEAM TYP.";
export const BEAM_DEPTH_IN = 10;

/** Queen's English A2.00 roof plan: 2x6 PT joists at 16" on center. */
export const JOIST_LABEL = "2x6 PT. WD. JOISTS @ 16\" O.C.";

/** Enclosure rails — Martha Dear A100 shows 2x6 top rail over stacked 2x4s. */
export const RAIL_TOP_LABEL = "2x6 PT. WD. RAILING";
export const RAIL_MID_LABEL = "2x4 PT. WD. RAILING";

// ---------- Maximum post bay spacing ----------

/**
 * Queen's English elevations dimension bays at 8'-0" and 10'-0".
 * We cap bays at 10 ft and divide the structure length evenly.
 * ARCHITECT-CONFIRM: structural spans are the architect's call; this
 * constant reproduces the approved precedent, not an engineering calc.
 */
export const MAX_POST_BAY_FT = 10;

// ---------- Jersey barrier (DDOT-provided, §4.2) ----------

/** DDOT's standard barrier: 6'(l) × 2'(w) × 36"(h), placed at the vehicular approach end, angled 45-60° inward. */
export const JERSEY_BARRIER_LENGTH_FT = 6;
export const JERSEY_BARRIER_WIDTH_FT = 2;
export const JERSEY_BARRIER_HEIGHT_IN = 36;
export const JERSEY_BARRIER_LABEL = "CONCRETE JERSEY BARRIER";
export const JERSEY_BARRIER_ANGLE_DEG_MIN = 45;
export const JERSEY_BARRIER_ANGLE_DEG_MAX = 60;

// ---------- Enclosure treatment (§4.2) ----------

/** Enclosure must top out between 32" and 42" above the roadway. Both approved sets run rails to ~42" over a 36" barrier band. */
export const ENCLOSURE_TOP_IN = 42;
export const ENCLOSURE_BARRIER_BAND_IN = 36;
/** §4.2: gaps between intermediate members may not exceed 19". */
export const ENCLOSURE_MAX_MEMBER_GAP_IN = 19;
/** §4.2: 3 ft safety gaps every 60-100 ft and at Fire Department Connections. */
export const SAFETY_GAP_FT = 3;
export const SAFETY_GAP_EVERY_FT = 60;

// ---------- Platform (§4.4) ----------

/**
 * Deck rides on adjustable pedestals at roughly curb height. 6" is the
 * typical DC curb reveal — Queen's English sections show the deck flush
 * with the curb top via a removable 3/8" steel transition plate.
 */
export const PLATFORM_DECK_HEIGHT_IN = 6;
/** §4.4: flush with the sidewalk, max 1/2" gap. Queen's English self-imposed 3/8" max rise. */
export const PLATFORM_MAX_RISE_IN = 0.375;
/** §4.4: minimum 36" clear entry from the sidewalk. Queen's English built 60"; we default to their precedent. */
export const ENTRY_MIN_WIDTH_IN = 36;
export const ENTRY_DEFAULT_WIDTH_IN = 60;
/** §4.6: structural elements must leave a 1 ft drainage channel along the curb. */
export const DRAINAGE_CHANNEL_FT = 1;
export const PLATFORM_DECK_LABEL =
  "COMPOSITE DECKING ON PT 2x4 SLEEPERS / ADJUSTABLE PEDESTALS";

// ---------- Width formula (the teardown's width reconciliation) ----------

/**
 * platform width = parking lane width − travel-side buffer.
 *
 * §4.2 (Type 2): enclosure treatments sit 2 ft from the adjacent travel
 * or bike lane. Martha Dear built exactly this: 6 ft platform inside
 * Mt Pleasant's 8 ft lane. The 2 ft is reducible next to a PROTECTED
 * bike lane subject to DDOT approval — not automated; architect call.
 */
export const TRAVEL_SIDE_BUFFER_FT = 2;
/** Below this width a streatery stops being buildable in practice (1 ft drainage + seating depth). */
export const MIN_VIABLE_PLATFORM_WIDTH_FT = 4;

// ---------- Overhead structure (§4.3) ----------

/** §4.3: roofs live 8-13 ft above platform grade. Queen's English self-capped at 12 ft (DOB Chapter 5 note). */
export const ROOF_MIN_HEIGHT_FT = 8;
export const ROOF_MAX_HEIGHT_FT = 12;
/**
 * Street-side roof edge height from Martha Dear A100's approved
 * elevations: 8'-3" to the underside, 8'-6 1/2" overall. We target the
 * same edge height so generated elevations match the approved precedent.
 */
export const ROOF_EDGE_HEIGHT_FT = 8.25;
export const ROOF_FASCIA_HEIGHT_FT = 8.54; // 8'-6 1/2"
/** Queen's English A2.00: 2:12 slope (~10%) draining toward the street gutter. */
export const ROOF_SLOPE_RATIO = 2 / 12;
export const ROOF_SLOPE_LABEL = "2:12 (10%) SLOPE TO CURB";

/** §4.3 roof exclusion buffers — same interval subtraction as the ground-level envelope, different table. */
export const ROOF_BUFFER_TREE_TRUNK_FT = 5;
export const ROOF_BUFFER_CROSSWALK_FT = 25;
export const ROOF_BUFFER_INTERSECTION_NO_XWALK_FT = 40;
/** Shortest roof run worth building (one short bay). Below this the layout omits the roof rather than draw a canopy sliver. */
export const MIN_ROOF_RUN_FT = 6;

// ---------- Street trees ----------

/** Martha Dear A100 (per UFD direction): maintain 12" clear to trunk. */
export const TREE_TRUNK_CLEARANCE_IN = 12;

// ---------- Required signage (§4.7 + Appendix 1) ----------

/** Two 5.5" × 8.5" signs, one near each end of the sidewalk-facing edge: business name, seating hours, capacity, emergency contact. No other branding permitted. */
export const SIGNAGE_WIDTH_IN = 5.5;
export const SIGNAGE_HEIGHT_IN = 8.5;
export const SIGNAGE_LABEL =
  '5.5"x8.5" SIGN PER §4.7 — NAME/HOURS/CAPACITY/CONTACT';

// ---------- Seating (§4.8) ----------

/** One seat per 15 sf of streatery area (structures subtracted), rounded down. */
export const SEATING_SF_PER_SEAT = 15;
/** Seats and tables sit 1 ft back from barriers/enclosure. */
export const SEATING_SETBACK_FT = 1;

// ---------- Aesthetic palette (the ONE axis the approved sets differ on) ----------

export type RoofPalette = "pvc-corrugated" | "polycarbonate";

export const ROOF_PALETTE_LABELS: Record<RoofPalette, string> = {
  // Martha Dear's choice
  "pvc-corrugated": "PVC CORRUGATED ROOFING",
  // Queen's English's choice
  polycarbonate: "POLY-CARBONATE SHEET ROOF W/ CONT. FLASHING",
};

export const DEFAULT_ROOF_PALETTE: RoofPalette = "pvc-corrugated";

// ---------- Barrier type selection (§4.2) ----------

/**
 * Type 1 (3-sided pinned Jersey barriers): Principal Arterials, plus
 * Minor Arterials with 4+ lanes / High Injury Network / Freight Network.
 * Type 2 (one approach-end barrier + enclosure): everything else.
 *
 * We can only see functional class in the data — the HIN/Freight checks
 * need DDOT layers we don't fetch, so FHWA 4 (Minor Arterial) gets
 * Type 2 with an architect-confirm note. FHWA 3 → Type 1 outright.
 * (FHWA 1-2 never reach the layout solver; prescreen disqualifies them.)
 */
export type BarrierType = "type1" | "type2";

export function barrierTypeForFunctionalClass(
  fhwaClass: number | null,
): { type: BarrierType; note: string | null } {
  if (fhwaClass === 3) {
    return {
      type: "type1",
      note: "Principal Arterial — Type 1 barriers required: concrete Jersey barriers on all three street-facing sides, pinned/linked, 12\" from the travel lane (§4.2).",
    };
  }
  if (fhwaClass === 4) {
    return {
      type: "type2",
      note: "Minor Arterial — Type 2 assumed. ARCHITECT-CONFIRM: becomes Type 1 if the block has 4+ travel lanes or is on the High Injury or Freight Network (§4.2) — not visible in our data.",
    };
  }
  return { type: "type2", note: null };
}
