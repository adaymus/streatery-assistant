# Mt. Pleasant Streatery Pre-Screener

## Project context

DC's permanent streatery program (launched Dec 2025) replaced the COVID-era temporary
program with strict design requirements and a slow Public Space Committee (PSC) review
queue. As of early 2026, only 5 streateries have been approved under the new program;
76 applications are pending PSC review. Most Mt. Pleasant restaurants that had streateries
have torn them down rather than navigate the process.

District Bridges (the Main Street organization for Mt. Pleasant and Columbia Heights) is
running a coordinated effort with an architect to develop reference designs that multiple
restaurants can adapt, dropping per-restaurant cost from ~$10K solo to ~$5K coordinated.
Initial cohort: Purple Patch, Martha Dear. Second wave likely includes Marx Cafe, La Tejana,
Ellē, Joia Burger, Suns Cinema, Beau Thai.

This tool — the **pre-screener** — is the front end of that effort. It takes a Mt. Pleasant
address and answers: *can a streatery legally be built here, how big, and what disqualifies it?*

It exists to let District Bridges triage the corridor in an afternoon instead of paying
for site surveys at addresses that turn out to be ineligible.

## Who uses this

- **Primary user**: Mitra Moin at District Bridges, doing corridor triage
- **Secondary user**: Restaurant owners checking their own site
- **Tertiary user**: Council candidates, ANC commissioners, journalists, neighbors
  who want to understand which blocks could support outdoor dining

Build for the primary user. The tool should be usable by a non-technical operator
in a browser, with no install. A simple web app — address in, structured result out,
with a map visualization — is the target form factor.

## What it does, end to end

1. User enters a Mt. Pleasant address (e.g., "3211 Mt. Pleasant Street NW")
2. Tool geocodes via DC's Master Address Repository (MAR) → returns lat/lon and
   the BLOCKKEY/BLOCKFACEKEY of the fronting blockface
3. Tool determines which side of the street the building is on (E/W/N/S)
4. Tool pulls the roadway classification, posted speed limit, and rush-hour
   restrictions for that blockface
5. Tool fetches all relevant curb features using the appropriate join strategy
   per dataset (see Data Layer Architecture below)
6. Tool applies buffer arithmetic from DDOT's Streatery Guidelines (Dec 2024)
7. Tool computes the longest contiguous buildable strip in the parking lane
   adjacent to the business frontage
8. Tool returns a structured eligibility result + a map visualization

## Data layer architecture

DC's curbside datasets fall into four tiers based on what join keys they carry.
Handle each tier with the appropriate strategy. All four tiers converge at a
uniform `{type, location, distance_to_envelope}` shape after fetching, so the
buffer-checking logic stays clean regardless of source.

### Tier 1: BLOCKFACEKEY datasets (cleanest)

**Examples**: Loading Zones

BLOCKFACEKEY identifies a specific side of the street, so a join immediately
tells you whether the feature is on the restaurant's side or across the street.
No geometric disambiguation needed.

```ts
const features = await fetchByBlockfaceKey(restaurantBlockfaceKey);
```

### Tier 2: BLOCKKEY datasets (block-level filter + geometric refinement)

**Examples**: Fire Hydrants (BLOCKKEY only, no SUBBLOCKKEY), Bicycle Lanes
(BLOCKID + SUBBLOCKID + BLOCKKEY — use BLOCKKEY)

BLOCKKEY narrows to "all features on this block" — typically a small number.
Then apply a geometric distance filter to drop features on the wrong side of
the street or at the far end of the block.

```ts
const blockFeatures = await fetchByBlockKey(restaurantBlockKey);
const relevant = blockFeatures.filter(f =>
  pointToLineDistance(f.geometry, buildableEnvelope) < BUFFER_DISTANCE
);
```

### Tier 3: Address-keyed datasets (blockface-encoded)

**Examples**: Parking Meters

The "address" field is NOT a building address. It's a blockface identifier
encoded as `{block_start} {street} {side}`, e.g., `"3200 Mount Pleasant Street NW E"`.
Match by deriving the blockface key from the restaurant's address (floor street
number to nearest 100) AND matching side.

```ts
function getBlockfaceKey(address: string): string {
  // "3211 Mount Pleasant Street NW" → "3200 Mount Pleasant Street NW"
  const match = address.match(/^(\d+)\s+(.+)$/);
  if (!match) throw new Error(`Unparseable address: ${address}`);
  const streetNumber = parseInt(match[1], 10);
  const blockNumber = Math.floor(streetNumber / 100) * 100;
  return `${blockNumber} ${match[2]}`;
}

function parseMeterAddress(raw: string): { blockface: string; side: "E" | "W" | "N" | "S" } {
  const match = raw.match(/^(.+)\s+([ENWS])$/);
  if (!match) throw new Error(`Unexpected meter address format: ${raw}`);
  return { blockface: match[1].trim(), side: match[2] as "E" | "W" | "N" | "S" };
}
```

For meters specifically: returns all meters on the restaurant's side of their
block. Geometric refinement to envelope is NOT needed for v1 — the architect
uses the full meter list. The `LONGITUDE` field appears broken (zero); ignore
it. `DDOTMDSPX/Y` are projected MD State Plane NAD83 coords, deferrable until
needed.

**TODO when generalizing beyond Mt Pleasant**: the `Math.floor(n / 100) * 100`
assumption holds for regular 100-unit blocks (which Mt Pleasant Street uses).
DC has exceptions, especially in older neighborhoods and around traffic circles.

