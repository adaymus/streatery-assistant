# Generated set vs. the approved Martha Dear A100

**Date:** 2026-06-11
**Comparison basis:** the DDOT-approved A100 (Andrew Metzler AIA, Rev B
02.28.26 — full text layer read directly from the PDF) against our
generated set for the same address with the §4.1 consent extension
modeled (`--frontage 35.3`).

The headline: **every regulated dimension matches the approved sheet
exactly**, and ours are *derived from rules*, not copied — the width
comes out of `parking lane − travel buffer`, the heights out of the
kit-of-parts constants, the tree clearances out of §4.3/UFD. The
differences that remain are either deliberate template choices,
documented data-coverage notes, or the one known placement gap.

## Dimension-by-dimension

| Dimension | A100 (approved) | Generated | Verdict |
|---|---|---|---|
| Structure length | 25'-6" + 9'-9½" = **35'-3½"** (E elevation) | **35'-3½"** | ✓ exact |
| Platform width | **6'-0"** (N + S elevations) | **6'-0"** (= 8' lane − 2' buffer) | ✓ exact, derived |
| Enclosure / barrier height | **3'-6"** | **3'-6"** (42" cap) | ✓ exact |
| Roof edge | **8'-3"** | **8'-3"** | ✓ exact |
| Roof overall (fascia) | **8'-6½"** | **8'-6½"** | ✓ exact |
| Jersey barrier | **6'-0"** | **6'-0"** | ✓ exact |
| Trunk clearance | "MAINTAIN 12" CLEAR TO TRUNK OF TREE PER UFD DIRECTION" | 12", same wording | ✓ exact |
| Roof holdback at tree | **5' MIN** (W elevation) | 5 ft (§4.3 constant) | ✓ exact |
| §4.3 Exception A note | On sheet, verbatim | Same note, fires when a tree is in the run | ✓ |
| Parking lane | **8'-0"** | **8'-0"** | ✓ exact |
| Travel lane | **12'-0"** | **12'-0"** (= 24' total / 2 lanes) | ✓ exact, derived |
| Posts | 6x6 PT. WD. TYP. | 6x6 PT (bays ≤ 10') | ✓ |
| Railings | 2x6 + 2x4 PT. WD. | 2x6 cap + 2x4 mids | ✓ |
| Roofing | PVC CORRUGATED | PVC corrugated (default palette) | ✓ |
| Concrete blocks in buffer | Shown | Required note fires (no bike lane on Mt Pleasant) | ✓ consistent |
| Elevation print scale | **3/8" = 1'-0"** | **3/8" = 1'-0"** (auto-snapped at ARCH D) | ✓ — the page fitter independently lands on the architect's chosen scale |

A quiet bonus: A100's own site plan labels the structure **35'-9"** while
its East elevation dims total **35'-3½"** — a small internal inconsistency
hand drafting permits. Ours can't drift: every sheet projects from one
`StreateryDesign`.

## Deliberate divergences (template choices, not errors)

| Item | A100 | Ours | Why |
|---|---|---|---|
| Beams | 2x6 PT | **2× 2x10 PT** | Standardized on Queen's English's heavier approved section (teardown Part 2) |
| Foundation | Concrete footing | **Adjustable pedestals + 2x4 sleepers** | Queen's English precedent; matches §4.4's leveling-feet/not-bolted language; architect's call to flip |

## Explained differences

- **Sidewalk: A100 says 10'-3", we say 23'-10".** Different measurements
  of the same street. A100 dimensions the *paved walking surface*; we
  dimension *curb-to-façade* from the Building Footprints polygon (the
  band the drawing actually draws), which includes the front-garden
  zone. DDOT's Roadway Block strings (14 / 16+ "includes planting
  zone") sit between the two. The sheet's provenance note explains
  exactly what was measured.
- **Meters: A100 lists 14793191 + 14793192, we list 14793192 only.**
  Verified against the DDOT meter layer: **14793191 is on the EAST
  side** (`SIDE=Right`, address "...ST NW E") — the opposite blockface.
  A100 draws the full ROW cross-section including the far curb; our
  side-filtered fetch is per-blockface and correct. If a future sheet
  wants the far-side meter for context, it's one filter away.
- **Building entries: A100 marks 4.** Not in any DC dataset — our sheet
  carries the site-walk note instead (§5.2 checklist item).
- **Street furniture (bus shelter, bike racks, light post, trash
  can, grate, access hatch):** partially covered (bus stops yes;
  the rest aren't in our fetched layers). Site-walk territory; the
  utility-access notes flag the manholes/hatches.
- **Site plan framing:** A100 draws the whole Irving→alley stretch at
  1/16"; we window the structure ± 40 ft at 3/16" with true-distance
  setback dims to both cross streets. Same information, tighter frame.

## The one real gap: placement along the block

A100 places the structure ≈ **155'-5" from Irving St**, spanning the
3108/3110/3112 frontages. Our consent-extension window centers on
3110's address point, so the envelope lands at **172'-6½"** — about
17 ft north of as-built. Everything *about* the structure matches;
*where* it sits within the consent window is the operator/architect
decision the pipeline doesn't expose yet. (Same root cause as the
Queen's English willow-oak observation in the roadmap — first
candidate for post-v3 refinement.)
