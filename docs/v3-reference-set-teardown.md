# v3 — Approved Reference Set Teardown

**Date:** 2026-06-10
**Inputs:** the two approved streatery drawing sets in `drawing_examples/`, read against the **DDOT Streatery Guidelines, FINAL, December 5, 2024** (also in `drawing_examples/`).

This doc is the evidence base for v3's parametric drawing generation. We finally
have *real approved* sets to calibrate against — not the placeholder Appendix 7 of
the guidelines, which still reads "[TO BE INCLUDED JANUARY 2025]." Two restaurants,
two different architects, both approved. Where they agree, we have a defensible
template. Where they differ, we have the parametric axes.

- **Part 1** — what the sets are, how they map to the §5.2 Design Permit checklist,
  and the findings that change our assumptions.
- **Part 2** — the parametric dimension spec extracted for the v3 templates.

---

## Part 1 — Teardown

### What we actually have

Neither PDF is a *complete* Design Permit package — they are the **drawing portions**
only. The §5.2 checklist's 13 items split into **5 drawings (items 1–5)** that belong
in a set like these, and **8 attached documents (items 6–13)** — CofO, business
license, lease, letters of support, insurance, T&C sheet, point of contact — that are
filed alongside and never appear in a drawing PDF.

| Set | Restaurant | Address | Architect | Sheets | Notes |
|---|---|---|---|---|---|
| Martha Dear | Mt Pleasant cohort | **3110 Mt Pleasant St NW** | Andrew Metzler, AIA (ARC100920) | **1** (A100 only) | Site Plan + 4 elevations. Detail bubbles reference a **sheet A101 not included** — this is one sheet of a larger set (filename literally says "SITEPLAN"). |
| Queen's English | 11th St corridor | **3410 11th St NW** | wood + starr, AIA (ARC102940) | **5** (G1.00, G1.01, G2.00, A2.00, A2.01) | Fuller architectural set: project data, notes + DDOT requirements, life-safety/accessibility, new-work plan/elevations/sections, DDOT details. |

Both sites are **Collector** streets → **Type 2** barrier treatment per §4.2 (one Jersey
barrier at the vehicular-approach end + enclosure elsewhere). Neither is a hard case.

### §5.2 Design Permit checklist vs. the two sets

Legend: ✓ present · ◑ partial · ✗ absent · — attachment (not expected in a drawing PDF)