### Tier 4: Geometry-only datasets (bounding box spatial query)

**Examples**: Urban Forestry Street Trees, ADA Curb Ramps

No join keys at all. Pull all features within a bounding box around the
geocoded address (100 ft radius is plenty for the largest buffer rule of
25 ft), then filter by distance to the buildable envelope.

```ts
const bbox = expandBboxAroundPoint(restaurantLatLon, 100); // feet
const features = await fetchWithinBbox(bbox);
const relevant = features.filter(f =>
  pointToLineDistance(f.geometry, buildableEnvelope) < BUFFER_DISTANCE
);
```

### Side-of-street normalization

Streets in Mt Pleasant run in multiple orientations. Mt Pleasant Street itself
runs roughly north-south, so meters there are tagged E/W. The cross streets
(Lamont, Park, Kenyon, Irving) run east-west and their meters are tagged N/S.
The side-parsing regex handles all four. Make sure test cases cover both
orientations.

**TODO when generalizing**: diagonal streets (Florida Ave, Connecticut Ave,
Massachusetts Ave) — unknown how DDOT tags meters on diagonals. Not a Mt
Pleasant problem in v1.

## Eligibility rules (from DDOT Streatery Guidelines, Section 3)

### Hard disqualifiers for parking lane streateries

- Speed limit > 30 mph
- Street classified as Principal Arterial, Other Freeway and Expressway, or Interstate Functional
- Rush-hour restricted parking lane (becomes a travel lane at any time of day)
- Bus lane or bus stop zone
- Loading zone
- Pick-up/drop-off (PUDO) zone
- ADA on-street parking meter
- Capital Bikeshare station (existing or planned)
- Micromobility (bike/scooter) corral
- On a utility vault or Washington Gas regulator station vault
- Parking spaces not directly adjacent to the curb
- Street curves or hills with sight-distance issues
- High vehicle collision history

### Required buffers (parking lane)

| Distance | From |
|----------|------|
| 3 ft | Fire Department Connections (building-mounted, see data gap below) |
| 10 ft | Fire hydrants |
| 10 ft | Crosswalks |
| 15 ft | Bus zones |
| 20 ft | Intersections without crosswalks |
| 22 ft | Main residential building entrances |
| 25 ft | Curb cuts, driveways, alleys |

A streatery's buildable envelope is the longest contiguous strip in the parking lane
adjacent to the business frontage that respects ALL of the above buffers simultaneously.

### Width

Streatery width is bounded by the parking lane width (typically 6-8 feet from the curb).
For v1, assume 6 ft.

### Frontage extension

A streatery can extend in front of immediately adjacent properties IF the operator
gets a letter of consent from the adjacent property owner AND ground-floor tenant.
For v1, compute envelope based on the operator's own frontage only and flag potential
extension opportunities as a separate output.

## Data sources (verified on opendata.dc.gov)

### Confirmed and required for MVP

| Dataset | Join strategy | Notes |
|---------|---------------|-------|
| **Master Address Repository (MAR) + DC Geocoder API** | n/a | Public, no auth. Returns lat/lon and blockface keys. |
| **Roadway Functional Classification** | BLOCKKEY | Determines Type 1 vs Type 2 barrier requirement. |
| **Roadway Block** | BLOCKKEY | Block-level segment geometry and attributes. |
| **Roadway Blockface** | BLOCKFACEKEY | Unbroken sections of curb. The canonical unit a streatery occupies. |
| **Roadway SubBlock** | SUBBLOCKKEY | Finer subdivision; useful for buffer math. |
| **Curbs** | spatial | Planimetric curb edge polylines. Use to compute parking-lane polygon (curb edge offset 6-8 ft inward). |
| **Fire Hydrants** | BLOCKKEY + spatial refinement | Sourced from DC Water (~9,500 hydrants citywide). |
| **Parking Meters** | blockface-encoded address + side | Daily updated. Address field is `{block_start} {street} {side}` — see Tier 3 above. |
| **Bicycle Lanes** | BLOCKKEY | Has BLOCKID + SUBBLOCKID + BLOCKKEY; use BLOCKKEY. |
| **Metro Bus Stops** | BLOCKKEY + SUBBLOCKKEY | Cleanest possible join — explicitly designed for relating to roadway data. |
| **Loading Zones** | BLOCKFACEKEY | Tier 1 — side-of-street disambiguation built in. |
| **Urban Forestry Street Trees** | spatial bbox | No join keys. |
| **ADA Curb Ramp** | spatial bbox | No join keys. Pedestrian ramps only, NOT vehicle driveways. |

### Lower priority / verify before relying on

- **Capital Bikeshare stations** — use Capital Bikeshare's public GBFS feed
  (gbfs.lyft.com), not Open Data DC. Easier and more current.
- **Sidewalk Ramps 2010** — older dataset, may be superseded by ADA Curb Ramp.

### Confirmed data gaps (DO NOT silently ignore)

These must be surfaced as mandatory site walk caveats in every result. Never
claim a site is fully cleared without including the full caveat list.

- **Driveway curb cuts** as a distinct dataset — does not appear to exist as a clean
  layer. The ADA Curb Ramp dataset covers pedestrian ramps but not vehicle driveways.
  For v1, fall back to mandatory site walk caveat for the 25 ft curb cut buffer.
  Don't try to derive in v1.
- **Fire Department Connections (FDCs)** — building-mounted, not in any DC Open Data
  layer. The 3 ft FDC buffer is always a site walk item.
