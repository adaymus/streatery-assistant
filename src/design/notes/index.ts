/**
 * The notes library's public surface.
 *
 *   evaluateNotes(scope, ctx)        → string[]      (what sheets print)
 *   evaluateNoteInstances(scope, ctx) → NoteInstance[] (M5 grouping/keys)
 *   formatNotesReport(ctx)           → string        (--notes CLI dump)
 *
 * Sheets request notes by scope; the library decides which apply by
 * running each block's condition predicate against the resolved design
 * + site data. A block that doesn't apply simply doesn't exist on that
 * sheet — no "N/A" placeholders, no silently-dropped requirements.
 */

import { NOTE_BLOCKS } from "./library.js";
import type {
  NoteContext,
  NoteInstance,
  NoteScope,
} from "./types.js";

export type { NoteBlock, NoteCategory, NoteContext, NoteInstance, NoteScope } from "./types.js";
export { NOTE_BLOCKS, sidewalkDepthFt } from "./library.js";

/** Evaluated blocks for one scope (or every scope), in registry order. */
export function evaluateNoteInstances(
  scope: NoteScope | "all",
  ctx: NoteContext,
): NoteInstance[] {
  return NOTE_BLOCKS.filter(
    (block) => (scope === "all" || block.scope === scope) && block.appliesWhen(ctx),
  ).map((block) => ({
    key: block.key,
    scope: block.scope,
    category: block.category,
    citation: block.citation,
    text: block.text(ctx),
  }));
}

/** Just the texts — what the sheet notes band renders. */
export function evaluateNotes(scope: NoteScope, ctx: NoteContext): string[] {
  return evaluateNoteInstances(scope, ctx).map((note) => note.text);
}

const SCOPE_HEADINGS: Record<NoteScope, string> = {
  layout: "LAYOUT NOTES — printed on every sheet (design.notes)",
  "site-plan": "SITE PLAN NOTES — appended on the site plan sheet",
  general: "GENERAL NOTES — the G1.01 sheet (M5) consumes these wholesale",
};

/**
 * Human-readable dump of every applicable note, grouped by scope, with
 * keys + citations + categories visible. This is the M4 acceptance
 * surface (CLI --notes) and doubles as the architect-conversation
 * artifact: "here is every note your sheet would carry, and why".
 */
export function formatNotesReport(ctx: NoteContext): string {
  const lines: string[] = [];
  for (const scope of ["layout", "site-plan", "general"] as NoteScope[]) {
    const notes = evaluateNoteInstances(scope, ctx);
    lines.push(`═══ ${SCOPE_HEADINGS[scope]} ═══`, "");
    if (notes.length === 0) {
      lines.push("  (none apply to this site)", "");
      continue;
    }
    notes.forEach((note, i) => {
      const cite = note.citation ? ` (${note.citation})` : "";
      lines.push(`${i + 1}. [${note.key}]${cite} — ${note.category}`);
      lines.push(`   ${note.text}`, "");
    });
  }
  return lines.join("\n");
}