| # | Item | Martha Dear (A100 only) | Queen's English (5 sheets) |
|---|---|---|---|
| **1** | **Site Plan** (façades/addresses/entrances, sidewalk widths, curb cuts, adjacent bike/travel lanes, parking + curbside regs, **meter #s to remove**, sidewalk elements, utilities, trees+pits w/ photos, footprint + setbacks) | ✓ Strong. 3108/3110/3112 frontage, entries, ROW cross-section (sidewalk 10'-3", park 8'-0", travel 12'-0"), **meters by number (147-93191/93192)**, trash can, tree pit, grate, manhole, bike racks, light post, bus shelter. ◑ No explicit curbside-regulation text | ◑ Distributed across G1.00/G2.00/A2.00. Sidewalk 17'-6", bike lane, buffers labeled, tree + **arborist report (Jesse Buff)**. ✗ Meter *number to remove* not clearly shown |
| **2** | **Elevations (all sides)** | ✓ N/S/E/W @ 3⁄8"=1'-0", fully dimensioned, materials labeled | ✓ A/B/C/D @ 1⁄4"=1'-0" on A2.00 |
| **3** | **Sections** (cut-throughs) | ✗ Not on A100 — **likely on the missing A101** | ✓ Section 1 & 2 @ 1⁄2"=1'-0": pedestals, decking, tree pass-through, drainage |
| **4** | **Construction Details** (assembly hardware + positive-drainage detail; checklist says PE-stamped) | ◑ Footing/barrier/post/beam/rail sizes on A100; details on missing A101. **Architect seal only** | ◑ Assembly shown (2×10 beams, 2×6 joists @16" O.C., adjustable pedestals, Jersey barrier w/ drainage holes, 2:12 roof slope, stormwater channel). **Architect seal only** |
| **5** | **Utility Access Plan** (utilities, APWA markings, access panels) | ◑ "Utility access panel (if req'd)," manhole/grate/hatch shown | ✓ APWA color-code table + utility-operator contacts on A2.01; access-panel notes; "mark utilities per APWA before install" |
| **6–13** | CofO, building permit app, business license, lease, letters of support, insurance, T&C sheet, point of contact | — | — |

### Findings that change our assumptions

#### Finding 1 — Architect-only seal is sufficient (no PE stamp). **RESOLVED.**

Both approved sets carry only the **architect's** seal (AIA), not a Professional
Engineer's. DDOT confirmed verbally to District Bridges that an **architect-only
approval is acceptable**. This resolves what was our single most rigid constraint.

**This supersedes standing content elsewhere — flagged for reconciliation (not yet changed):**

- `docs/v2-architect-meeting-prep.md` **§4 "PE-stamp workflow"** — the whole section is now moot.
- `docs/where-we-left-off.md` — the **"PE accountability"** risk and v2 dev-sequence item 11 ("Construction Details (PE territory)").
- `src/submissionPackage.ts` — the **Drawing 4 placeholder hardcodes `requiresPeStamp: true`** and the line *"Drawing must be stamped by a certified DC Professional Engineer"* (≈ lines 442–459 + the `peClause` in `drawingPlaceholder`).
- `CLAUDE.md` — the §5.2 submission table row 4 (*"Must be stamped by a certified Professional Engineer (PE)"*) and the open question about wet vs. digital PE stamp.

**Cohort cost implication:** no per-restaurant PE engagement is required. The
architect's seal covers the design. This is the biggest single de-risking of the
coordinated-cohort economics — it removes a recurring per-site professional fee.

> Note the guidelines themselves are softer than our spec was: §4.2 says enclosure
> load calcs *"may be demonstrated by a DC Licensed Professional Engineer"* (may, not
> must). The "must be PE-stamped" language was our own over-reading of the §5.2 item-4
> table. The approved sets bear out the looser reading.

#### Finding 2 — Two independent architects converged on the same kit-of-parts.

This is the core asset for parametric design. Both sets, drawn by different firms,
use the same vocabulary:

- DDOT-provided **concrete Jersey barrier** at the vehicular-approach end (Type 2, per §4.2)
- **6×6 pressure-treated wood posts**, PT wood beams, PT wood railing/barrier
- **Translucent roof on a light frame** (the only divergence: Martha Dear = PVC
  corrugated; Queen's English = polycarbonate sheet)
- **ADA-flush platform** on adjustable pedestals / leveling feet, open drainage
  channel at the curb, not bolted into the roadway

Where they differ (the parametric axes — see Part 2): roof material, platform
construction detail, exact width, and tree handling.

#### Finding 3 — Queen's English A2.01 is a reusable pattern for the package compiler.

The "DDOT Details" sheet is essentially **DDOT's own standard details, embedded and
annotated**: the Appendix 3 barrier-reflector drawings (signed by DDOT's chief
engineer), the Appendix 5 utility-operator + APWA color-code tables, and the §4.2
Type-2 barrier diagram. The concrete-block detail is stamped **"NOT REQUIRED DUE TO
PRESENCE OF BIKE LANES."** v3's compiler can ship these DDOT standard details
pre-loaded and **toggle which apply by site condition** (bike lane present → drop the
concrete-block buffer; cite the protected-bike-lane setback reduction in §4.2).

#### Finding 4 — Regs corrections folded back into `CLAUDE.md` (and one code fix).

While reading the full guidelines against our spec:

- **Principal Arterial is *not* a parking-lane disqualifier.** §3.1 prohibits only
  *Other Freeway/Expressway* and *Interstate*. Principal Arterials are eligible — they
  just require **Type 1 barriers** (§4.2). Our `prescreen.ts` was treating FHWA class 3
  as a hard early-out. **Fixed** in `src/prescreen.ts` (`computeEarlyDisqualifiers`
  now fires only on FHWA 1–2) and corrected in three places in `CLAUDE.md` (the
  parking-lane disqualifier list, the FHWA decoder table, the DC-class equivalents).
  Moot for Mt Pleasant (a Collector) but wrong for generalization, and it contradicted
  the spec's own §4.2 barrier-type logic.
- **§4.3 "Exception A"** (the roof-can't-overhang-the-curb-at-a-tree rule Martha Dear
  cites) is not in the §4.3 body text — it lives in the **Type-2 figure on p.13**,
  which has no extractable text layer. Don't expect to find it by grepping the regs.

---

## Part 2 — Parametric dimension spec (extracted for v3 templates)

The dimensions below are the real values pulled from the two approved sets, set
against the guideline limits. The "v3 template default" column is the recommended
parametric behavior for the reference templates.

### Master dimension table

| Parameter | Martha Dear | Queen's English | Guideline limit | v3 template default |
|---|---|---|---|---|
| **Platform width** | **6'-0"** (in an 8'-0" parking lane) | **8'-0"** platform; 7'-0" "DDOT allowance"; 1'-6"/2'-0" buffers | ≤ parking-lane width | **`parkingLaneWidthPerSideFt − travelSideBuffer`** (≈6 ft on Mt Pleasant's 8 ft lane) |
| **Length** | ~25–35 ft along frontage (E elev. 25'-6" + 9'-9½") | **25'-0"** | bounded by own frontage; extendable w/ consent (§4.1) | from `eligibility.envelope.lengthFt` |
| **Barrier / enclosure height** | **3'-6" (42")** | **36"** barrier, rail to **42"** | enclosure **32–42"** above roadway; DDOT Jersey = 36" (§4.2) | **36–42"** |
| **Overall / roof height** | **8'-3"** to **8'-6½"** | **~9'-6"** | overhead structure **8–13 ft** above platform (§4.3); Queen's self-capped at 12' | **≤ 12 ft**, ≥ 8 ft |
| **Posts** | 6×6 PT | 6×6 PT | vertical members above 42" must be **≤ 6" wide** (§4.3) | **6×6 PT** (exactly at the 6" cap) |
| **Beams** | 2×6 PT | doubled **2× 2×10 PT** + 2×6 | — | per span; architect-spec (no PE needed) |
| **Joists** | — | **2×6 PT @ 16" O.C.** | — | 2×6 PT @ 16" O.C. |
| **Roof** | PVC corrugated | polycarbonate sheet, **2:12 (10%) slope** | translucent, minimal profile, no enclosure above barrier height (§4.3) | translucent panel, **≥ 2:12 slope** to curb |
| **Platform structure** | concrete footing | Trex (or similar) on **2×4 PT sleepers on adjustable pedestals** | leveling feet for drainage; **not bolted** to street (§4.4) | adjustable pedestals + composite deck |
| **Curb transition** | — | **3⁄8" steel plate, 3⁄8" max rise** | flush, **≤ 1⁄2" gap** (§4.4) | ≤ 3⁄8" plate, flush |
| **Entry clear width** | — | 60" open side | **≥ 36"** clear, no vertical protrusions (§4.4) | ≥ 36" |
| **Travel/bike-side buffer** | ~2 ft (8 ft lane − 6 ft platform) | **1'-6" / 2'-0"** | enclosure **2 ft** from travel/bike lane; blocks 6" from lane; reducible at *protected* bike lane (§4.2) | **2 ft** (or reduced per protected-bike-lane rule) |
| **Drainage channel** | at curb | **1 ft clear** stormwater channel + open ends | **1 ft** channel adjacent to curb (§4.6) | 1 ft, with access |
| **Barrier configuration** | Jersey + wood enclosure | Jersey at vehicular end + wood enclosure | **Type 2** (Collector): 1 Jersey at approach end + enclosure (§4.2) | Type 2 (drive off `functionalClassFhwa`) |
| **Tree handling** | maintain **12" clear to trunk**; roof no curb-overhang at tree (§4.3 Exc. A) | tree passes through platform; **arborist sign-off**; raised planter removed + 2–3" mulch | roof **5 ft from trunk**; 12" per UFD | preserve in place; flag arborist review |

### The width reconciliation (resolves a v1 ambiguity)

Our spec had a standing tension: the main CLAUDE.md said *"assume 6 ft"* width, the API
addendum said *"8 ft per side"* parking lane. The approved sets resolve it:

- **The 8 ft is the parking lane. The platform is narrower, by the travel-side buffer.**
- Martha Dear built a **6 ft platform inside the 8 ft Mt Pleasant lane**, leaving the
  ~2 ft Type-2 buffer §4.2 requires.
- Queen's English used an 8 ft platform on 11th St with 1.5–2 ft buffers carved within.

So the template width should be **parametric**: `platform_width = parking_lane_width −
travel_side_buffer`. On Mt Pleasant (8 ft lane, 2 ft buffer) that yields **6 ft** —
which is exactly what Martha Dear built and validates v1's 6 ft default as the *output*
of the rule, not a hardcoded guess.

### Per-component notes for the renderers

- **Barrier (Type 2):** one Jersey at the vehicular-approach end, **angled 45–60° inward**
  (§4.2); enclosure (wood rail) for the remaining edges; **3 ft safety gaps every 60–100 ft
  and at any FDC**. Concrete blocks in the 2 ft buffer *unless* a bike lane lets us drop
  them (Queen's English precedent).
- **Platform:** composite deck on adjustable pedestals; removable steel plate flush to
  the curb; **access panels** over any manhole/utility cover; APWA color markings on the
  deck and street-side face.
- **Overhead:** light frame on the 6×6 posts; translucent roof; **no enclosure above the
  barrier height** at any time (§4.3); keep the roof off the curb line where a street tree
  sits (§4.3 Exc. A) and ≥ 5 ft from any trunk.
- **Seating (for capacity callouts):** `floor(platform_sf / 15)`, minus any structure
  footprint; all seating set back **1 ft** from barriers; **≥ 1 ADA table** (28–34" surface,
  27" knee clearance, 30"×48" clear floor) on an accessible route (§4.8).

---

## What this changes for v3

1. **Drop the PE workstream.** v2 dev-sequence item 11 and the PE-stamp meeting
   decisions are no longer needed. Construction Details become an architect-sealed
   drawing like the rest.
2. **Template width is a formula, not a constant** — see the reconciliation above.
3. **The kit-of-parts is settled enough to spec one Mt Pleasant template** (Type 2,
   6×6 posts, Jersey + wood enclosure, translucent roof, pedestal platform). The
   open aesthetic axis is roof material (PVC corrugated vs. polycarbonate) — offer both.
4. **A2.01 (DDOT standard details) is a static, reusable sheet** the compiler can emit
   nearly verbatim, toggling the concrete-block detail by bike-lane presence.

### Loose ends to reconcile (not yet done — scoped out of this pass)

- ✅ **Done (this pass):** reconciled the PE-stamp language to architect-only across
  `src/submissionPackage.ts`, `CLAUDE.md` (§5.2 table + open question), `docs/v2-architect-meeting-prep.md` §4,
  `docs/where-we-left-off.md`, `docs/v2-parametric-design-architecture.md`, and the `src/sitePlanMockup.ts`
  watermark. The guidelines text still names a PE; we reflect DDOT's architect-only practice and note both.

### Operational finding (2026-06-10): the MAR geocoder is a single point of failure

During M1 validation, `citizenatlas.dc.gov` (the MAR LocationVerifier endpoint) went down
hard — TLS connection resets from multiple networks (local ISP + Anthropic server-side
fetch) for 90+ minutes, while the entire ArcGIS stack (`maps2.dcgis.dc.gov`) stayed healthy.
Because MAR is call #1 of the geocoding pipeline, **every pre-screen, briefing, site plan,
and drawing run dies when citizenatlas hiccups** — the 9 healthy ArcGIS fetchers never run.

Mitigation options, in increasing order of effort (none built yet):

1. **Address Points fallback** — the Address Points layer lives on the healthy ArcGIS
   stack and can resolve exact addresses by `FULLADDRESS` match. Loses MAR's fuzzy
   matching ("Mt" → "MOUNT", missing quadrants, confidence scores), so input would need
   pre-normalization. Covers the cohort quick-picks (already exact) immediately.
2. **MAR 2 migration** — DC runs a successor geocoder portal at `mar2.data.dc.gov`
   (surfaced while diagnosing the outage). Worth investigating whether its API is
   keyless/CORS-friendly and whether `citizenatlas` is on a deprecation path — the
   F5-fronted legacy host failing for 90+ min while everything else stays up is
   consistent with a neglected legacy box.
3. **Result caching for the cohort** — persist the last-good `PrescreenResult` JSON per
   cohort address (the web app already caches client-side; the CLI has nothing). A
   `--cached` flag would have let tonight's validation proceed.
- Martha Dear's **A101** (sections/details) wasn't provided — worth requesting from
  District Bridges to complete the comparison on items 3–4.