- **Crosswalks** — clean dataset not confirmed. The 10 ft crosswalk buffer is a
  site walk item in v1. Worth a 5-minute search on opendata.dc.gov before deferring
  entirely.
- **PUDO zones, bus lanes, rush-hour parking restrictions** — not confirmed to exist
  as clean datasets. May be embedded in DDOT curbside management or parking sign
  data. Defer to site walk caveat list rather than encoding.
- **Utility vault locations** — partial coverage at best. Site walk caveat.

## Output format

```json
{
  "address": "3211 Mt. Pleasant Street NW",
  "blockface": {
    "blockkey": "...",
    "blockfacekey": "...",
    "side": "E"
  },
  "verdict": "ELIGIBLE_WITH_CAVEATS",
  "street_segment": {
    "classification": "Minor Arterial",
    "barrier_type_required": "Type 2",
    "speed_limit_mph": 25,
    "rush_hour_restricted": false
  },
  "buildable_envelope": {
    "length_ft": 24,
    "width_ft": 6,
    "approximate_parking_spaces": 1.3,
    "recommended_template": "1-space",
    "geometry": "...GeoJSON..."
  },
  "binding_constraints": [
    {"type": "bus_stop", "distance_ft": 18, "buffer_required_ft": 15, "limits": "northern edge"},
    {"type": "street_tree", "distance_ft": 12, "limits": "preserved within envelope"}
  ],
  "meters_on_blockface": [
    {"meter_id": "123-45678", "side": "E"},
    {"meter_id": "123-45679", "side": "E"}
  ],
  "site_walk_required": [
    "Confirm Fire Department Connection location on building façade",
    "Verify no driveway curb cuts within 25 ft (DC dataset coverage incomplete)",
    "Verify no marked crosswalks within 10 ft (dataset not integrated in v1)",
    "Verify no utility vaults within parking lane (DC dataset coverage incomplete)",
    "Confirm sidewalk width meets ADA path-of-travel requirements"
  ],
  "data_freshness": {
    "fire_hydrants": "2025-11-01",
    "parking_meters": "2026-04-08",
    "bus_stops": "2026-01-15"
  }
}
```

Verdict values: `ELIGIBLE` | `ELIGIBLE_WITH_CAVEATS` | `INELIGIBLE`.

### Verdict thresholds (envelope length)

Anchored to a standard DC parking space (~20 ft) rather than arbitrary feet,
so the buckets line up with the architect's 1-space / 2-space reference designs.

| Verdict | Envelope length | Meaning |
|---------|-----------------|---------|
| `ELIGIBLE` | ≥ 20 ft | Fits the 1-space template without compromise |
| `ELIGIBLE_WITH_CAVEATS` | 12–20 ft | Sub-1-space — viable only with a frontage extension (neighbor + ground-floor tenant consent) or a custom shorter design |
| `INELIGIBLE` | < 12 ft | No realistic configuration fits |

Plus a map visualization showing the frontage, the buildable envelope, and each
binding constraint as an annotated marker.

## Scope

### In scope for v1

