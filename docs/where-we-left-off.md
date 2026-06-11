# Where we left off

**Last updated:** end of session 2026-06-10.

A tight session-handoff doc so we can pick back up without re-deriving context.

---

## Current state in one paragraph

The v1 pre-screener is live on Cloudflare Pages (deployed from `adaymus/streatery-assistant` `main` on every push), in active use by Mitra Moin and the District Bridges team for the Mt Pleasant streatery cohort. It takes an address, returns a verdict + buildable envelope + every nearby curb feature, and produces a complete printable submission package (Markdown briefing → PDF via browser print). **v3 (parametric drawing generation) is now underway**: two DDOT-approved reference drawing sets live in `drawing_examples/`, their teardown + extracted dimension spec is in `docs/v3-reference-set-teardown.md`, and Milestone 1 of the drawing generator (street-side elevation) is **built and compiling — validation pending only on a DC endpoint outage** (see RESUME HERE below).

---

## Session 2026-06-10 — v3 kickoff (RESUME HERE)

### What landed

1. **Ground truths**: `drawing_examples/` now holds two DDOT-approved sets — Martha Dear
   (3110 Mt Pleasant, 1 sheet, Metzler AIA) and Queen's English (3410 11th St, 5 sheets,
   wood + starr) — plus the full DDOT Streatery Guidelines PDF.
2. **`docs/v3-reference-set-teardown.md`** — §5.2 checklist comparison, the kit-of-parts
   convergence, the parametric dimension spec (Part 2), the MAR single-point-of-failure
   operational finding, and the confirmed **architect-only seal** fact (no PE needed —
   DDOT told District Bridges; both approved sets bear it out).
3. **Regs fix**: Principal Arterial (FHWA 3) was wrongly encoded as a parking-lane hard
   disqualifier; §3.1 only prohibits freeways/interstates (FHWA 1–2). Fixed in
   `src/prescreen.ts` + 3 places in `CLAUDE.md`.
4. **PE → architect-only reconciliation** across `submissionPackage.ts`, `CLAUDE.md`,
   both v2 docs, and the mockup watermark (`requiresPeStamp` → `requiresProfessionalSeal`).
5. **M1 drawing pipeline** (all compiling, `npx tsc --noEmit` clean):
   - `src/design/templateConstants.ts` — kit-of-parts as typed, regs-cited constants
   - `src/design/types.ts` — `ParametricInputs` + `StreateryDesign` (station/offset frame)
   - `src/design/extractInputs.ts` — PrescreenResult → inputs (width formula, approach
     end, trees/crosswalks to stations)
   - `src/design/layout.ts` — solver (post bays, barrier, roof via `longestGapInWindow`
     reuse with §4.3 buffers, tree clearances, seating, honest notes)
   - `src/design/renderers/shared.ts` + `renderers/elevation.ts` — architectural SVG
   - `scripts/drawings.ts` + `npm run drawings` CLI
   - Four helpers exported from `envelope.ts` for reuse (`longestGapInWindow`,
     `projectOntoLine`, `arcgisToLineString`, `clipBlockfaceToBlock`)

### What's blocked and how to resume

**M1 validation against approved sheet A100** is the only open item. Blocked 2026-06-10
evening by a hard outage of `citizenatlas.dc.gov` (MAR geocoder — TLS resets from multiple
networks for 90+ min while all ArcGIS endpoints stayed healthy). The pipeline's first
network call is MAR, so nothing runs without it.

**Resume steps:**

1. `bash scripts/retry-martha.sh` — loops until MAR recovers, then writes BOTH validation
   drawings: `docs/elevation-3110-mt-pleasant.svg` (full 50 ft envelope) and
   `docs/elevation-3110-mt-pleasant-as-built.svg` (`--length-cap 35.3`, matching A100's
   25'-6" + 9'-9½" structure). Layout summaries → `/tmp/martha-summary-{full,asbuilt}.txt`.
   (Or run `npm run drawings -- "3110 Mount Pleasant Street NW" --name "Martha Dear"`
   directly once MAR is back.)
2. Compare the layout summary + SVG against `drawing_examples/` A100. Expected from the
   pipeline: 50'-0" × **6'-0"** (8 ft lane − 2 ft buffer — must match Martha Dear's built
   width), 6 posts @ 10 ft bays, Jersey barrier at the high-station end (even address →
   Left/West → approach heuristic), enclosure 3'-6", roof edge 8'-3". If Urban Forestry
   data has the A100 tree inside the run: a shifted post (`*`), roof holdback, §4.3
   Exception A note.
