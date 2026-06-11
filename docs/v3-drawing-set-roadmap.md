# v3 — Drawing Set Roadmap

**Date:** 2026-06-11
**Goal:** generate a Design Permit drawing set as comprehensive as the Queen's
English set (5 sheets, the fullest approved example we have), parametrically,
for any pre-screened address.
**Evidence base:** `docs/v3-reference-set-teardown.md` — the §5.2 checklist
mapping and the Part 2 dimension spec are the contract for everything below.

> Numbering note: code comments written during M1 refer to the site plan as
> "M2" (e.g. in `src/design/types.ts`). This roadmap renumbers: elevations +
> sections land first because they reuse geometry the design model already
> resolves. The comments will catch up as those files are touched.

## Where we are (post-M1)

| Asset | State |
|---|---|
| `StreateryDesign` model (`src/design/types.ts`) | ✓ Single source of truth; every renderer projects from it, never re-derives geometry |
| Street-side elevation renderer | ✓ M1, validated against both approved sets |
| Frontage-true envelope | ✓ 2026-06-11 — confined to the Building Footprints storefront extent; `--frontage` models §4.1 consent extensions |
| Site plan | ✓ M3, 2026-06-11 — `src/design/renderers/sitePlan.ts` renders from `StreateryDesign` + `SiteContext` (`src/design/siteContext.ts`); CLI `--view site-plan`. Offsets referenced to the REAL curb via the Planimetrics Curb layer (`src/curbs.ts` + `src/design/planFrame.ts`) — the Roadway Blockface polyline turned out to be ~12-25 ft off the curb (see CLAUDE.md corrections), which also fixed the latent "no trees in structure" bug. The old `src/sitePlanMockup.ts` strawman still backs `npm run site-plan` until the web app adopts this renderer |
| Elevation family + sections (M2) | ✓ 2026-06-11 — sidewalk, end ×2, section ×2 via shared `sheetChrome.ts`; CLI `--view`. Validated: Queen's English's own address generates a 24'-7½" envelope vs their approved 25'-0" structure, and 7'-0" platform = their "DDOT allowance" width |
| Notes library (M4) | ✓ 2026-06-11 — `src/design/notes/`: 31 keyed blocks across three scopes (layout / site-plan / general), each with a condition predicate + regs citation + category. Layout solver and Site Plan renderer now source their notes from it; `npm run drawings -- "<addr>" --notes` dumps the evaluated set. Conditional toggles verified: QE fires `concrete-blocks-waived` (bike lane) + tree/partial-roof notes; Martha Dear fires `concrete-blocks-required` and neither tree note |
| Static/semi-static sheets (M5) | ✓ 2026-06-11 — G1.00 cover (project data + SSL from Owner Polygons + sheet index + real-street vicinity map), G1.01 general notes (library "general" scope, two-column, grouped by category), G2.00 life-safety (seating solver + ADA table + egress + occupant load), A4.00 DDOT details (Appendix 3/6 + §4.2 figures embedded near-verbatim from the guidelines PDF via `scripts/extract-guideline-assets.sh`; concrete-block detail stamped NOT REQUIRED when a bike lane is present — QE precedent reproduced). Full 11-view set: `docs/drawing-set-3110-mt-pleasant/` |
| Kit-of-parts dimensions | ✓ Settled (teardown Part 2 master table) — both approved sets converged on the same vocabulary |

**The core observation driving the architecture:** a large fraction of the
Queen's English set is *conditional boilerplate, not site geometry* — pedestal
feet notes, floor plating notes, APWA tables, drainage notes, the entire A2.01
DDOT-details sheet. Those toggle by site condition (bike lane present → drop
the concrete-block detail) but don't vary dimensionally. That's a **notes
library**, not a renderer, and it's what makes restaurants #2–#8 cheap.

## Sheet-to-milestone map (Queen's English structure as target)