- Single-address lookups
- Mt. Pleasant geographic focus (do not over-engineer for citywide use,
  but don't hardcode against generalization)
- Parking lane streateries only (skip travel lane and alley variants)
- Static results (no save/share/account features)
- Browser-based, no install

### Out of scope for v1

- Travel lane and alley streateries (different rule sets, different applicants)
- Block-level batch triage (will add once single-address works reliably)
- Submission package generation (that's the next tool, the package compiler)
- Authentication, accounts, save state
- Email or notification features
- Multi-jurisdiction support
- Any kind of CAD output

### Explicit non-goals

- This tool does NOT replace a site walk
- This tool does NOT replace an architect
- This tool does NOT replace a PE
- This tool does NOT make legal or compliance guarantees
- This tool's results are advisory; every result must communicate this clearly

## Tech stack (suggested, not mandatory)

- **Frontend**: Next.js + TypeScript + Tailwind. Single page app, no backend
  framework needed for v1
- **Map**: Mapbox GL JS or MapLibre with OpenStreetMap tiles
- **Geometry**: Turf.js for buffer arithmetic (built-in `buffer`, `intersection`,
  `difference`, `pointToLineDistance`, `booleanPointInPolygon`)
- **Data fetching**: Direct calls to DC Open Data's Socrata/ArcGIS REST API
  endpoints client-side; no backend needed unless rate limiting becomes an issue
- **Hosting**: Vercel free tier

If something simpler works (a single HTML file with vanilla JS), prefer that.
The user's tech stack pref leans React/TS for learning value.

## Conventions

- All distances in feet, all coordinates in WGS84 lat/lon
- Use the appropriate join tier per dataset (see Data Layer Architecture)
- All API responses cached client-side with explicit refresh
- Every external data source must surface its "last updated" timestamp in the UI
- Every disqualifier must be human-readable (not "BUFFER_VIOLATION_3" but "Hydrant
  6 ft from frontage center — needs 10 ft minimum")
- Site walk caveats are mandatory output, not optional
- The tool's voice is helpful and direct, not legal-CYA. Caveats should explain
  what to verify, not disclaim everything

## Resolved data questions

- [x] Hydrants: BLOCKKEY only → block filter + geometric refinement (Tier 2)
- [x] Street Trees: no keys → bounding box spatial query (Tier 4)
- [x] Parking Meters: blockface-encoded address with E/W/N/S suffix. NOT building
      addresses. Match by deriving blockface key from restaurant address (floor to
      nearest 100) AND matching side (Tier 3)
- [x] Loading Zones: BLOCKFACEKEY → cleanest possible join (Tier 1)
- [x] Bicycle Lanes: BLOCKID + SUBBLOCKID + BLOCKKEY → use BLOCKKEY (Tier 2)
- [x] ADA Curb Ramps: no keys → bounding box spatial query (Tier 4)
- [x] Parking meter address strings match MAR street naming convention (verified by user)

## Open questions to resolve while building

- [ ] Confirm DC Geocoder returns BLOCKKEY and BLOCKFACEKEY directly, or whether
      a second lookup is needed
- [ ] Determine the cleanest way to compute "which side of the street" the
      restaurant is on (E/W/N/S) — likely from MAR response or from building
      footprint relative to street centerline
- [ ] Is there a marked crosswalk inventory anywhere on Open Data DC under a
      different name? Worth a 5-minute search before deferring entirely
- [x] ~~Threshold for `ELIGIBLE_WITH_CAVEATS` vs `INELIGIBLE`?~~ Resolved:
      ELIGIBLE if envelope ≥ 20 ft (full 1-space template), CAVEATS if 12–20 ft
      (needs frontage extension consent or custom shorter design), INELIGIBLE
      if < 12 ft. See "Verdict thresholds" under Output format.
- [ ] How does the DC Geocoder handle ambiguous addresses on Mt. Pleasant Street
      (NW vs NE, addresses split across blocks)?
- [ ] Verify the 100-unit block assumption holds throughout Mt Pleasant before
      generalizing the parking meter blockface derivation

## Deployment goal

A working v1 demo to show Mitra Moin within 2 weeks. It does not need to be
polished. It needs to take an address, return a result, and let her say
"yes this is useful, here's what I'd change" or "no, here's what's missing."

---

## Submission package requirements (for the next tool — package compiler)

Sourced from the **DDOT Streatery Guidelines, FINAL, adopted December 5, 2024**
(`Streatery_Guidelines_-_2024.12.05_-_FINAL.pdf`), §5 Review and Approval
Process. The pre-screener tells an operator IF a site is eligible; the
package compiler will produce the actual submission. This section is the
spec for that downstream tool.

### Permits required to operate a permanent streatery

| # | Permit | Issuing agency | System | Hearing body | Review time |
|---|--------|----------------|--------|--------------|-------------|
| 1 | **Streatery Block Permit** *(coordinated cohort only — BIDs, CIDs, MSOs like District Bridges)* | DDOT | TOPS | PSC | 2-3 months |
| 2 | **Streatery Design Permit** *(every food establishment)* | DDOT | TOPS | Admin (if guidelines-compliant) OR PSC (if not) | 4 weeks admin / 2-3 months PSC |
| 3 | **Building Permit** | DOB | ProjectDox | Staff | 30 business days |
| 4 | **Streatery Endorsement** *(if serving alcohol)* | ABCA | ABCA application | ABC Board | ~2 months |
| 5 | **Propane Use: Heating — Portable Outdoor** *(if using heaters)* | FEMS | fems.dc.gov | Staff | 5 calendar days |
| 6 | **Certificate of Occupancy** (new or modified) | DOB | ProjectDox | Staff | 7 days from acceptance |
| 7 | **Certificate of Use** *(annual renewal required)* | DOB | Email coapp@dc.gov | Staff | 1 business day |

Pre-flight: **Preliminary Design Review Meeting (PDRM)** — TOPS, 1-day turnaround, lets the applicant pre-clear concept with DDOT before formal submission. Recommended before #1 or #2.

Streatery permits do NOT require annual renewal from DDOT, but DDOT may revoke them to accommodate infrastructure projects (bus priority lanes, protected bike lanes, etc.) — operators are notified during the planning stage. Certificate of Use IS annually renewable through DOB.

### Required documents — Streatery Block Permit

The District Bridges-style coordinated submission. Two documents:

1. **Site Plan** — must show:
   - Building façade(s), addresses, building entrances
   - Existing sidewalk widths
   - Existing curb cuts and/or driveways
   - Existing bike lanes, bus routes, bus stops
   - Existing trash services (alleys only)
   - Existing parking spaces with dimensions + curbside regulation description
   - Proposed streatery footprint with dimensions and setback measurements

2. **Curbside Management and Delivery Plan** — must include:
   - List of businesses on the corridor + their existing loading zones (on- and off-street)
   - Proposed commercial loading zones for goods deliveries
   - Proposed pick-up/drop-off zones (takeout, on-demand delivery, passengers)
   - List of vehicle types servicing the businesses
   - Number of delivery vehicles per day/week
   - Days/times when deliveries are received
   - Aerial map of all existing signage/curbside programming + off-site facilities
   - Aerial map of all proposed changes
   - Streetview/photographs of areas to be reprogrammed (current photos recommended)
   - Brief justification narrative explaining how displaced curbside activity (parking, PUDO, commercial loading) will be managed

### Required documents — Streatery Design Permit

Every food establishment files this. 13 items:

| # | Document | Notes |
|---|----------|-------|
| 1 | **Site Plan** | See sub-list below |
| 2 | **Elevations (all sides)** | Side-view drawings of the proposed design with all dimensions, enclosure treatments, lighting, materials |
| 3 | **Sections** | "Cut-through" drawings articulating complex elements (e.g., how accessibility is provided) |
| 4 | **Construction Details** | **Must be stamped by a certified Professional Engineer (PE).** Shows assembly hardware, fasteners, materials, construction notes, AND a positive drainage flow detail along the curb line (including how to access the drainage channel if blocked) |
| 5 | **Utility Access Plan** | Shows existing utilities in/under/adjacent to the proposed streatery; proposed APWA-color-code markings on the platform/barriers; access panels, removable planks, or other movable platform components |
| 6 | **Copy of Certificate of Occupancy** | From DOB |
| 7 | **Building Permit Application** | Filed in tandem |
| 8 | **Copy of Business License** | — |
| 9 | **Notarized Copy of Rental Lease Agreement** | Only if applicant is not the property owner |
| 10 | **Letter of Support** | Required from: (a) Single Member District (SMD) commissioner if streatery occupies RPP spaces; (b) adjacent property owner(s) AND ground-floor tenant(s) if streatery extends in front of an adjacent property (the "frontage extension" path the pre-screener flags) |
| 11 | **Proof of Insurance** | Per Office of Risk Management requirements (`orm.dc.gov/page/requirements-contractors-grantees-and-permittees`). Questions: `orm.insurance@dc.gov`. Specific amounts not published in the Guidelines |
| 12 | **Signed Terms and Conditions Sheet** | Template in Guidelines Appendix 2 |
| 13 | **Point of Contact Information** | PDF with name, title, email, phone for emergency and non-emergency access requests |

**Site Plan (item 1) detailed contents:**
- Building façade(s), addresses, building entrances
- Existing sidewalk widths
- Existing curb cuts and/or driveways
- Adjacent bike lanes or auto travel lanes
- Existing parking spaces (dimensions + curbside regulations)
- Existing parking meter numbers, including which will be removed (format `XXX-XXXXX`, visible on the meter facing the street)
- Other existing sidewalk elements (fire hydrants, streetlights, benches, bike racks)
- Existing utilities in/under/adjacent to the proposed streatery
- Existing street trees + tree pits (include photos)
- Proposed streatery footprint with dimensions and setback dimensions

### Required physical signage on the installed streatery

Per §4.7 + Appendix 1: two 5.5" × 8.5" signs (one on each sidewalk-facing edge) showing:
- Business name
- Seating hours
- Seating capacity
- Emergency contact information

No other signage, logos, advertising, or branding permitted.

### Public notice process

After the public space permit is submitted and a hearing is assigned, the applicant must print the permit + public-notice sign from TOPS and post the sign in the front window of the business **at least 10 calendar days before the PSC hearing**. ANCs, public utilities, and owner/occupants of adjacent properties have a 15-30 business day review/comment window for the streatery plans.

### Display of permit after issuance

Streatery permit AND approved site plan must be displayed in a conspicuous location on the front of the business, legible from the sidewalk. Failure to maintain this is a violation.

### Inspections

DDOT Public Space Inspections (PSI) Branch + DOB inspect the installed streatery for compliance with the approved plans. **Third-party inspections are NOT allowed.** DDOT may conduct random ongoing inspections.

### Fees

Per DCMR §24-225 plus any pending rulemaking. Confirmed values from external sources (verify in TOPS before final submission):

| Item | Approximate cost | Notes |
|------|------------------|-------|
| Streatery Design Permit | $260 | Same as sidewalk cafes |
| Public Space Rental | ~$20/sq ft annually | Per draft rulemaking; pending final adoption |
| Building Permits | $200-$500+ | Varies by structure |
| Streatery Endorsement (alcohol, annual) | $100 | ABCA |
| Construction costs | $10K-$50K+ | Operator-borne, not a permit fee |

Payment: check/money order to "DC Treasurer," or Discover/MasterCard/Visa.

### District Bridges' role in the cohort approach

The Streatery Block Permit pathway is what makes the District Bridges coordinated cohort economically viable. As a Main Street Organization (MSO), District Bridges files ONE Block Permit covering the corridor's curbside management; individual restaurants then file their own Design Permits referencing the Block Permit. This is what drops per-restaurant cost from ~$10K to ~$5K.

### What the package compiler tool should produce (v2 scope)

For each address the pre-screener clears, the compiler should ultimately produce:
- A pre-filled **Streatery Design Permit application** ready for TOPS upload
- A draft **Site Plan PDF/SVG** based on the geocoded blockface + envelope + nearby curb features (still requires architect refinement, but starts from real data not a blank page)
- A draft **Utility Access Plan** populated from the curb-features dataset
- A printable **Public Notice sign** in the prescribed format
- The **Signed Terms and Conditions Sheet** template ready for signature
- A **Point of Contact PDF** template
- A coordinated **Curbside Management and Delivery Plan** for the corridor-wide Block Permit (one document covering all participating restaurants)

The v1 briefing document (`src/submissionPackage.ts`) is a stepping stone — it tells the architect/operator what data the pre-screener gathered, so they can use it as input when assembling the real package.

### Open questions for the compiler tool

- [ ] Exact insurance amounts and policy types required by ORM (not in the Guidelines — needs direct ORM contact)
- [ ] Whether construction details PE stamp can be a digital signature or requires a wet stamp
- [ ] Whether the Streatery Block Permit can be submitted before individual Design Permits, or must they be concurrent
- [ ] Format requirements for PDF uploads in TOPS (max file size, color/grayscale, etc.)
- [ ] What constitutes "guidelines-compliant" for the administrative-vs-PSC review fork on the Design Permit — is the pre-screener's verdict sufficient, or does DDOT have its own checklist?

---

## Addendum: Mt. Pleasant API verification (2026-04-10)

Findings from live API testing against DC Open Data endpoints. This section
captures Mt. Pleasant-specific results. When expanding to other neighborhoods,
re-verify these assumptions — block numbering, side tagging, and corridor
baselines will differ.

### Verified API endpoints

| Layer | Endpoint | Layer ID |
|-------|----------|----------|
| MAR Geocoder | `https://citizenatlas.dc.gov/newwebservices/locationverifier.asmx/findLocation2?str={address}&f=json` | n/a |
| Address Points | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Location_WebMercator/FeatureServer/0/query` | 0 |
| Roadway Block | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/163/query` | 163 |
| Roadway Blockface | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/164/query` | 164 |
| Roadway SubBlock | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/162/query` | 162 |
| Roadway Functional Classification | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/48/query` | 48 |
| Parking Meters | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DDOT/Parking/FeatureServer/8/query` | 8 |
| Pavement Markings (crosswalks) | `https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Traffic_Calming_WebMercator/MapServer/96/query` | 96 |

The DCGIS Geocoder REST endpoint at `geocode.dcgis.dc.gov` returned ECONNREFUSED
during testing — appears down or deprecated. Use the `citizenatlas.dc.gov` MAR
endpoint instead.

### Resolved: geocoding pipeline (3 calls, not 1)

The MAR geocoder does NOT return BLOCKKEY or BLOCKFACEKEY directly. It returns
`MAR_ID`, lat/lon, and `ROADWAYSEGID`. The required pipeline is:

1. **MAR Geocoder** → fuzzy address parsing, lat/lon, MAR_ID, confidence score
2. **Address Points layer** (query by MAR_ID) → BLOCKKEY, SUBBLOCKKEY, ROUTEID
3. **Roadway Blockface layer** (query by ROUTEID + side) → BLOCKFACEKEY, curb geometry

The MAR's fuzzy matching is excellent: normalizes "Mt" → "MOUNT", "St" → "STREET",
handles missing quadrants, and returns nearby candidates with confidence scores
when an exact match isn't found (100 = exact, 82 = block-level, 70 = partial).

### Resolved: side-of-street derivation

Side-of-street is NOT returned by any single API. Derive it from address parity
using the Roadway Block layer's address range fields:

1. Query Roadway Block (163) by BLOCKKEY
2. Compare the building's street number against `ADDRESS_RANGE_RIGHT_LOW/HIGH`
   and `ADDRESS_RANGE_LEFT_LOW/HIGH`
3. "Right"/"Left" is relative to the route's digitizing direction

For Mt Pleasant Street (digitized northbound): Right = East, Left = West.
Odd addresses (3201-3299) fall on the Right/East side. Even addresses on Left/West.

The Roadway Blockface layer's `SIDE` field also uses "Right"/"Left" (not compass
directions). The parking meter dataset uses compass letters (E/W/N/S). The mapping
is consistent: Right = E on Mt Pleasant St, Right = N on cross streets.

**Generalization note**: the Right/Left → compass direction mapping depends on
the route's digitizing direction, which varies by street. Do not hardcode E/W.

### Resolved: crosswalk data EXISTS

The **Pavement Marking** dataset (MapServer/96) contains crosswalk locations.
This was previously listed as a confirmed data gap.

- Filter: `MARKINGDETAIL IN (3, 4, 5)` (Standard, Diagonal, Longitudinal crosswalks)
- 16,117 crosswalk records citywide; 152 in the Mt Pleasant area
- Point geometry (center of crosswalk, not full extent) — Tier 4 spatial query
- No BLOCKKEY — use bounding box query like street trees
- No reliable timestamp fields (CREATED/EDITED are null)

**Updated caveat**: downgrade from "dataset not integrated" to "crosswalk locations
from DDOT Pavement Marking dataset — verify no recently added/removed crosswalks
on site walk."

### Resolved: 100-unit block numbering confirmed for Mt Pleasant

All Mt Pleasant Street meters use clean 100-unit blocks: 3000, 3100, 3200.
Cross streets also clean: 600, 700, 1600 (Lamont); 1600 (Kenyon); 700, 1300,
1400 (Park Rd). No exceptions found.

**Generalization note**: DC has irregular block numbering near traffic circles
and in older neighborhoods. Re-verify before expanding.

### Corrections to main spec

| Item | Spec says | Verified value |
|------|-----------|----------------|
| Martha Dear address | 3236 Mt Pleasant St NW | **3110 Mt Pleasant St NW** (3236 does not exist in the MAR) |
| Parking lane width | Assume 6 ft | **8 ft per side**. `TOTALPARKINGLANEWIDTH` is the SUM across both sides (e.g., 16 ft on Mt Pleasant); divide by `TOTALPARKINGLANES` (2) for the per-side number a streatery actually occupies |
| Meter LONGITUDE field | "Broken (zero); ignore it" | Field is called `LON` (not `LONGITUDE`) and **contains valid WGS84 coordinates** |
| Meter street format | Matches MAR naming | Meters use abbreviations (`ST` not `STREET`, `MOUNT` not `Mt`) — normalization required when matching against MAR output |
| Roadway Functional Class | Separate dataset needed | **Roadway Block (163) contains everything**: speed, functional class, parking lanes, bus lanes, address ranges — no need to query layer 48 separately |
| Crosswalks | Confirmed data gap | **Pavement Marking dataset exists** — Tier 4 spatial query, point geometry |
| MAR confidence field | `CONFIDENCE_LEVEL` | **`ConfidenceLevel`** — only PascalCase field in an otherwise SCREAMING_SNAKE response. Easy to miss; results in silent 0/100 scores if you use the wrong name |
| Roadway Block speed | `SPEEDLIMIT` | **`SPEEDLIMITS_IB` / `SPEEDLIMITS_OB`** — split by direction (inbound/outbound). Coalesce with `??` — they're nearly always equal on city streets |
| Roadway Block functional class | `FUNCTIONAL_CLASS` | **`FHWAFUNCTIONALCLASS`** (and `DCFUNCTIONALCLASS` for the DC equivalent) |
| Loading Zones tier | Tier 1 (BLOCKFACEKEY) | **Tier 4 (spatial bbox)** — the actual layer (`DDOT/Parking/FeatureServer/0`) has no BLOCKFACEKEY field. Only road-network reference is `SEGID`, which doesn't match the ROUTEID/BLOCKKEY scheme. Sign records come in pairs per zone; dedupe by `LZ_ID` |
| Parking Meters tier | Tier 3 (address-keyed, requires side-mapping derivation) | **Tier 1 (ROUTEID + SIDE)** — the meters layer carries native `ROUTEID` and `SIDE` (Right/Left) fields, identical to the join on Roadway Blockface. No address parsing or compass-direction derivation needed. For block-level precision, additionally filter by `MEASURE BETWEEN block.FROMMEASURE AND block.TOMEASURE` |
| Meter ADDRESS hundred-block | Matches Roadway Block sub-blocks | **Meter ADDRESS uses 100-block convention only** (e.g., "3100 MOUNT PLEASANT ST NW E" covers all addresses 3100-3199), while Roadway Block can split a hundred-block into multiple sub-blocks (e.g., 3100-3145 and 3140-3172 are separate records). String-based ADDRESS filtering would miss this; the `MEASURE` range filter handles it correctly |
| Fire Hydrants tier | Tier 2 (BLOCKKEY only) | **Tier 1 (BLOCKFACEKEY)** — `Public_Safety_WebMercator/MapServer/5` carries native `BLOCKFACEKEY`, `BLOCKKEY`, `ROUTEID`, `MEASURE`. Joining by BLOCKFACEKEY automatically excludes opposite-side hydrants. Bonus: `BANDCOLOR` (AWWA flow capacity) and `FLOW` (gpm) provide useful UI context |
| Driveway curb cuts | "Does not appear to exist as a clean layer" | **Layer EXISTS**: `Transportation_ADA_WebMercator/MapServer/4` ("ADA Driveway") — point geometry, Tier 4 spatial query. 5 driveways found within 200 ft of Martha Dear during testing. Downgrades the 25 ft curb-cut buffer from mandatory site walk to verified dataset (still flag for site walk because dataset coverage may be incomplete) |
| Street tree `TBOX_L` sentinel | Real measurement in feet | **`TBOX_L = 99` is a sentinel** meaning "unknown / extended planter strip" — not a literal 99 ft tree box. Tree boxes for individual trees are typically 9-11 ft. Filter out or special-case the 99 value in downstream buffer math |
| Roadway Blockface structure | One record per "block side" | **One record per curb sub-segment.** A single block side typically has 2-5 sub-records split at curb breaks (driveways, geometry changes). Querying `ROUTEID + SIDE` alone returns the whole route (~10-20 records); pair with a spatial bbox to narrow. Stitch matching sub-segments by sorting on `MEAS_FROM` and concatenating polylines |
| Roadway Blockface MEAS units | Feet (assumed) | **Meters.** `MEAS_FROM`/`MEAS_TO` are in route meters, which align numerically with Roadway Block's `FROMMEASURE`/`TOMEASURE` (also in meters). The Roadway Block's `LENGTH` field is also meters (Mt Pleasant 3100 block is 137.85 m = ~452 ft, not 138 ft). Parking lane width fields (`TOTALPARKINGLANEWIDTH`) ARE still in feet though — units are mixed within the same layer |
| Multi-block blockfaces | Each blockface is per-block | **A single blockface record can span multiple blocks** when there are no curb breaks across cross streets. Seen on Mt Pleasant East side: one 281 m / 923 ft record spans from Irving to Kilbourne. For envelope math, clip the returned polyline to the building's block by interpolating MEAS values into positions along the line and slicing with `turf.lineSlice` |
| MAR geocoder browser access | CORS works | **No CORS headers AND fronted by F5 WAF.** Browser-direct fetch fails twice over. The WAF rejects requests with browser-identifying headers (`Origin`, `Referer`, `Sec-Fetch-*`, browser User-Agent) — returns a small HTML "Request Rejected. Please consult with your administrator." page. Any proxy must strip those headers AND set a non-browser User-Agent before forwarding. ArcGIS endpoints (`maps2.dcgis.dc.gov`) DO send CORS headers and don't have this WAF issue — browser-direct fetch works for those |
| Cloudflare rate-limit binding field | `binding` (Workers convention) | **`name`** for Cloudflare Pages Functions. The official Workers docs show `[[ratelimits]] binding = "..."`, which wrangler rejects on Pages projects with `Unexpected fields found in ratelimits[0] field: "binding"`. Pages-specific convention: `name = "RATE_LIMIT"` |
| Building footprint data | Spec says "no building footprint data — operator supplies" | **Building Footprints layer EXISTS**: `Facility_and_Structure_WebMercator/MapServer/1`. Polygon geometry, 5-38 vertices per building (real shape with corners), 100% coverage tested across the cohort. NO address join field — only spatial. Query by `geometryType=esriGeometryPoint` + `spatialRel=esriSpatialRelIntersects` with the MAR address lat/lon. Returns 0 or 1 polygon. **Corner buildings span multiple addresses** — same polygon returned for both addresses (e.g., 3155 Mt Pleasant = 1620 Lamont, same building). Most Mt Pleasant captures dated 2015-04; some refresh captures as recent as 2023-05. Resolves the v2 architecture risk on building-shape assumptions |

### Roadway Block (163) additional useful fields

Available from the same call that gives us speed/class — pull them all in one
request rather than re-querying. Useful for UI context and for cheap disqualifier
checks:

- `BLOCK_NAME` — human-readable label (e.g., `"3100 - 3145 BLOCK OF MOUNT PLEASANT STREET NW"`)
- `FROMSTREET` / `TOSTREET` — bounding cross streets (e.g., `IRVING ST NW` <-> `KENYON ST NW`)
- `BUSLANE_INBOUND` / `BUSLANE_OUTBOUND` — disqualifier check (treat any non-`None`, non-empty value as a bus lane present)
- `WARD_ID`, `ANC_ID`, `SMD_ID` — civic context for the eventual UI
- `LENGTH` — total block length in feet (useful for envelope sizing sanity checks)

### Side-of-street derivation: address-range overlap edge case

The cleanest test for side-of-street is "is the street number inside the Right
range XOR inside the Left range?" — but DC's address ranges occasionally overlap.
Real example: the 3140-3172 block on Mt Pleasant St has Right=3147-3167 and
Left=3140-3172, so an odd number like 3155 falls inside BOTH ranges.

**Rule**: use range-based derivation when the result is unambiguous (in one
range only), and fall back to address parity (odd/even) when both or neither
range matches. For Mt Pleasant Street: odd = Right (East), even = Left (West).
Both checks are cheap; always run both.

### Parking meter field notes

- The `ADDRESS` field format is `{block} {STREET_NAME} {QUADRANT} {SIDE}`,
  e.g., `3200 MOUNT PLEASANT ST NW E` — all uppercase
- A separate `SIDE` field exists with values `Right`/`Left` (not compass letters),
  usable as a cross-check
- Most Mt Pleasant meters are `MULTI` (multi-space, serving 5-10 spaces each);
  only 3 `SINGLE` meters exist on the 3000 block W side
- `LAT`/`LON` fields are populated with valid WGS84 coordinates
- `DDOTMDSPX/Y` are Maryland State Plane NAD83 (WKID 26985) — valid but not needed
  when `LAT`/`LON` work

### Mt Pleasant corridor baseline (all blocks 3005-3499)

| Attribute | Value | Streatery impact |
|-----------|-------|------------------|
| Speed limit | 20 mph | Well under 30 mph disqualifier |
| FHWA Functional Class | 5 (Major Collector) or 7 (Local) | Not arterial — eligible |
| DC Functional Class | 17 (Collector) or 19 (Local) | Not arterial — eligible |
| Parking lanes | 1-2 per block | Present on all commercial blocks |
| Parking lane width | 8 ft | Wider than the 6 ft assumption in main spec |
| Bus lanes | None | No disqualifier |
| AADT | ~6,800 (2020) | Moderate traffic |
| ROUTEID | 11062532 | Consistent across all blocks |

**Implication**: no Mt Pleasant address will fail on street-level disqualifiers.
Eligibility is entirely determined by curbside features (hydrants, meters, bus
stops, trees, crosswalks) and buffer arithmetic.

### FHWA functional class decoder (for disqualifier logic)

| Code | Meaning | Streatery eligible? |
|------|---------|---------------------|
| 1 | Interstate | No |
| 2 | Other Freeway / Expressway | No |
| 3 | Principal Arterial | No |
| 4 | Minor Arterial | Yes |
| 5 | Major Collector | Yes |
| 6 | Minor Collector | Yes |
| 7 | Local | Yes |

DC functional class equivalents: 11 (Interstate), 12 (Freeway), 14 (Principal
Arterial) → disqualify. 16 (Minor Arterial), 17 (Collector), 19 (Local) → eligible.

### Updated open questions

- [x] ~~DC Geocoder returns BLOCKKEY/BLOCKFACEKEY directly?~~ No — 3-call pipeline
      (MAR → Address Points → Roadway Blockface)
- [x] ~~Side-of-street derivation?~~ Address parity vs Roadway Block address ranges;
      Right/Left relative to digitizing direction
- [x] ~~Crosswalk inventory?~~ Pavement Marking dataset, `MARKINGDETAIL IN (3,4,5)`,
      Tier 4 spatial query
- [x] ~~Geocoder ambiguous address handling?~~ Excellent fuzzy matching with confidence
      scores; returns nearby candidates when exact match fails
- [x] ~~100-unit block assumption?~~ Confirmed for all Mt Pleasant streets
- [x] ~~Threshold for ELIGIBLE_WITH_CAVEATS vs INELIGIBLE?~~ Resolved 2026-05-22:
      ≥20 ft ELIGIBLE (full 1-space), 12–20 ft CAVEATS (needs frontage extension
      or custom design), <12 ft INELIGIBLE. Anchored to standard DC parking
      space length so verdicts align with architect reference designs.