3. **Delete `scripts/retry-martha.sh` after validation** — one-off ops script, not
   project code. Also regenerate/delete any zero-byte `docs/elevation-*.svg` left by
   failed redirects.
4. Next after validation: M2 per the plan — Site Plan renderer consumes `StreateryDesign`,
   surface `SIDEWALK_IB/OB_WIDTH` from the existing Roadway Block fetch, remaining three
   elevations, Queen's English (3410 11th St NW) as the generalization test.

Worth checking when curious: is `mar2.data.dc.gov` (MAR 2, the successor geocoder) a
viable replacement for the legacy citizenatlas endpoint? See the SPOF mitigations in the
v3 teardown doc.

---

## What's live in v1

- **Web app**: address input + quick-picks for the 8 cohort restaurants + 1 cross-street test
- **Pre-screen engine**: 4-call MAR geocoding pipeline + 9 parallel curbside-data fetchers covering all 4 tiers of DC Open Data + building footprint polygon (added 2026-05-28)
- **Eligibility engine**: Turf-based geometry. Buffers, longest-contiguous-gap envelope computation, verdict thresholds (≥20 ft ELIGIBLE / 12–20 CAVEATS / <12 INELIGIBLE), binding constraints, frontage extension detection
- **Map view**: MapLibre with curb line + envelope highlight + color-coded constraint markers, lazy-loaded
- **URL-based save/share**: `?address=...` is bookmarkable; "Copy link" button on results
- **Submission package**: 1,200-line Markdown document containing verdict, location, constraints, curb features, site-walk checklist, Letter of Support template, full Terms & Conditions (Appendix 2 verbatim), Point of Contact template, on-site Streatery Sign template, 5 architectural-drawing placeholders, structured JSON appendix
- **PDF export**: "Save submission package as PDF" button → renders package as styled HTML in new tab → auto-opens print dialog → user picks Save as PDF
- **Production hardening**: rate limiting on the MAR proxy (60/min/IP via Cloudflare Workers Rate Limiting API), mobile-responsive layout, CORS+WAF workaround for citizen-atlas via Pages Function

Bundle: 235 KB initial (74 KB gzipped) + 75 KB lazy print module + 1 MB lazy map module.

CLI tools: `npm run prescreen|geocode|briefing|site-plan -- "<address>"`.

---

## v2: what we're scoping with the architect

### Mental model

A complete per-restaurant streatery design = **reference template (1/2/3-space) + 4 layers**:

1. **Code standards** (DDOT + ADA) — baked into templates, rarely changes
2. **Site report** (pre-screener data) — auto-fetched on demand
3. **Site-walk verified measurements** — owner/volunteer with tape measure
4. **Owner decisions** (heaters, overhead structure, aesthetic palette) — operator picks

Each layer is filled in by the right person; later layers override earlier ones when they conflict; the system degrades gracefully when a layer's missing. See `docs/v2-parametric-design-architecture.md` for the full framing.

### Architecture: PrescreenResult → extractParameters → selectTemplate → template.layout → StreateryDesign → renderer (Site Plan / Elevations / Sections / Utility Access)

The design model is the spatial truth. Renderers project it into specific drawings. Same data, different views. One source of truth means Site Plan and Elevations can never drift.

### What's resolved already

- **Risk #2 (building footprint data)** — DC Building Footprints layer has 100% cohort coverage with real polygon shapes. Wired into the pre-screen pipeline. Architect can rely on real footprints; corner buildings span multiple addresses (note for the meeting).

### What still needs the architect

Bring these 8 decisions out of the meeting (priority-ordered, see `docs/v2-architect-meeting-prep.md` §"Decisions to bring out of the meeting"):

