/**
 * The two data shapes of the v3 drawing pipeline.
 *
 *   PrescreenResult ─→ extractInputs() ─→ ParametricInputs
 *                          ─→ layoutStreatery() ─→ StreateryDesign
 *                              ─→ renderers ─→ SVG
 *
 * ParametricInputs = everything that legitimately VARIES per site,
 * already reduced to plain numbers in the station/offset frame.
 * StreateryDesign = the fully-resolved geometry of one streatery —
 * the single source of truth every renderer projects from. Renderers
 * never re-derive geometry; if the Site Plan and the Elevation disagree,
 * the bug is here, not in the renderers.
 *
 * Coordinate convention ("station/offset" — borrowed from civil
 * engineering): station = feet along the curb, offset = feet from the
 * curb face (positive into the street). The pipeline uses two flavors:
 *   - BLOCKFACE station: 0 at the block's low-measure cross street.
 *     What envelope.ts already computes (startAlongBlockfaceFt).
 *   - STRUCTURE-LOCAL station: 0 at the structure's low-station end.
 *     What StreateryDesign stores and renderers draw in.
 * The anchor field carries the offset between the two so the Site Plan
 * (M2) can place the structure back on the block.
 */

import type { BarrierType, RoofPalette } from "./templateConstants.js";
export type { BarrierType } from "./templateConstants.js";

// ---------- RenderOptions ----------

/**
 * Per-render switches that change HOW a sheet is drawn without changing
 * the underlying StreateryDesign. Passed to every renderer so the whole
 * set responds to one flag.
 *
 * `schematic` is the "strip the architectural finish" mode: the renderers
 * draw the structure as a clean massing outline carrying only its
 * dimensions, and drop the boilerplate that makes a draft LOOK sealed
 * (title block, material call-outs, hatching, notes band). The point is
 * honesty — a deliberately diagrammatic drawing claims only "here is the
 * envelope and its size", which is exactly what the engine can stand
 * behind today. Default (undefined / false) = the full detailed set,
 * unchanged.
 */
export interface RenderOptions {
  schematic?: boolean;
}

// ---------- ParametricInputs ----------

/** A street tree that lands inside the structure's extent. */
export interface TreeInput {
  /** Structure-local station of the trunk, feet. */
  stationFt: number;
  /** e.g. "willow oak" — from Urban Forestry data; for labels. */
  commonName: string | null;
}

export interface ParametricInputs {
  // --- Identity (title block + labels) ---
  businessName: string;
  address: string;

  // --- The structure envelope (from the eligibility engine) ---
  /** Usable structure length, feet. The envelope length unless the operator wants shorter. */
  structureLengthFt: number;
  /** From the width formula: parking lane width − travel-side buffer. */
  platformWidthFt: number;
  /** The full parking-lane width, for annotation ("8'-0" PARK" in the ROW strip). */
  parkingLaneWidthFt: number;

  // --- Anchoring back to the block (Site Plan, M2) ---
  /** Blockface station where the structure starts (= envelope.startAlongBlockfaceFt). */
  structureStartStationFt: number;
  /** Total clipped-blockface length, feet. */
  blockfaceLengthFt: number;

  // --- Traffic / protection ---
  /**
   * Which structure-local end vehicles approach from. "low" = the
   * low-station end (structure-local 0). Derived from side-of-street +
   * route digitizing direction — heuristic, so layout always emits a
   * site-walk confirm note alongside it.
   */
  vehicularApproachEnd: "low" | "high";
  barrierType: BarrierType;
  /** Extra context note from barrier-type derivation (null when unambiguous). */
  barrierTypeNote: string | null;

  // --- Features that shape the layout ---
  /** Trees inside the structure extent (structure-local stations). */
  trees: TreeInput[];
  /**
   * Structure-local stations of crosswalk centers — may be negative or
   * beyond structureLengthFt (a crosswalk 20 ft past the structure still
   * pushes the §4.3 roof buffer into it).
   */
  crosswalkStationsFt: number[];
  /** Structure-local stations of the block's two intersections (ends of the blockface). */
  intersectionStationsFt: number[];