| QE sheet | Contents | §5.2 item | Milestone |
|---|---|---|---|
| G1.00 | Cover: project data, sheet index, vicinity map, zoning/SSL | — | M5 |
| G1.01 | General notes + DDOT requirements | — | M4 (library) + M5 (sheet) |
| G2.00 | Life-safety / accessibility: seating layout, capacity, ADA table, egress | — | M5 |
| A2.00 | New-work plan, elevations (all sides), sections | 1 (partial), 2, 3 | M2 (elevations, sections) + M3 (plan) |
| A2.01 | DDOT standard details (Appendix 3/5, Type-2 barrier), condition-toggled | 4, 5 (partial) | M5 |
| — (Martha Dear's strength) | Site plan with meter numbers, ROW cross-section, trees + pits | 1 | M3 |

## Milestones

### M2 — Complete the elevation family + sections

The remaining three elevations (sidewalk side, two ends) are projections of
the same `StreateryDesign` the street side already renders from. Sections are
nearly *fixed*: the deck build-up (adjustable pedestals, 2×4 PT sleepers,
composite decking, 3⁄8" curb plate, 1 ft drainage channel) is the settled
kit-of-parts with only width/heights parametric.

- Deliverables: `sidewalk-side elevation`, `end elevation ×2`, `typical
  section`, `entry/accessibility section` renderers; CLI grows a `--view`
  flag.
- Covers: §5.2 items 2 (elevations all sides) and 3 (sections).
- Acceptance: dimensions diff clean against the teardown Part 2 master table
  for both Martha Dear and Queen's English inputs.

### M3 — Site plan from the design model ✓ (2026-06-11)

Port/replace `sitePlanMockup.ts` to render from `StreateryDesign` + the
prescreen bundle. Everything the checklist demands is already fetched:
building footprint, **meter numbers to remove** (the thing DDOT explicitly
wants), trees + tree boxes, hydrants, ROW cross-section dims (sidewalk /
parking / travel widths from Roadway Block), setback dimensions.

- Covers: §5.2 item 1 — the sheet Martha Dear's approved set was strongest on.
- Acceptance: side-by-side review against Martha Dear A100 content list
  (teardown checklist row 1).

**Landed.** `SiteContext` (block context in blockface stations) +
`buildSitePlanSvg` through the shared `sheetChrome`. Validation against the
A100 content list:

- ROW cross-section dims: park **8'-0"** ✓ and travel **12'-0"** ✓ match
  A100 exactly (travel = `TOTALTRAVELLANEWIDTH/TOTALTRAVELLANES`, new fields
  surfaced from the existing Roadway Block fetch along with the
  string-typed `SIDEWALK_IB/OB_WIDTH`).
- Meter numbers: dataset `METERID 14793192` = A100's documented
  **147-93192** ✓. Rendered with REMOVE flags when the pole is in the
  structure run, plus a block-side METER SCHEDULE note (a MULTI pay station
  100 ft off-sheet still governs displaced spaces).
- Trees + pits ✓ (Urban Forestry boxes; 99-sentinel → dashed VERIFY pit),
  building footprint + provenance ✓, frontage window with §4.1 consent
  labeling ✓, setback dims to both cross streets ✓, structure with barrier
  angle/entry/posts/roof/drainage ✓, true-bearing north arrow ✓.
- Generalization (Queen's English, 3410 11th St): bike-lane band appears,
  and the layout now reports the **willow oak inside the structure** — the
  same tree the approved QE set runs an arborist report for.
- Not in data → notes, not silence: building entrances, utilities, tree-pit
  photos, curbside regulation signage (meter `POLICY_DESC` is surfaced).

**Finding that outlived the milestone:** the Roadway Blockface polyline is
NOT the physical curb (~12-25 ft street-ward; route alignment). Stations
fine, offsets shifted. Fixed by referencing offsets to the Planimetrics
Curb layer (`src/curbs.ts`, `src/design/planFrame.ts`); also fixed the
latent M1 bug where the curbside-tree filter could never match a real tree.
Full writeup in the CLAUDE.md corrections table.

### M4 — Notes library ✓ (2026-06-11)

`src/design/notes/`: keyed note blocks (pedestal feet, floor plating,
drainage channel + access, APWA markings, §4.7 signage, §4.3 roof rules,
propane, tree/arborist…) each with a **condition predicate** over the design +
prescreen data. Sheets request notes by context; the library decides which
apply. Same philosophy as `siteWalkCaveats`: derived honestly, never silent.

- Design it *after* M2/M3 — two real sheets tell us what notes they need;
  speculating first would invent the wrong keys.
- Feeds: G1.01 wholesale, plus per-sheet callouts everywhere.

**Landed.** `src/design/notes/{types,library,index}.ts` — 31 blocks in three
scopes, evaluated by `evaluateNotes(scope, {design, inputs, site})`:

- **layout** (10): what `layoutStreatery` used to word inline — texts
  preserved verbatim, so validated sheets read the same. The solver now
  decides geometry only; the library decides wording and conditions.
  (`StreateryDesign.roof` gained `permittedRunFt` so the no-roof note can
  say why without re-running the solver.)
- **site-plan** (9): the M3 extras (meter schedule, sidewalk provenance,
  entrances, utilities, tree-pit photos). The `sidewalkDepthFt` derivation
  is shared between the renderer band and the provenance note so they
  can't drift.
- **general** (12): the QE G1.01 boilerplate from the teardown —
  pedestals/§4.4, transition plate, drainage access/§4.6+§5.2-4, APWA +
  access panels/§5.2-5, signage/§4.7, enclosure/§4.2, roof rules/§4.3,
  the bike-lane-toggled concrete-block pair, Appendix 3 reflectors,
  ADA table/§4.8, propane/FEMS. Nothing renders these yet — M5's G1.01
  consumes them wholesale; until then `--notes` is the inspection surface.

Each instance carries `{key, scope, category, citation}` for M5 grouping.
Toggle validation: Queen's English (bike lane, willow oak) fires
`concrete-blocks-waived`, `trees-in-structure`, `roof-exception-a`,
`roof-partial`; Martha Dear fires `concrete-blocks-required` and no tree
notes. CLI: `npm run drawings -- "<addr>" --notes [--out report.txt]`.

### M5 — Static / semi-static sheets ✓ (2026-06-11)

- **G1.00 cover** — project data, sheet index, vicinity map (all from data we
  already have: MAR, SSL via Owner Polygons, block context).
- **G2.00 life-safety** — seating layout + capacity calc (already computed in
  `StreateryDesign.seating`), ≥1 ADA table callout (28–34" surface, 27" knee,
  30"×48" clear floor, §4.8), egress path.
- **A2.01 DDOT details** — DDOT's own standard details embedded near-verbatim.
  Needs the Appendix 3/5 figures extracted from the guidelines PDF as assets;
  concrete-block detail toggled off when a bike lane is present (Queen's
  English precedent, stamped "NOT REQUIRED DUE TO PRESENCE OF BIKE LANES").

**Landed.** Four renderers + the asset pipeline:

- **Assets**: `scripts/extract-guideline-assets.sh` (poppler + PIL) crops six
  figures from the guidelines PDF — §4.2 Type 1/Type 2 plan diagrams, the
  three chief-engineer-signed Appendix 3 reflector drawings (DWG
  610.06/07/08), and the Appendix 6 precast concrete curb barrier detail —
  into the generated `src/design/assets/guidelineFigures.ts` (~450 KB of
  base64 PNG at 150 dpi, provenance caption per figure). Appendix 5 is
  typeset fresh (utility operator contacts + APWA color code) since it's
  tabular data, not a drawing.
- **G1.00 cover** (`renderers/cover.ts`): project data block (SSL via the new
  `src/ownerLot.ts` fetcher — Martha Dear returns **2596-0639**, matching the
  documented tax lot), the provisional sheet index from the new
  `src/design/sheetIndex.ts` (M6 stamps these numbers into title blocks), and
  a real-street vicinity map (new `src/vicinityStreets.ts` — Roadway Block
  centerlines ±1000 ft, north-up, site marker, labeled streets).
- **G1.01 general notes** (`renderers/generalNotes.ts`): the M4 library's
  "general" scope consumed wholesale — two-column flow grouped by category
  with citations. Conditions that don't apply are omitted, not crossed out.
- **G2.00 life-safety** (`renderers/lifeSafety.ts` + `seatingLayout.ts`):
  cluster placement mirroring DDOT's own §4.2 diagrams (round 4-tops, 1
  seat/15 SF), §4.8 setbacks + entry clear + tree openings respected, ADA
  table nearest the entry with 30"×48" clear floor, dashed egress path with
  travel distance, occupant load table.
- **A4.00 DDOT details** (`renderers/ddotDetails.ts`): embeds the barrier
  diagram MATCHING `design.barrierType` (new field), all three reflector
  drawings, and the concrete-block detail — stamped red "NOT REQUIRED DUE TO
  PRESENCE OF BIKE LANES" on Queen's English (toggle verified live; Martha
  Dear prints it unstamped).

CLI: `--view cover|general-notes|life-safety|ddot-details`; `--view all` now
emits 11 sheets. `composeSheet` grew `hideNotesBand` for text-bodied sheets.
Full Martha Dear set: `docs/drawing-set-3110-mt-pleasant/`.

Observed for the architect (not a blocker): Queen's English's willow oak
lands at the very end of OUR envelope placement, inside the barrier run —
the approved set placed their structure so the tree passes mid-platform.
Envelope placement within the frontage window is a future operator/architect
control (relates to M6+ refinements).

### M6 — Sheet composition + PDF ✓ (2026-06-11)

Title block (architect name + seal space, sheet number, scale, date), sheet
index synchronization, multi-sheet assembly, SVG→PDF. Decide the PDF pipeline
during M5 (it constrains fonts and line weights); build it last. TOPS upload
format requirements are still an open question in `CLAUDE.md` — resolve before
locking page size (ARCH D vs 11×17).

**Complete.** TOPS answers (operator-reported, verify at first submission):
~25 MB limit, grayscale fine, **one combined file**. What landed:

- **Page-size toggle** — `--page arch-d|tabloid|letter` post-processes any
  composed sheet onto real paper (`src/design/page.ts`). The fitter snaps to
  the largest **standard architect's scale** that fits the margins (3" =
  1'-0" down to 1/16" = 1'-0") so printed dimensions are ruler-true, centers
  the content, adds the page border, and stamps page size + scale in the
  corner. Omitting --page keeps content-sized SVGs (what the web app embeds).
- **Sheet numbering decision: one view per sheet, no merging.** QE's
  multi-view sheets were hand-drafting paper economy; merging would mean
  duplicate title blocks or a second composition layer for zero benefit at
  ~1.3 MB total. Final index (11 sheets): G1.00 cover, G1.01 general notes,
  G2.00 life safety, A1.00 site plan, A2.00-A2.03 elevations, A3.00-A3.01
  sections, A4.00 DDOT details.
- **Sheet index synchronization** — `sheetTitleForView()` in `sheetIndex.ts`
  stamps each sheet's number into its title block; the cover index and the
  PDF page order come from the same list, so they cannot drift.
- **Street elevation adopted `composeSheet`** — the M1 renderer's private
  furniture (flagged adopt-on-touch since M2) is gone; all 11 sheets now
  share one chrome.
- **Architect seal space** — every title block gains a name line + dashed
  seal area (architect-only per the teardown's Finding 1; no PE).
- **Combined PDF** — `--pdf --out set.pdf` renders all sheets in index
  order, pages them (ARCH D default, --page overrides), and binds via
  rsvg-convert into one multi-page PDF at true physical size. Verified:
  Martha Dear 11 pages @ 36×24 (1.27 MB, `docs/drawing-set-3110-mt-pleasant.pdf`);
  Queen's English 11 pages @ 11×17.

**The v3 roadmap is complete**: address in → 11-sheet Design Permit drawing
set out, as one TOPS-ready PDF. Remaining work is refinement, not milestones —
top candidates: operator control of envelope placement within the frontage
window (the QE willow-oak observation), the Type 1 barrier variant template,
and architect feedback once a set is reviewed.

### Post-completion polish (2026-06-11, same day)

- **Spacing check** — `npx tsx scripts/checkSheetSpacing.ts <sheets.svg...>`
  parses every `<text>` element (group transforms included), estimates glyph
  boxes, and reports overlapping pairs. First run found 30 pairs across the
  Martha Dear set; root causes fixed: notes band now wraps short of the
  architect seal box with a generous 0.55 glyph factor (was 0.45),
  general-notes columns ditto, label stacks clamp above the grade line
  (`labelStack` in renderers/shared.ts), cross-view width/buffer dims are
  on separate rows, the travel-lane tag moved below grade, the accessible-
  route callout tucked under its arrow, and edge-clipped vicinity labels
  are skipped. **Both reference sets now check clean (0 overlaps / 22
  sheets).** The checker exits non-zero on findings, so it can gate CI.
- **A100 dimension validation** — `docs/a100-dimension-comparison.md`: every
  regulated dimension matches the approved Martha Dear sheet exactly
  (35'-3½" length, 6'-0" width, 3'-6" enclosure, 8'-3"/8'-6½" roof, 12"/5'
  tree clearances, 8'/12' ROW); the page fitter independently lands on the
  architect's own 3/8" = 1'-0" elevation scale at ARCH D. Divergences are
  deliberate (2x10 beams, pedestals — QE precedent) or explained (sidewalk
  semantics, far-side meter 14793191 verified `SIDE=Right`). The one real
  gap is placement-within-window (~17 ft from as-built), already flagged.

## Validation strategy

Queen's English is at **3410 11th St NW** and every data layer is citywide:
the end-to-end acceptance test is to **run the pipeline on Queen's English's
own address and diff the generated set against the approved PDF** — the same
move that surfaced the frontage rule. Watch for Mt Pleasant-specific
assumptions flagged in the CLAUDE.md addendum (block numbering, side tagging).

## Parallel loose ends (not on the critical path)

- Request **Martha Dear A101** (sections/details) from District Bridges —
  completes the items 3–4 comparison.
- **MAR geocoder fallback** (teardown ops note): every drawing run dies when
  citizenatlas hiccups. Address Points exact-match fallback is the cheap
  first step; `mar2.data.dc.gov` migration worth investigating.
- `--cached` flag for the CLI so validation runs survive MAR outages.
