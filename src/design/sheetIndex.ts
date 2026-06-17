/**
 * The drawing set's sheet index — one place that knows what sheets
 * exist, their numbers, and their order in the combined PDF.
 *
 * Numbering decision (M6): ONE VIEW PER SHEET. The Queen's English set
 * merged several views onto shared sheets (plan + 4 elevations on one
 * A2.00) — a paper-economy move from hand drafting. A generated set
 * gains nothing from it and merging would mean two title blocks or a
 * second composition layer, so each view gets its own sheet number.
 * TOPS accepts the set as one combined PDF (~25 MB limit; ours is
 * under 2 MB), so page count costs nothing.
 *
 * SHEET_INDEX order = page order in the combined PDF = the order the
 * G1.00 cover lists.
 */

export interface SheetEntry {
  /** Sheet number, e.g. "A2.00" — stamped into the sheet's title block. */
  number: string;
  /** Title as printed in the cover index (ALL CAPS, drafting style). */
  title: string;
  /** The CLI --view key whose output is this sheet. */
  view: string;
}

export const SHEET_INDEX: SheetEntry[] = [
  { number: "G1.00", title: "COVER SHEET", view: "cover" },
  {
    number: "G1.01",
    title: "GENERAL NOTES + DDOT REQUIREMENTS",
    view: "general-notes",
  },
  {
    number: "G2.00",
    title: "LIFE SAFETY + ACCESSIBILITY",
    view: "life-safety",
  },
  { number: "A1.00", title: "SITE PLAN", view: "site-plan" },
  { number: "A2.00", title: "ELEVATION — STREET SIDE", view: "street" },
  { number: "A2.01", title: "ELEVATION — SIDEWALK SIDE", view: "sidewalk" },
  { number: "A2.02", title: "END ELEVATION — LOW STATION", view: "end-low" },
  { number: "A2.03", title: "END ELEVATION — HIGH STATION", view: "end-high" },
  { number: "A3.00", title: "SECTION — TYPICAL", view: "section" },
  { number: "A3.01", title: "SECTION — ENTRY / ACCESSIBILITY", view: "section-entry" },
  { number: "A4.00", title: "DDOT STANDARD DETAILS", view: "ddot-details" },
];

/**
 * The views that survive into a SCHEMATIC set (the "--schematic" flag).
 *
 * Schematic mode answers one question — "how big is the streatery and
 * where does it sit?" — so it keeps the dimensioned plan and the four
 * elevations and drops the five boilerplate-heavy sheets (cover,
 * general notes, life safety, the two construction sections, and DDOT
 * standard details). Those sheets are almost entirely templating; a
 * stakeholder shouldn't have to wade through them to sanity-check the
 * dimensions, and their "finished" look is exactly what makes a draft
 * read as over-claiming what the engine can stand behind today.
 *
 * Listed as views (not sheet numbers) because the views registry is the
 * unit the CLI and the browser both iterate.
 */
export const SCHEMATIC_VIEWS: readonly string[] = [
  "site-plan",
  "street",
  "sidewalk",
  "end-low",
  "end-high",
];

/** SHEET_INDEX narrowed to the schematic set, in the same page order. */
export const SCHEMATIC_SHEET_INDEX: SheetEntry[] = SHEET_INDEX.filter((s) =>
  SCHEMATIC_VIEWS.includes(s.view),
);

/**
 * The title-block label for a view: "A2.00 — ELEVATION — STREET SIDE".
 * `suffix` lets variant renderers append site-derived context (e.g. the
 * approach-end marker on an end elevation).
 */
export function sheetTitleForView(view: string, suffix = ""): string {
  const entry = SHEET_INDEX.find((s) => s.view === view);
  if (!entry) {
    // A renderer asked for a view the index doesn't know — that's a
    // wiring bug worth failing loudly on, not printing "undefined".
    throw new Error(`No sheet index entry for view "${view}"`);
  }
  return `${entry.number} — ${entry.title}${suffix}`;
}
