# v2 Parametric Design Architecture

**Goal:** design a system where the architect supplies three reference designs (1-space, 2-space, 3-space+ streateries) and the tool adapts them per site using the data already in the pre-screen report.

This doc has three parts:

1. **The dependency model** — for each design element, the site characteristics that drive it (so you and the architect know exactly what's parametric vs constant).
2. **Gap analysis** — what the tool already knows vs what still needs operator/site-walk input.
3. **Proposed architecture** — how templates, parameters, and renderers fit together so the system stays maintainable as scope grows.

---

## The mental model: 4 layers on a reference design

Before the details, the framing in one diagram. A complete per-restaurant streatery design is a **reference template + 4 layers of progressively more site- and operator-specific information**:

```
                    ┌─────────────────────────────────┐
   Layer 4          │  Owner decisions                │  ← operator picks
   (preferences)    │  heaters? overhead? palette?    │     at submission time
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
   Layer 3          │  Site-walk verified measurements│  ← owner/volunteer
   (verified)       │  building entrance, utility     │     with tape measure
                    │  covers, curb height, FDC       │
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
   Layer 2          │  Site report (pre-screen)       │  ← auto-fetched
   (automated)      │  speed limit, envelope dims,    │     from DC Open Data
                    │  trees, meters, etc.            │     on demand
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
   Layer 1          │  Code standards (DDOT + ADA)    │  ← baked into
   (constants)      │  slope, heights, clearances,    │     templates once
                    │  required signage, etc.         │
                    └─────────────────────────────────┘
                    ┌─────────────────────────────────┐
   Base             │  Reference design (1/2/3-space) │  ← architect's template
                    │  scaffold: where things go      │
                    └─────────────────────────────────┘
```

### Properties this model gives us

- **Graceful degradation**: layer 3 (site walk) can be skipped initially — design renders with assumed defaults and "VERIFY" notes on the drawings. Operator can use in-progress drawings for cohort planning, re-render after the site walk.
- **Fixed precedence when sources conflict**: site-walk measurements (layer 3) override pre-screen defaults (layer 2) — boots-on-the-ground beats data extrapolation. Layer 4 (owner) picks *within* ranges layer 1 (code) allows, never beyond.
- **Per-site versioning is natural**: change layer 4 (operator switches aesthetic palette) → re-render touches only the affected elements. Change layer 1 (DDOT updates Guidelines) → all sites regenerate with the new rules.
- **Each layer has its own UX path**: operator never sees layer 1 (built in); reads layer 2 in the pre-screen result UI we already have; fills in a structured site-walk form for layer 3; picks from a few preset options for layer 4. Clean separation means different roles can fill in different layers without stepping on each other.
- **Each layer ages at its own rate**: code standards rarely change, pre-screen data is fresh on demand, site walks need re-verification on major changes, owner preferences are per-restaurant. The system can track and surface staleness per layer.

The rest of this doc is the detail under that framing.

---

## Part 1: The dependency model

A streatery has roughly 11 design elements. Each one is driven by zero or more site characteristics. Some characteristics drive multiple elements; some elements depend on multiple characteristics. Knowing which is which tells you what needs to be parametric in the templates.

### Design elements

For each, what's adjustable vs fixed by code/standards:

| # | Element | What varies per site | What's constant |
|---|---|---|---|
| 1 | **Platform** | Length, width, tree pit cutouts, utility access panels, drainage channel position | Height (~6" above curb, flush with sidewalk), surface treatment (slip-resistant), edge banding (ADA detectable) |
| 2 | **Street-side barriers** | Length, barrier type (Jersey vs concrete blocks), setback from adjacent bike/travel lane | Min height (32" Jersey / 30" concrete), reflectivity (APWA standards, Appendix 3), spacing (~6 ft) |
| 3 | **End barriers** (north + south) | Length (= parking lane width), barrier type | Always full-width, always present |
| 4 | **Access ramp(s)** | Number (1 or 2), position (which end, or middle), side (toward sidewalk only) | Slope (1:12 ADA), width (36" min), landing (5×5 ft), handrails if rise > 6" |
| 5 | **Overhead structure** (optional) | Whether present, type, coverage area, height clearance from existing trees | Max height (~12 ft per §4.3), fire-resistant materials |
| 6 | **Seating layout** | Total capacity (= sqft / 15), table count, ADA table position | Aisle width (36" min), ADA clear-floor space, minimum one ADA-accessible table |
| 7 | **Signage** (the two 5.5"×8.5") | Which two edges face the sidewalk, exact mounting position | Dimensions, content (name/hours/capacity/emergency contact), no other signage allowed |
| 8 | **Lighting** | Conduit routing from building to streatery | Power source (building electrical), §4.10 requirements |
| 9 | **Heaters** (optional, FEMS permit) | Whether present, count, placement | Clearance from barriers (fire code), tank storage rules |
| 10 | **Utility access panels** | Position above each subsurface utility cover within envelope | APWA color-code markings, removable panel requirement |
| 11 | **Drainage** | Channel position (along curb), drainage access point | Continuous unobstructed flow, accessible if blocked |

### Site characteristics (the input variables)

For each, what design elements it drives:

| Characteristic | Source | Drives |
|---|---|---|
| **Speed limit** | `block.speedLimitMph` | Barrier type (≥25 mph → Jersey; <25 → concrete blocks acceptable) |
| **FHWA functional class** | `block.functionalClassFhwa` | Additional safety requirements for arterials |
| **Parking lane width** | `block.parkingLaneWidthPerSideFt` | Platform width = streatery depth from curb |
| **Bike lane adjacency** | `curbFeatures.bicycleLanes[].metadata.adjacentToParkingLane` | Street-side barrier setback (2 ft min from bike lane) |
| **Envelope length** | `eligibility.envelope.lengthFt` | Template selection (1/2/3-space), platform length, seating count |
| **Envelope position along blockface** | `eligibility.envelope.startAlongBlockfaceFt`, `.endAlongBlockfaceFt` | Where the streatery sits on the block |
| **Street orientation** | Derived from blockface geometry | Sun exposure → shade structure value; signage direction; cross-street labels |
| **Block side** | `geocoded.side` | Which compass direction the parking lane faces (drives signage orientation, sun exposure) |
| **Cross-street names** | `block.fromStreet`, `block.toStreet` | Drawing labels |
| **Street trees within envelope** | `curbFeatures.streetTrees` filtered to envelope range | Tree-pit cutouts in platform (cannot build over a tree pit); overhead structure clearance |
| **Parking meters within envelope** | `curbFeatures.parkingMeters` | Which METER_IDs to flag for DDOT removal (operator coordinates with DDOT) |
| **Driveways near edges** | `curbFeatures.driveways` | Ramp placement (avoid driveway side); end-barrier reinforcement |
| **Crosswalks at intersection** | `curbFeatures.crosswalks` | May influence which end gets the ramp (avoid ramp facing crosswalk if possible) |
| **Bus stops near edges** | `curbFeatures.busStops` | End-treatment buffer |
| **Building entrance position** | **Not in data — operator input** | Ramp position (ideally aligned with restaurant entrance) |
| **Curb height** | **Not in data — typically 6" in DC; site walk confirms** | Ramp length (6" rise × 1:12 = 6 ft ramp) |
| **Sidewalk width** | **In `block` data via `SIDEWALK_OB_WIDTH`/`SIDEWALK_IB_WIDTH` but not surfaced yet** | Whether ramp can fold or must be straight |
| **Utility cover positions within envelope** | **Not in data — Miss Utility (8-1-1) site walk** | Utility access panel placement |
| **Curb slope direction** | **Not in data — site walk** | Drainage channel design |
| **Building electrical entry** | **Not in data — operator input** | Lighting conduit routing |
| **Solar exposure on frontage** | **Derivable from street orientation + building heights across street** | Overhead structure recommendation |

### The dependency graph at a glance

Things the tool can fully drive:
- Platform dimensions (length, width)
- Barrier type (from speed/class)
- End barrier dimensions (from parking lane width)
- Seating count (from area / 15 sqft)
- Tree-pit cutouts (from filtered tree data)
- Signage direction (from block side + orientation)
- Meter-removal list (from filtered meter data)

Things the tool can partially drive (with operator/site-walk input filling the gap):
- Ramp position (operator gives building entrance location)
- Drainage design (architect gives convention, site walk confirms slope)
- Sidewalk width (we have the data, just need to surface it)
- Overhead structure recommendation (we know orientation, operator chooses Y/N)

Things only operator/architect/site walk can supply:
- Utility cover positions (subsurface, no data)
- Building entrance position (no data)
- Exact curb height (typically 6", verify)
- Aesthetic palette (materials, colors, restaurant branding within allowed signage)
- Lighting power tap location

This split tells you the v2 minimum viable product: a system that auto-drives everything in column 1, prompts the operator for column 2, and clearly flags column 3 as site-walk items in the output.

---

## Part 2: Gap analysis — what we don't know yet

Roughly in order of effort to close:

### Quick wins (data already fetched, not surfaced)

- **Sidewalk widths**: `SIDEWALK_OB_WIDTH` and `SIDEWALK_IB_WIDTH` are already in our Roadway Block fetch — just not surfaced through `RoadwayBlockResult`. ~10 minute change in `src/geocode.ts` to expose them.

### Worth investigating before v2 starts

- ~~**DC Buildings dataset**: DC publishes a building footprints layer.~~ **DONE 2026-05-28** — `Facility_and_Structure_WebMercator/MapServer/1`. 100% coverage across the cohort with real polygon shapes. Wired into the pre-screen pipeline as `geocoded.buildingFootprint` (`{ ring, approximateAreaFt2, capturedAt, description }`). Corner buildings span multiple addresses (one polygon serves all entrance addresses) — design system should handle that.
- **Sidewalk inventory dataset**: there may be a clean sidewalk centerline / polygon dataset. Worth checking for the ramp-design conversation.
- **Building entrances**: long shot, but worth checking if DC has an addressable-entrance dataset distinct from the MAR. The MAR gives us the entrance address point but not which side of the building it's on. Currently a layer-3 (site-walk) item; if a dataset exists it could move to layer 2.

### Site-walk-only (no data path)

- Utility cover positions (subsurface, has to be Miss Utility call)
- Fire Department Connection location on building façade (we documented this already)
- Curb slope direction
- Power tap location for lighting
- Verification of curb height (assumption is fine, but operator confirms)

### Operator-supplied inputs (need UI for these)

For v2 the UI should add fields for:
- Restaurant business name (currently anonymous in templates)
- Restaurant entrance location (lat/lon, or pick on map, or "left/center/right of frontage")
- Operator-confirmed frontage length (already on the roadmap)
- Whether to include overhead structure
- Whether to include heaters
- Aesthetic palette choice (1-3 cohort-approved options)

---

## Part 3: Proposed architecture

The right shape, in one sentence: **the tool produces a structured `StreateryDesign` object from inputs; renderers project that object into specific drawings.**

This decouples three things that tend to get tangled:

- **Parameters**: site-specific values extracted from `PrescreenResult` + operator input
- **Templates**: reference designs (1/2/3-space) that say how parameters become a layout
- **Renderers**: drawing producers (Site Plan view, Elevations view, etc.) that read the layout

### The flow

```
┌──────────────────────┐
│ PrescreenResult      │  ← existing
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ extractParameters()  │  ← reads result + operator input,
│                      │    returns ParametricInputs
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ selectTemplate()     │  ← chooses 1-space / 2-space / 3-space+ 
│                      │    based on envelope length
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ template.layout()    │  ← reference design applies parameters,
│                      │    returns StreateryDesign object
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│ renderers (each is independent):                  │
│   sitePlan(design)         → SVG                 │
│   elevations(design)       → SVG (one per side)  │
│   sections(design)         → SVG (typically 2)   │
│   utilityAccessPlan(design)→ SVG                 │
│   constructionDetails(...) → SVG (architect-led) │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────┐
│ composePdfPackage()  │  ← consolidates SVGs into a single
│                      │    PDF for TOPS upload
└──────────────────────┘
```

### Key principle: one design model, many views

The `StreateryDesign` object holds the complete spatial truth. Each renderer projects it differently. Same data, different viewing convention. This means:

- One source of truth — no drift between Site Plan and Elevations
- Renderer development can happen in parallel (one engineer per drawing)
- Adding a new view (3D iso, video walkthrough, AR mockup) doesn't touch templates
- Changing a template (e.g., move ramp default position) updates all views automatically

### Sketch of the data shape

```typescript
interface ParametricInputs {
  // From pre-screen
  site: {
    blockfacePolyline: Point[];
    envelope: { startFt, endFt, lengthFt };
    parkingLaneWidthFt: number;
    sidewalkWidthFt: number;          // surface from Roadway Block
    streetOrientation: number;        // degrees from north
    side: "Right" | "Left";
    speedLimitMph: number;
    functionalClassFhwa: number;
    crossStreetNorth: string;
    crossStreetSouth: string;
    treesInEnvelope: { lat, lon, dbh }[];
    metersInEnvelope: { id, lat, lon }[];
    drivewaysNearby: { lat, lon, side }[];
    crosswalksAtEnds: { lat, lon }[];
    busStopsNearby: { lat, lon }[];
    bikeLaneAdjacent: boolean;
  };
  // From operator input (UI for v2)
  operator: {
    businessName: string;
    frontageLengthFt: number;         // overrides default 50 ft
    buildingEntrancePosition: "north" | "center" | "south" | { lat, lon };
    includeOverheadStructure: boolean;
    includeHeaters: boolean;
    aestheticPalette: "utilitarian" | "warm-wood" | "modern-steel";
  };
  // From site walk (flagged as caveats if missing)
  siteWalk: {
    curbHeightInches?: number;        // typically 6
    utilityCoversInEnvelope?: { lat, lon, type }[];
    fdcLocationOnFacade?: { side, offsetFt };
    powerTapLocation?: { lat, lon };
  };
}

interface StreateryDesign {
  // Spatial truth — every element with position and dimensions
  platform: { polygon, heightInches, surface, edgeBanding };
  treePitCutouts: { polygon, treeId }[];
  utilityAccessPanels: { polygon, apwaCode, coverType }[];
  drainage: { channelPath, accessPoint };
  barriers: {
    street: { polylineWithLengths, type: "jersey" | "concrete", reflectorPositions };
    northEnd: { polyline, type };
    southEnd: { polyline, type };
  };
  ramps: {
    position: Point;
    direction: "N" | "S" | "perpendicular";
    slope: number;       // always 1:12 for ADA
    lengthFt: number;
    landingPolygon: Polygon;
  }[];
  overheadStructure?: {
    coveragePolygon: Polygon;
    heightFt: number;
    type: "pergola" | "awning" | "shade";
  };
  seating: {
    capacity: number;
    tables: { polygon, type: "standard" | "ada" }[];
    aisles: Polygon[];
  };
  signage: {
    sign1: { position, edge: "north" | "south" };
    sign2: { position, edge };
  };
  // Metadata for downstream renderers
  parameters: ParametricInputs;        // keep for reference
  siteWalkCaveats: string[];           // items the design assumed
  template: "1-space" | "2-space" | "3-space+";
}
```

### Template implementation pattern

Each template is a function from inputs to design:

```typescript
// src/parametric/templates/twoSpace.ts
export const twoSpaceTemplate: Template = {
  name: "2-space",
  minLengthFt: 20,
  maxLengthFt: 40,

  layout(inputs: ParametricInputs): StreateryDesign {
    // 1. Compute polygons from inputs
    const platform = computePlatform(inputs);

    // 2. Place fixed elements (barriers, signage on sidewalk edges)
    const barriers = computeBarriers(inputs, platform);
    const signage = computeSignage(inputs, platform);

    // 3. Place tunable elements (ramp position from operator input)
    const ramps = placeRamps(inputs, platform);

    // 4. Place tables (template's distinctive choice — 2-space has
    //    one ADA table + 4 standard tables in a specific arrangement)
    const seating = layoutTablesForTwoSpace(inputs, platform, ramps);

    // 5. Conditionally add overhead structure
    const overhead = inputs.operator.includeOverheadStructure
      ? layoutOverhead(inputs, platform, treesInEnvelope)
      : undefined;

    // 6. Tree pits and utility panels (data-driven cutouts)
    const treePitCutouts = computeTreePitCutouts(inputs, platform);
    const utilityAccessPanels = computeUtilityPanels(inputs, platform);

    return {
      platform,
      barriers,
      ramps,
      signage,
      seating,
      overheadStructure: overhead,
      treePitCutouts,
      utilityAccessPanels,
      drainage: computeDrainage(inputs, platform),
      template: "2-space",
      parameters: inputs,
      siteWalkCaveats: collectCaveats(inputs),
    };
  },
};
```

The template is just a way to *organize* the design choices. The dimensions, materials, and conventions live in the template body (handcoded with the architect). The site-specific values come from inputs.

### Renderer pattern

```typescript
// src/parametric/renderers/sitePlan.ts
export function renderSitePlan(design: StreateryDesign): string /* SVG */ {
  // Top-down view: project everything to xy plane
  // - Platform outline + edge banding
  // - Tree pit cutouts (filled with tree icons)
  // - Utility panels (filled, color-coded per APWA)
  // - Barriers (heavy lines, dashed for blocks vs solid for Jersey)
  // - Ramps (with arrows showing slope direction)
  // - Tables (with chair circles)
  // - Signage positions (rectangles with arrows showing facing)
  // - Dimensions on all major elements
  // - Title block, north arrow, scale bar, legend
  return svgOutput;
}
```

Each renderer is independent. The Site Plan renderer doesn't care about Elevations conventions and vice versa.

---

## Reference template format — how the architect delivers designs

This is the meeting's key open question. Three options:

### Option A: Hand-coded TypeScript template

Architect supplies the design as PDFs/sketches with specifications; we translate to code. Pros: precise, version-controlled with code. Cons: every architect tweak is a code change.

### Option B: Parameterized SVG with named regions

Architect supplies SVGs with `id="platform"`, `id="ramp"`, etc., and the tool morphs them based on inputs. Pros: architect works in their native tool (Illustrator/CAD → export SVG). Cons: morphing arbitrary SVG paths is fiddly; only works if the architect commits to a specific named-region convention.

### Option C: Declarative parameter sheet + generic renderer

Architect supplies a JSON/YAML "design specification" that the tool reads to know things like "barrier setback = 2 ft + bike_lane_adjacent ? 2 : 0" and "ramp default position = end nearest to building entrance, falling back to south end". Pros: architect changes don't require code; they edit the spec. Cons: the spec format itself is an interface that needs to be designed; some things are easier in code.

**Recommendation: hybrid — Option C for spatial layout rules, Option A for fixed conventions.**

Spatial choices ("where the ramp goes," "how barriers attach") go in a YAML spec the architect edits. Fixed code/standards conventions ("ADA 1:12 slope," "platform height = curb + 0") stay hardcoded. This gives the architect a clear interface to design against without making them write TypeScript.

Sample spec:

```yaml
template: 2-space
minLengthFt: 20
maxLengthFt: 40

platform:
  height: { feet: 0.5 }  # 6 inches above grade, flush with sidewalk
  edgeBanding: required

barriers:
  street:
    type:
      when: speedLimitMph >= 25
      then: jersey
      else: concrete-blocks
    setbackFromBikeLaneFt: 2
    reflectorSpacingFt: 4
  ends:
    type: same-as-street
    length: full-parking-lane-width

ramps:
  count: 1
  position:
    preferred: align-with-building-entrance
    fallback: south-end
  slope: 1:12        # ADA constant
  widthFt: 3.5
  landingFt: 5

seating:
  tablesPerStandardLayout: 5
  adaTablesRequired: 1
  adaTablePosition: nearest-to-ramp

signage:
  position: both-sidewalk-facing-edges
  size: { wFt: 0.708, hFt: 0.458 }  # 8.5" × 5.5"
```

The architect can iterate on this YAML directly; the tool's template runner reads it and constructs the design model. The Site Plan renderer then visualizes that model.

---

## Concrete decisions for the architect meeting

Narrow these down explicitly, in this order:

1. **Reference template format** — Option A (code), B (SVG morphing), or C (YAML spec), or hybrid?
2. **What's in the template vs site-driven** — for each of the 11 design elements, agree on the split. The dependency table above is a starting draft; architect refines.
3. **How granular are the three templates** — is "1-space" / "2-space" / "3-space+" enough, or do we need finer (e.g., "2-space-corner-site" vs "2-space-mid-block")?
4. **Building entrance handling** — operator inputs lat/lon? Picks on a map? Or just "north end / center / south end" of the frontage?
5. **Aesthetic palette** — single cohort design? 2-3 variants? Per-restaurant freedom within a constraint set?
6. **Output format priority** — SVG first (web/PDF rendering), or DXF first (architect can edit in CAD)?
7. **Site walk caveats in the design** — surface as on-drawing notes ("VERIFY: utility cover positions"), or only in the briefing doc?
8. **Versioning** — when the template changes, do all existing per-site designs auto-regenerate, or is that opt-in?

If you get through those 8 in the meeting, you have everything you need to scope v2 development.

---

## Known risks and flow improvements

The 4-layer model is structurally sound, but five risks are worth planning for explicitly — and four flow improvements address them with a single move each.

### Risks to plan for

1. **PE accountability** — ~~a PE stamps Drawing 4. If the parametric system produces an instance the PE didn't explicitly anticipate, liability gets fuzzy.~~ **RESOLVED (2026-06, v3):** DDOT accepts an **architect-only seal** for Drawing 4 — no PE stamp required in practice (confirmed to District Bridges; both approved reference sets are architect-sealed). The accountability model still holds with the **architect** as the sealing professional: architect reviews + seals the *template* with a stated parameter range; instances inside the range are pre-approved, instances outside trigger re-review. See `docs/v3-reference-set-teardown.md`.

2. **Building footprint data gap** — ~~every drawing assumes a building rectangle from the MAR address point + guessed dimensions. Real buildings have recessed entries, awnings, corner kinks. Cascades into ramp placement, signage facing, sometimes envelope shape.~~ **RESOLVED 2026-05-28** via DC's Building Footprints layer (`Facility_and_Structure_WebMercator/MapServer/1`). Spike confirmed 100% coverage across the cohort with real polygon shapes (5-38 vertices, not stub rectangles). Wired into the pre-screen pipeline as `geocoded.buildingFootprint`. Edge case to flag for the architect: corner buildings span multiple addresses (e.g., Purple Patch at 3155 Mt Pleasant and 1620 Lamont return the same polygon) — design system needs to treat the polygon as "the building," not "the polygon for this address." Most Mt Pleasant captures are 2015; major renovations since then should be a layer-3 site-walk flag.

3. **Site-walk data quality** — layer 3 is the only manual-input layer, so it's the most error-prone. A volunteer can confidently measure curb height but might miss a utility cover or mismeasure setbacks. **Mitigation:** structured mobile form with required photos per field; cross-check against pre-screen data and surface discrepancies (e.g., walker reports 5 ft sidewalk vs data's 8 ft) for resolution; two-person walks for the first 5-10 sites to calibrate.

4. **Aesthetic palette politics** — cohort consistency is the economic argument, but operators will push for individuality. If customization grows beyond a few slots, per-site cost rises and the parametric value collapses. **Mitigation:** define 2-3 named palettes with photographic examples up front; restrict customization to (a) one signage variant, (b) one accent color, (c) heater/overhead Y/N. Anything else = "v3" or "independent architect."

5. **PSC review cycle versioning** — designs are parametric until PSC submission, then frozen. Revisions (site-specific or rule-based) create churn unless versioning is explicit. **Mitigation:** submission locks a version. Regenerations create new versions with a clear diff. Operator + Mitra explicitly accept new versions before re-submitting.

### Flow improvements that solve multiple risks at once

**Mobile-first site walk app with photo evidence**. QR code on the pre-screen briefing → volunteer opens mobile form pre-filled with site context → required photos per measurement (FDC, utility cover, sidewalk with tape visible). Solves data-quality + provenance + later-dispute-evidence in one move.

**Cohort dashboard for Mitra**. Single view of every site's status across all 4 layers, all permits, PSC stages. Reuses the existing data model; just a different rendering. Removes "where are we" tax across 12+ restaurants.

**Per-layer audit trail**. Each layer carries `verified_by` + `verified_at` + `source`. Architect signs layer 1 once. Layer 2 auto-timestamps on every pre-screen. Layer 3 needs volunteer + date + photos. Layer 4 needs operator email confirmation. The architect (the sealing professional) gets visible provenance for what they're sealing.

**Calendar-aware planning**. The §5.1 timeline is 4-6 months end-to-end; streateries open in spring/summer; that pins submission to Jan-Feb. Tool surfaces "earliest realistic open date" when a site enters the pipeline. Avoids missed seasons.

### Smaller hygienic items worth baking in early

- **Liability watermark** on every generated drawing until architect-sealed ("AUTOMATED DRAFT — REQUIRES ARCHITECT REVIEW BEFORE SUBMISSION"). Prevents the "operator submitted raw output by mistake" disaster.
- **Re-eligibility alerts**: when DC data changes affect an existing cohort site (e.g., new bus priority lane plan), the system notices and pings the operator + Mitra. Compares fresh pre-screen against last-saved verdict.
- **Diff view between design versions**: visual comparison when a design regenerates. Reduces operator anxiety about silent changes.
- **Conflict resolution UX**: when layer 3 (site walk) contradicts layer 2 (pre-screen), explicit UI to resolve rather than silent override.

These don't need to be in v2 day one — flagging them now so they fit the architecture cleanly rather than getting bolted on later.

---

## Suggested v2 development sequence

1. **Operator-input UI** (frontage length, entrance position, business name) — unblocks template testing
2. **Surface sidewalk width** from existing Roadway Block fetch — quick win
3. **`ParametricInputs` extraction + `StreateryDesign` model** — no rendering yet, just the data structures
4. **Architect-supplied YAML spec for 2-space template** (most-common case)
5. **Site Plan renderer** (richest data, biggest visual payoff)
6. **End-to-end test**: pre-screen → operator inputs → 2-space spec → site plan SVG → embed in submission package
7. **1-space and 3-space templates** (incremental once 2-space works)
8. **Utility Access Plan renderer** (reuses Site Plan with overlays)
9. **Elevations renderer**
10. **Sections renderer**
11. **Construction Details** (architect-sealed — last and most constrained; no PE required in practice)

Estimate: items 1-6 = ~3-4 weeks of dev + ~10 hours architect time. Items 7-10 = ~2-3 weeks. Item 11 needs architect engagement for the construction details (no separate PE).