1. Reference template format — TypeScript / parameterized SVG / YAML spec / hybrid?
2. What's parametric vs hardcoded per element
3. Template granularity — just 1/2/3-space, or finer?
4. How operator specifies building entrance (map pick? "north/center/south end"?)
5. Aesthetic palette policy
6. Output format priority — SVG-first or DXF-first?
7. Site-walk caveats on-drawing vs separate?
8. Versioning policy when templates update

### Risks still on the list (none blocking)

- ~~**PE accountability**: PE stamps the template with parameter ranges; instances inside the range pre-approved. Needs PE engagement.~~ **RESOLVED (v3):** DDOT accepts an architect-only seal — no PE stamp required in practice (confirmed to District Bridges; both approved reference sets are architect-sealed). The accountability model carries over with the architect as the sealing professional. See `docs/v3-reference-set-teardown.md`.
- **Site-walk data quality**: solved by the mobile site-walk app pattern (build before architect engagement).
- **Aesthetic palette politics**: solved by defining 2-3 named palettes with photos.
- **PSC versioning**: solved by version-locked submissions + diff UX.

### Suggested v2 dev sequence (also in the architecture doc)

1. Operator-input UI (frontage length, building entrance position, business name)
2. Surface sidewalk widths from existing Roadway Block fetch
3. Define `ParametricInputs` + `StreateryDesign` data model
4. Architect-supplied YAML spec for 2-space template
5. Site Plan renderer (richest data, biggest payoff)
6. End-to-end: pre-screen → operator input → 2-space spec → Site Plan SVG → embed in submission package
7. 1-space + 3-space templates
8. Utility Access Plan renderer
9. Elevations renderer
10. Sections renderer
11. Construction Details (architect-sealed; no PE required in practice)

Items 1-3 can start before the architect locks template format (they don't depend on it). Item 5 needs the architect's input on conventions.

---

## What's in the repo

```
src/
  prescreen.ts          orchestrator
  geocode.ts            4-call MAR pipeline + building footprint
  buildingFootprint.ts  spatial query on DC Buildings
  eligibility/envelope.ts  Turf-based envelope math
  submissionPackage.ts  Markdown package compiler
  submissionPackagePrint.ts  HTML + auto-print for PDF
  sitePlanMockup.ts     parametric SVG strawman
  components/           React UI
  http.ts bbox.ts curbFeatures.ts  shared helpers
  loadingZones.ts parkingMeters.ts fireHydrants.ts
  bicycleLanes.ts busStops.ts streetTrees.ts
  adaCurbRamps.ts driveways.ts crosswalks.ts
functions/api/mar/[[path]].ts   Pages Function (WAF bypass + rate limit)
scripts/                CLI entry points
docs/
  v2-architect-meeting-prep.md      8 decisions for the meeting
  v2-parametric-design-architecture.md   4-layer model + system architecture + risks
  site-plan-mockup-3110-mt-pleasant.svg  strawman with real building polygon
  where-we-left-off.md              this file
CLAUDE.md             living project spec + every API quirk discovered
wrangler.toml         Cloudflare Pages config
```

---

## When you pick this back up

The next concrete move depends on what happened in the architect meeting:

- **If the architect agreed to start with the YAML-spec approach**: build items 1-3 of the v2 dev sequence (operator-input UI + sidewalk-width surfacing + `ParametricInputs`/`StreateryDesign` types). These don't need the architect's template — they unblock everything else.
- **If the architect wants to see more strawmen first**: run `npm run site-plan -- "<cohort address>" > docs/site-plan-mockup-<slug>.svg` for the remaining cohort restaurants. Then iterate on `src/sitePlanMockup.ts` per their reaction.
- **If the meeting raised an unexpected concern**: read `docs/v2-parametric-design-architecture.md` §"Known risks and flow improvements" — odds are it's flagged there with a mitigation.
- **If you just want to keep shipping value to Mitra**: build the cohort dashboard (single view of every cohort site's pre-screen + submission status). Reuses existing data; no architect dependency.

`CLAUDE.md` is the canonical project spec — keep it as the source of truth for anything that needs to survive multiple sessions.
