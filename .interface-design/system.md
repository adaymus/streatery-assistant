# Streatery Check — Design System

## Direction

**A public document, not a dashboard.** The product generates architect's
drawing sheets; the UI speaks the same graphic language — the trustworthy
clarity of a good drawing set crossed with the approachability of a
neighborhood notice board. The website previews the documents it produces.

Feel: drafting precision on warm civic materials. Quiet, legible, honest.
Audience: cold visitors first (citizens, restaurant owners, journalists,
city officials); operator-grade detail preserved behind progressive
disclosure, never deleted.

## Tokens (Tailwind v4 `@theme` in `src/index.css`)

Named from the product's world — Mt. Pleasant streets and drawing sheets:

| Token | Role |
|---|---|
| `desk` / `vellum` / `wash` | Surface elevation, light→lighter warm papers, whisper-apart |
| `graphite` / `graphite-soft` / `graphite-faint` | Ink hierarchy (primary / secondary / labels) |
| `hairline` / `rule` | Border hierarchy: hairline disappears until sought; rule is a findable title-block edge |
| `brick` / `brick-deep` | THE one accent (Mt. Pleasant rowhouses). Actions, links, the header binding-tape bar. Never decoration elsewhere |
| `tree` + `tree-wash` | ELIGIBLE (willow-oak green) |
| `curb` + `curb-wash` | ELIGIBLE WITH CAVEATS (curb-paint yellow) |
| `signal` + `signal-wash` | INELIGIBLE (stop-sign red) |

Semantic colors are verdicts only — never decoration.

## Typography

- **Sans**: Public Sans Variable (`@fontsource-variable/public-sans`) —
  the USWDS typeface; chosen because this is a civic tool.
- **Mono**: `ui-monospace` stack — dimensions, addresses, IDs, counts
  (always `tabular-nums` for numbers in columns).
- **Section labels**: `text-[11px] font-semibold uppercase tracking-[0.18em]
  text-graphite-faint` — the title-block label voice. Used everywhere a
  section begins (see `SectionLabel` in ResultPanel).

## Depth & shape

- **Borders-only.** No shadows anywhere. Hairline rules divide sections
  inside one continuous sheet; `rule`-weight borders edge the sheet and
  inputs.
- **Radius**: `rounded-xs` (2px) — drawing sheets are square; sharp feels
  drafted. Applied uniformly: buttons, inputs, chips, the sheet.
- **Spacing**: Tailwind default scale; section padding `px-5 sm:px-7 py-6`,
  page column `max-w-4xl`.
- **Motion**: `transition-colors duration-150` only. Nothing bouncy.

## Signature patterns

- **The sheet**: results render as ONE `bg-vellum border border-rule`
  article with a title block header; sections divided by `border-t
  border-hairline` — never floating cards.
- **Verdict stamp** (`VerdictStamp`): double-ring border (outer
  `border-2` + inner `border`, 3px gap), `-rotate-2`, verdict color,
  "PRELIMINARY SCREEN" sublabel. Must never read as DDOT approval.
- **Envelope strip** (`EnvelopeStrip.tsx`): measured curb diagram from
  real station coordinates. Drafting conventions are load-bearing: 45°
  dimension ticks (never arrowheads), break marks on continuing lines,
  feet-and-inches via the shared `ftIn()` helper, dashed extension lines.
  On phones it keeps `min-w-[520px]` and pans inside `overflow-x-auto`.
- **Keynote diamonds**: numbered steps use a rotated-square outline with
  a mono digit (see `HowItWorks`) — drawing-sheet keynotes, not badges.
- **Brick binding tape**: `border-t-[3px] border-t-brick` on the header —
  the single decorative use of the accent.

## Voice

- Plain English leads every section; jargon (blockface, envelope, FHWA
  class, confidence scores) lives under a "Technical detail" disclosure.
- Feet-and-inches (`ftIn`) in diagrams; "about N feet" in prose.
- Verdict headlines are sentences: "Yes — a streatery fits here." /
  "Possibly — but it would take extra steps." / "No — …under current rules."
- Caveats explain what to verify, not legal disclaimers.
