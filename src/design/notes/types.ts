/**
 * The notes library's data shapes.
 *
 * Core observation from the reference-set teardown: a large fraction of
 * an approved drawing set is CONDITIONAL BOILERPLATE, not site geometry
 * — pedestal-feet notes, floor-plating notes, APWA tables, drainage
 * notes. Those toggle by site condition (bike lane present → drop the
 * concrete-block detail) but don't vary dimensionally. So each note is
 * a keyed block with a CONDITION PREDICATE over the resolved design +
 * site data; sheets request notes by scope and the library decides
 * which apply. Same philosophy as the pre-screener's siteWalkCaveats:
 * derived honestly, never silent — and never printed when the
 * condition doesn't hold.
 */

import type { ParametricInputs, StreateryDesign } from "../types.js";
import type { SiteContext } from "../siteContext.js";

/**
 * Where a note appears:
 *  - "layout": derived by the layout solver; attached to design.notes,
 *    so EVERY sheet's notes band carries it (the M1-M3 behavior).
 *  - "site-plan": extras only the Site Plan sheet appends.
 *  - "general": the G1.01 "General Notes + DDOT Requirements" sheet
 *    (M5) consumes these wholesale; until then `--notes` dumps them.
 */
export type NoteScope = "layout" | "site-plan" | "general";

/**
 * Who acts on the note — used by M5 to group the G1.01 sheet and by
 * the package compiler to route items:
 *  - "regulatory": a DDOT/ADA rule the design must (and does) follow
 *  - "site-walk": something only a person on the sidewalk can verify
 *  - "architect": needs professional judgment before sealing
 *  - "operator": a choice or permit the restaurant owner drives
 *  - "data-provenance": where a number came from and how far to trust it
 */
export type NoteCategory =
  | "regulatory"
  | "site-walk"
  | "architect"
  | "operator"
  | "data-provenance";

/**
 * Everything a predicate may look at. `design` is always present;
 * `inputs` exists when evaluating during/after layout; `site` exists
 * once the SiteContext has been extracted (the drawings CLI always has
 * it). Blocks that need a missing field simply don't fire.
 */
export interface NoteContext {
  design: StreateryDesign;
  inputs?: ParametricInputs;
  site?: SiteContext;
}

export interface NoteBlock {
  /** Stable kebab-case id, e.g. "roof-rules" — referenced by sheets and tests. */
  key: string;
  scope: NoteScope;
  category: NoteCategory;
  /** Regs citation, e.g. "§4.2" or "Appendix 3" — null for pure data notes. */
  citation: string | null;
  /** The condition: true = this note belongs on the drawing for THIS site. */
  appliesWhen(ctx: NoteContext): boolean;
  /** The note text, parameterized by the resolved design/site values. */
  text(ctx: NoteContext): string;
}

/** An evaluated block: the text plus the metadata M5 grouping needs. */
export interface NoteInstance {
  key: string;
  scope: NoteScope;
  category: NoteCategory;
  citation: string | null;
  text: string;
}