  // --- Operator choices ---
  /** Where the sidewalk entry lands, structure-local feet. Defaults to mid-structure. */
  entryStationFt: number;
  roofPalette: RoofPalette;

  // --- Data provenance ---
  /**
   * Set when the frontage window came from an assumption instead of the
   * DC Building Footprints polygon — flows onto the sheet as a confirm
   * note (the structure length isn't validated against the real
   * storefront width in that case). Null when the footprint was found.
   */
  frontageNote: string | null;

  // --- Street context (annotation only) ---
  speedLimitMph: number | null;
  functionalClassFhwa: number | null;
  streetName: string;
}

// ---------- StreateryDesign ----------

/** A [start, end] run along the structure, structure-local feet. */
export interface SegmentFt {
  startFt: number;
  endFt: number;
}

export interface PostPlacement {
  /** Structure-local station of the post CENTER, feet. */
  stationFt: number;
  /** True when the solver moved this post off its even-bay station (e.g. tree conflict). */
  shifted: boolean;
}

export interface TreeClearance {
  stationFt: number;
  /** Radius of the platform cutout around the trunk (12" per UFD). */
  clearanceRadiusFt: number;
  commonName: string | null;
}

export interface StreateryDesign {
  // --- Identity / provenance ---
  businessName: string;
  address: string;
  streetName: string;
  roofPalette: RoofPalette;
  /**
   * §4.2 protection class the street demands — resolved from the
   * functional classification. The details sheet picks DDOT's matching
   * standard diagram by it.
   */
  barrierType: BarrierType;
  /** ISO timestamp of generation (flows to the title block). */
  generatedAt: string;

  // --- Platform ---
  platform: {
    lengthFt: number;
    widthFt: number;
    /** Deck surface height above roadway, feet (~curb height). */
    deckHeightFt: number;
  };

  // --- Structure ---
  posts: PostPlacement[];
  /** Street-side enclosure runs (rails). Excludes the Jersey-barrier run. */
  enclosureSegments: SegmentFt[];
  /** Sidewalk-side entry opening. */
  entry: { stationFt: number; widthFt: number };

  // --- Protection ---
  jerseyBarrier: {
    /** Which structure-local end it guards. */
    atEnd: "low" | "high";
    /** The run it occupies, structure-local. */
    segment: SegmentFt;
    heightFt: number;
    /** §4.2: approach-end barrier angles 45-60° inward (drawn in plan; noted in elevation). */
    angledInward: boolean;
  };

  // --- Roof ---
  /**
   * Where overhead structure is permitted after §4.3 subtraction.
   * Empty array = no roof possible (note explains why).
   * M1 keeps the single longest segment; multi-segment is a later
   * refinement.
   */
  roofSegments: SegmentFt[];
  roof: {
    /** Street-side edge height above platform-adjacent roadway, feet. */
    edgeHeightFt: number;
    /** Top of fascia/peak at the sidewalk side, feet. */
    peakHeightFt: number;
    slopeLabel: string;
    /**
     * Longest §4.3-permitted run, feet — kept even when it fell below
     * the build threshold (roofSegments empty), so the notes library
     * can say WHY there is no roof without re-running the solver.
     */
    permittedRunFt: number;
  };

  // --- Trees ---
  trees: TreeClearance[];

  // --- Required extras ---
  /** Two §4.7 signs, sidewalk-facing, one near each end. */
  signageStationsFt: number[];
  seating: {
    /** Usable area after structure subtraction, sq ft. */
    areaSf: number;
    /** floor(areaSf / 15) per §4.8. */
    capacity: number;
  };

  // --- Anchor back to the block (Site Plan, M2) ---
  anchor: {
    structureStartStationFt: number;
    blockfaceLengthFt: number;
    vehicularApproachEnd: "low" | "high";
  };

  /**
   * Human-readable flags the renderers print on the drawing and the
   * package surfaces as architect/site-walk items. Same philosophy as
   * the pre-screener's siteWalkCaveats: derived honestly, never silent.
   */
  notes: string[];
}
