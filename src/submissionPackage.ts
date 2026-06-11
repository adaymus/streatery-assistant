/**
 * Submission package compiler.
 *
 * Renders a pre-screen result into a comprehensive Markdown package
 * that bundles every document we can prepare in software, plus clearly
 * marked placeholders for the architectural drawings that require a
 * licensed architect (the guidelines also name a PE for the Construction
 * Details, though DDOT has accepted architect-only seals in practice).
 *
 * Document structure follows the DDOT Streatery Guidelines (FINAL,
 * December 5, 2024) §5.2 "Required Documents" checklist for the
 * Streatery Design Permit. See CLAUDE.md "Submission package
 * requirements" for the full reference.
 *
 * What this v1 package contains:
 *
 *   GENERATED (ready to use, may need operator fill-in):
 *     - Cover + verdict summary
 *     - Submission roadmap (permits, agencies, timelines)
 *     - Eligibility findings (location, constraints, curb features)
 *     - Site walk checklist
 *     - Letter of Support template (address + ANC + SMD pre-filled)
 *     - Terms and Conditions Sheet (official Appendix 2 text)
 *     - Point of Contact template
 *     - On-site Streatery Sign template (Appendix 1)
 *     - Operator-provided documents checklist (what to gather)
 *     - Structured JSON appendix for downstream tools
 *
 *   PLACEHOLDER (v2 — needs a licensed architect):
 *     - Site Plan
 *     - Elevations (all sides)
 *     - Sections
 *     - Construction Details (architect-sealed; see note below)
 *     - Utility Access Plan
 *
 * Each placeholder explains what the drawing must contain (per the
 * Guidelines) and what data the pre-screener has already gathered as
 * input for the architect.
 */

import type { PrescreenResult } from "./prescreen.js";

interface SubmissionPackage {
  filename: string;
  content: string;
}

/** Backwards-compat alias — older callers still use the briefing name. */
export const buildBriefing = buildSubmissionPackage;

interface BuildOptions {
  /**
   * Skip the structured-JSON appendix. Useful for the PDF render —
   * the JSON serves machine consumers (downstream tools, CLI users),
   * not humans reading a printed package, and at ~1,000 lines it
   * would balloon the page count for no value.
   */
  includeJsonAppendix?: boolean;
}

export function buildSubmissionPackage(
  result: PrescreenResult,
  options: BuildOptions = {},
): SubmissionPackage {
  const { includeJsonAppendix = true } = options;
  const fetchedDate = new Date(result.fetchedAt);

  const sections = [
    coverSection(result, fetchedDate),
    aboutPackageSection(),
    submissionRoadmapSection(),
    documentStatusSection(),
    verdictSection(result),
    locationSection(result),
    ...optionalSections(result),
    curbFeaturesSection(result.curbFeatures),
    siteWalkSection(result.siteWalkCaveats),
    operatorProvidedSection(),
    drawingPlaceholdersSection(result),
    letterOfSupportSection(result),
    termsAndConditionsSection(),
    pointOfContactSection(result),
    onSiteSignSection(),
    provenanceSection(result),
    ...(includeJsonAppendix ? [jsonAppendixSection(result)] : []),
  ];

  const addressSlug = slugify(result.geocoded.mar.fullAddress);
  const dateSlug = isoDateSlug(fetchedDate);
  return {
    filename: `streatery-submission-package-${addressSlug}-${dateSlug}.md`,
    // Single blank line between sections; each major section is already
    // separated by an H1 and a leading horizontal rule for visual breaks.
    content: sections.join("\n\n") + "\n",
  };
}

function optionalSections(result: PrescreenResult): string[] {
  const out: string[] = [];
  const { eligibility, earlyDisqualifiers } = result;
  if (
    earlyDisqualifiers.length > 0 ||
    (eligibility?.hardDisqualifiers.length ?? 0) > 0
  ) {
    out.push(disqualifiersSection(result));
  }
  if (eligibility && eligibility.bindingConstraints.length > 0) {
    out.push(bindingConstraintsSection(eligibility.bindingConstraints));
  }
  if (eligibility?.extensionOpportunity.couldHelp) {
    out.push(extensionSection(eligibility));
  }
  return out;
}

// ============================================================================
// COVER + ROADMAP
// ============================================================================

function coverSection(result: PrescreenResult, fetchedDate: Date): string {
  return (
    `# Streatery Submission Package\n\n` +
    `**${result.geocoded.mar.fullAddress}**\n\n` +
    `Prepared ${fetchedDate.toLocaleString()}.`
  );
}

function aboutPackageSection(): string {
  return [
    `## About this package`,
    ``,
    `This document bundles every piece of the DC Streatery Permit ` +
      `submission that can be prepared from data: the eligibility ` +
      `findings, the official templates with as much auto-populated as ` +
      `possible, and clear placeholders for the architectural drawings ` +
      `that require a licensed architect.`,
    ``,
    `It is generated automatically from DC Open Data sources by the Mt. ` +
      `Pleasant Streatery Pre-Screener. **It is advisory only** and does ` +
      `not substitute for a site walk, architect review, or formal ` +
      `Public Space Committee approval.`,
    ``,
    `Source: DDOT Streatery Guidelines, FINAL, adopted December 5, 2024.`,
  ].join("\n");
}

function submissionRoadmapSection(): string {
  return [
    `## Submission roadmap`,
    ``,
    `Operating a permanent streatery requires multiple permits across ` +
      `four agencies. Sequence and timing matter — start with the ` +
      `Preliminary Design Review Meeting before formal submission.`,
    ``,
    `| # | Permit | Agency | System | Hearing body | Review time |`,
    `| --- | --- | --- | --- | --- | --- |`,
    `| 0 | Preliminary Design Review Meeting (PDRM) | DDOT | TOPS | n/a | 1 day |`,
    `| 1 | Streatery Block Permit *(MSO/BID/CID only)* | DDOT | TOPS | PSC | 2-3 months |`,
    `| 2 | Streatery Design Permit | DDOT | TOPS | Admin OR PSC | 4 weeks admin / 2-3 months PSC |`,
    `| 3 | Building Permit | DOB | ProjectDox | Staff | 30 business days |`,
    `| 4 | Streatery Endorsement *(if alcohol)* | ABCA | ABCA application | ABC Board | ~2 months |`,
    `| 5 | Propane Use: Heating *(if heaters)* | FEMS | fems.dc.gov | Staff | 5 calendar days |`,
    `| 6 | Certificate of Occupancy | DOB | ProjectDox | Staff | 7 days from acceptance |`,
    `| 7 | Certificate of Use *(annual)* | DOB | Email coapp@dc.gov | Staff | 1 business day |`,
    ``,
    `**Public notice**: once the public space permit is submitted and a ` +
      `hearing is assigned, print the permit + notice sign from TOPS and ` +
      `post it in the front window **at least 10 calendar days before ` +
      `the PSC hearing**.`,
  ].join("\n");
}

function documentStatusSection(): string {
  return [
    `## Document status — Streatery Design Permit`,
    ``,
    `Per Streatery Guidelines §5.2, the Design Permit requires 13 items. ` +
      `Status as of this package:`,
    ``,
    `| # | Document | Status | Notes |`,
    `| --- | --- | --- | --- |`,
    `| 1 | Site Plan | **PLACEHOLDER (v2)** | Architect to produce; pre-screener has gathered curb feature data as input |`,
    `| 2 | Elevations (all sides) | **PLACEHOLDER (v2)** | Architect to produce |`,
    `| 3 | Sections | **PLACEHOLDER (v2)** | Architect to produce |`,
    `| 4 | Construction Details | **PLACEHOLDER (v2)** | Architect to produce + seal; DDOT accepts architect-only (guidelines name a PE) |`,
    `| 5 | Utility Access Plan | **PLACEHOLDER (v2)** | Architect to produce; pre-screener has gathered utility-relevant features as input |`,
    `| 6 | Copy of Certificate of Occupancy | **Operator to provide** | From DOB |`,
    `| 7 | Building Permit Application | **Operator to file** | ProjectDox; separate from this package |`,
    `| 8 | Copy of Business License | **Operator to provide** | — |`,
    `| 9 | Notarized Rental Lease Agreement | **Operator to provide** *(if not owner)* | — |`,
    `| 10 | Letter of Support | **Template in this package** | Pre-filled with address + ANC; operator to obtain signature |`,
    `| 11 | Proof of Insurance | **Operator to obtain** | Per ORM requirements |`,
    `| 12 | Signed Terms and Conditions Sheet | **Template in this package** | Official Appendix 2 text; operator signs |`,
    `| 13 | Point of Contact Information | **Template in this package** | Operator to fill in name/email/phone |`,
  ].join("\n");
}

// ============================================================================
// ELIGIBILITY FINDINGS (carried over from the earlier briefing)
// ============================================================================

function verdictSection(result: PrescreenResult): string {
  const { eligibility, earlyDisqualifiers } = result;
  const verdict =
    earlyDisqualifiers.length > 0
      ? "INELIGIBLE"
      : (eligibility?.verdict ?? "INELIGIBLE");

  const lines = [`## Verdict`, ``, `**${verdict.replace(/_/g, " ")}**`, ``];

  if (eligibility && eligibility.envelope.lengthFt > 0) {
    const e = eligibility.envelope;
    lines.push(
      `| | |`,
      `| --- | --- |`,
      `| Buildable envelope length | ${e.lengthFt.toFixed(1)} ft |`,
      `| Width (full parking lane) | ${e.widthFt.toFixed(0)} ft |`,
      `| Approximate parking spaces displaced | ${e.approximateParkingSpaces} |`,
      `| Recommended template | ${e.recommendedTemplate} |`,
      ``,
      `*Verdict thresholds: ≥20 ft = **ELIGIBLE** (1-space template fits ` +
        `without compromise). 12-20 ft = **ELIGIBLE_WITH_CAVEATS** ` +
        `(viable only with frontage extension consent or a custom ` +
        `shorter design). <12 ft = **INELIGIBLE** — no realistic ` +
        `configuration fits.*`,
    );
  }

  return lines.join("\n");
}

function locationSection(result: PrescreenResult): string {
  const { geocoded } = result;
  const b = geocoded.block;
  return [
    `## Location`,
    ``,
    `| | |`,
    `| --- | --- |`,
    `| Address | ${geocoded.mar.fullAddress} |`,
    `| Coordinates | ${geocoded.mar.latitude}, ${geocoded.mar.longitude} |`,
    `| MAR confidence | ${geocoded.mar.confidenceScore}/100 |`,
    `| Block | ${b.blockName} |`,
    `| Bounded by | ${b.fromStreet} ↔ ${b.toStreet} |`,
    `| Side of street | ${geocoded.side} |`,
    `| Speed limit | ${b.speedLimitMph ?? "?"} mph |`,
    `| Functional class | FHWA ${b.functionalClassFhwa ?? "?"} / DC ${b.functionalClassDc ?? "?"} |`,
    `| Parking lane width | ${b.parkingLaneWidthPerSideFt?.toFixed(0) ?? "?"} ft per side |`,
    `| Bus lane on block | ${b.hasBusLane ? "**YES** (disqualifier)" : "no"} |`,
    `| Ward / ANC / SMD | Ward ${b.wardId ?? "?"} / ANC ${b.ancId ?? "?"} / *(SMD TBD)* |`,
  ].join("\n");
}

function disqualifiersSection(result: PrescreenResult): string {
  const lines = [`## Disqualifiers`, ``];
  for (const d of result.earlyDisqualifiers) {
    lines.push(`- **${d.rule}** — ${d.detail}`);
  }
  if (result.eligibility) {
    for (const hd of result.eligibility.hardDisqualifiers) {
      lines.push(`- ${hd}`);
    }
  }
  return lines.join("\n");
}

function bindingConstraintsSection(
  constraints: NonNullable<
    PrescreenResult["eligibility"]
  >["bindingConstraints"],
): string {
  const lines = [
    `## Binding constraints`,
    ``,
    `These features sit at the edge of the buildable envelope — they're ` +
      `what's limiting the streatery's size.`,
    ``,
  ];
  for (const c of constraints) {
    lines.push(
      `- **${c.description}** — ${c.bufferFt} ft buffer required, limits ${c.limits}`,
    );
  }
  return lines.join("\n");
}

function extensionSection(
  eligibility: NonNullable<PrescreenResult["eligibility"]>,
): string {
  const e = eligibility.extensionOpportunity;
  return [
    `## Frontage extension opportunity`,
    ``,
    `With a **letter of consent from the adjacent property owner AND the ` +
      `ground-floor tenant**, the streatery could extend into the ` +
      `neighbor's frontage. With a ${e.extendedFrontageFt} ft combined ` +
      `frontage, the buildable envelope grows to ` +
      `**${e.extendedEnvelopeLengthFt.toFixed(1)} ft** (vs ` +
      `${eligibility.envelope.lengthFt.toFixed(1)} ft on the operator's ` +
      `frontage alone).`,
    ``,
    `Per §5.2 item 10, this scenario triggers an additional Letter of ` +
      `Support requirement (separate from the SMD letter), signed by both ` +
      `the adjacent property owner AND the adjacent ground-floor tenant.`,
  ].join("\n");
}

function curbFeaturesSection(
  curbFeatures: PrescreenResult["curbFeatures"],
): string {
  return [
    `## Curb features`,
    ``,
    `### On this blockface`,
    ``,
    `| Feature | Count |`,
    `| --- | --- |`,
    `| Parking meters | ${curbFeatures.parkingMeters.length} |`,
    `| Fire hydrants | ${curbFeatures.fireHydrants.length} |`,
    `| Bus stops | ${curbFeatures.busStops.length} |`,
    `| Bicycle lanes | ${curbFeatures.bicycleLanes.length} |`,
    ``,
    `### Within 150-200 ft (both sides of the street)`,
    ``,
    `| Feature | Count |`,
    `| --- | --- |`,
    `| Loading zones | ${curbFeatures.loadingZones.length} |`,
    `| Street trees | ${curbFeatures.streetTrees.length} |`,
    `| ADA curb ramps | ${curbFeatures.adaCurbRamps.length} |`,
    `| Driveway curb cuts | ${curbFeatures.driveways.length} |`,
    `| Crosswalks | ${curbFeatures.crosswalks.length} |`,
  ].join("\n");
}

function siteWalkSection(caveats: string[]): string {
  const lines = [
    `## Site walk required`,
    ``,
    `These items cannot be verified from DC Open Data and must be ` +
      `confirmed on site, **even when the verdict is ELIGIBLE**.`,
    ``,
  ];
  for (const c of caveats) {
    lines.push(`- [ ] ${c}`);
  }
  return lines.join("\n");
}

function operatorProvidedSection(): string {
  return [
    `## Operator-provided documents`,
    ``,
    `These documents are not auto-generated. Gather them before ` +
      `submitting the Streatery Design Permit application via TOPS.`,
    ``,
    `- [ ] **Copy of Certificate of Occupancy** — request from DOB if not ` +
      `on hand. Required even if you also file a Modified C of O.`,
    `- [ ] **Building Permit Application** — file via ProjectDox. May be ` +
      `submitted in tandem with the public space permit.`,
    `- [ ] **Copy of Business License** — current DC business license.`,
    `- [ ] **Notarized Copy of Rental Lease Agreement** — only if you ` +
      `(the applicant) are not the property owner.`,
    `- [ ] **Proof of Insurance** — per Office of Risk Management ` +
      `requirements at \`orm.dc.gov/page/requirements-contractors-` +
      `grantees-and-permittees\`. Specific coverage amounts are not in ` +
      `the Streatery Guidelines — contact \`orm.insurance@dc.gov\` for ` +
      `current values.`,
    `- [ ] **Streatery Endorsement** *(if serving alcohol)* — separate ` +
      `application to ABCA (annual fee $100). ~2 month review.`,
    `- [ ] **Propane Use: Heating permit** *(if installing heaters)* — ` +
      `via FEMS, ~5 calendar day turnaround.`,
  ].join("\n");
}

// ============================================================================
// ARCHITECTURAL DRAWING PLACEHOLDERS (v2)
// ============================================================================

function drawingPlaceholdersSection(result: PrescreenResult): string {
  return [
    `---`,
    ``,
    `# Architectural drawings *(v2 — placeholders)*`,
    ``,
    `The five engineering drawings below cannot be generated automatically ` +
      `in this version. They require a licensed architect and a coordination ` +
      `process with the operator. (The guidelines name a PE for the ` +
      `Construction Details, but DDOT has accepted architect-only seals — ` +
      `both approved Mt Pleasant / 11th St reference sets are architect-` +
      `sealed.) The exact format and content will be established in v2 of ` +
      `this tool, working with Mitra Moin (District Bridges) and the ` +
      `project architect.`,
    ``,
    `Each placeholder below lists what the drawing must contain (per ` +
      `DDOT Streatery Guidelines §5.2) plus the relevant data this ` +
      `pre-screener has already gathered — so when v2 ships, the ` +
      `architect starts from real curb data, not a blank page.`,
    ``,
    drawingPlaceholder({
      number: 1,
      title: "Site Plan",
      mustContain: [
        "Building façade(s), addresses, and associated building entrances",
        "Existing sidewalk widths",
        "Existing curb cuts and/or driveways",
        "Adjacent bike lanes or auto travel lanes",
        "Existing parking spaces with dimensions and curbside regulation description",
        "Existing parking meter numbers, including which will be removed (format XXX-XXXXX)",
        "Other existing sidewalk elements (fire hydrants, streetlights, benches, bike racks)",
        "Existing utilities in/under/adjacent to the proposed streatery",
        "Existing street trees and tree pits (include photos)",
        "Proposed streatery footprint and dimensions, including setback dimensions",
      ],
      preScreenerInput: buildSitePlanInputSummary(result),
    }),
    drawingPlaceholder({
      number: 2,
      title: "Elevations (all sides)",
      mustContain: [
        "Dimensions of streatery and any proposed roof structure",
        "Various elements: enclosure treatments, lighting, materials included in the design",
        "Side-view drawings of every face of the streatery",
      ],
      preScreenerInput:
        `The buildable envelope is ` +
        `${result.eligibility?.envelope.lengthFt.toFixed(1) ?? "?"} ft long ` +
        `× ${result.eligibility?.envelope.widthFt.toFixed(0) ?? "?"} ft wide ` +
        `(${result.eligibility?.envelope.recommendedTemplate ?? "?"} template). ` +
        `Overall height is constrained by Streatery Guidelines §4.3 ` +
        `(Overhead Structures) — architect to specify.`,
    }),
    drawingPlaceholder({
      number: 3,
      title: "Sections",
      mustContain: [
        '"Cut-through" drawings articulating complex design elements',
        "Specifically: how accessibility is provided (ADA path of travel from sidewalk into streatery)",
      ],
      preScreenerInput:
        `Site is on the ${result.geocoded.side} side of ` +
        `${result.geocoded.block.blockName}, ` +
        `parking lane ${result.geocoded.block.parkingLaneWidthPerSideFt?.toFixed(0) ?? "?"} ft wide. ` +
        `Per Guidelines §4.5, ADA-compliant access from the sidewalk is mandatory.`,
    }),
    drawingPlaceholder({
      number: 4,
      title: "Construction Details (architect-sealed)",
      requiresProfessionalSeal: true,
      mustContain: [
        "Any hardware (fasteners, brackets) used in construction",
        "A positive drainage flow detail along the curb line, including how to access the drainage channel if blocked",
        "Materials identified and construction notes",
      ],
      preScreenerInput:
        `Per Guidelines §4.2 (Streatery Protection), barrier type depends on ` +
        `street classification. This site is FHWA functional class ` +
        `${result.geocoded.block.functionalClassFhwa ?? "?"} ` +
        `(${functionalClassLabel(result.geocoded.block.functionalClassFhwa)}) ` +
        `at ${result.geocoded.block.speedLimitMph ?? "?"} mph — architect to ` +
        `confirm whether Jersey barriers or concrete blocks are required. ` +
        `**Must be sealed by a DC-licensed architect. The guidelines name a ` +
        `PE for this drawing, but DDOT has accepted architect-only seals; ` +
        `confirm the current expectation with District Bridges.**`,
    }),
    drawingPlaceholder({
      number: 5,
      title: "Utility Access Plan",
      mustContain: [
        "Existing utilities in/under/adjacent to the proposed streatery",
        "Proposed markings or signage on the streatery platform or barriers identifying utilities (APWA color code)",
        "Access panels, removable planks, or other movable platform components",
      ],
      preScreenerInput:
        `This pre-screener does not currently fetch utility-vault data (a ` +
        `confirmed DC Open Data gap). Architect must coordinate with Miss ` +
        `Utility (\`8-1-1\`) to identify subsurface utilities before ` +
        `producing this drawing. Above-ground utility-adjacent features ` +
        `gathered by the pre-screener: ` +
        `${result.curbFeatures.fireHydrants.length} hydrant(s) on blockface, ` +
        `${result.curbFeatures.streetTrees.length} street tree(s) within 150 ft.`,
    }),
  ].join("\n\n");
}

function drawingPlaceholder(args: {
  number: number;
  title: string;
  mustContain: string[];
  preScreenerInput: string;
  requiresProfessionalSeal?: boolean;
}): string {
  const contents = args.mustContain.map((item) => `- ${item}`).join("\n");
  const sealClause = args.requiresProfessionalSeal
    ? ` This drawing must be sealed by a DC-licensed architect (the ` +
      `guidelines name a PE, but DDOT has accepted architect-only seals).`
    : "";
  return [
    `---`,
    ``,
    `## Drawing ${args.number}: ${args.title}`,
    ``,
    `> **PLACEHOLDER FOR ARCHITECTURAL DRAWING (v2)**  `,
    `> This page will hold the **${args.title}** drawing. Producing it ` +
      `requires an architect and a deliverable format (PDF/CAD).${sealClause} ` +
      `The exact format and template will be defined in v2 of this tool ` +
      `with input from Mitra Moin (District Bridges) and the project ` +
      `architect.`,
    ``,
    `### What this drawing must contain (per Guidelines §5.2)`,
    ``,
    contents,
    ``,
    `### Pre-screener input for the architect`,
    ``,
    args.preScreenerInput,
  ].join("\n");
}

function functionalClassLabel(fhwa: number | null): string {
  switch (fhwa) {
    case 1:
      return "Interstate";
    case 2:
      return "Other Freeway/Expressway";
    case 3:
      return "Principal Arterial";
    case 4:
      return "Minor Arterial";
    case 5:
      return "Major Collector";
    case 6:
      return "Minor Collector";
    case 7:
      return "Local";
    default:
      return "unknown class";
  }
}

function buildSitePlanInputSummary(result: PrescreenResult): string {
  const cf = result.curbFeatures;
  return (
    `Curb feature inventory from DC Open Data, ready to overlay onto the ` +
    `architect's CAD base:\n\n` +
    `- ${cf.parkingMeters.length} parking meter(s) on this blockface (METERID values in the JSON appendix)\n` +
    `- ${cf.fireHydrants.length} fire hydrant(s) on this blockface\n` +
    `- ${cf.busStops.length} bus stop(s) on this block\n` +
    `- ${cf.bicycleLanes.length} bicycle lane segment(s) on this block\n` +
    `- ${cf.streetTrees.length} street tree(s) within 150 ft (with species, DBH, and tree-box dimensions in the JSON appendix)\n` +
    `- ${cf.adaCurbRamps.length} ADA curb ramp(s) within 150 ft\n` +
    `- ${cf.driveways.length} driveway curb cut(s) within 200 ft\n` +
    `- ${cf.crosswalks.length} crosswalk(s) within 150 ft\n` +
    `- ${cf.loadingZones.length} loading zone(s) within 200 ft\n\n` +
    `All coordinates are WGS84 (lat/lon). The blockface polyline geometry ` +
    `is in the JSON appendix under \`geocoded.blockface.geometry\`. ` +
    `Parking lane width is ` +
    `${result.geocoded.block.parkingLaneWidthPerSideFt?.toFixed(0) ?? "?"} ft per side.`
  );
}

// ============================================================================
// DOCUMENT TEMPLATES (the things we CAN generate)
// ============================================================================

function letterOfSupportSection(result: PrescreenResult): string {
  const b = result.geocoded.block;
  return [
    `---`,
    ``,
    `# Letter of Support *(template)*`,
    ``,
    `> Per Guidelines §5.2 item 10, a Letter of Support is required from:  `,
    `> **(a)** the Single Member District (SMD) commissioner if the ` +
      `streatery occupies Residential Parking Permit (RPP) spaces, OR  `,
    `> **(b)** the adjacent property owner AND ground-floor tenant if ` +
      `the streatery extends in front of an adjacent property ` +
      `(frontage-extension scenario).`,
    ``,
    `Replace the bracketed fields below with current information before ` +
      `requesting a signature.`,
    ``,
    `---`,
    ``,
    `**[Date]**`,
    ``,
    `District Department of Transportation  `,
    `Public Space Management Branch  `,
    `1100 4th Street SW, 2nd Floor  `,
    `Washington, DC 20024`,
    ``,
    `RE: Letter of Support for Streatery at ${result.geocoded.mar.fullAddress}`,
    ``,
    `To Whom It May Concern:`,
    ``,
    `I, **[name and title of signer]**, write in support of the proposed ` +
      `streatery to be operated by **[business name]** at ` +
      `**${result.geocoded.mar.fullAddress}**, on the ` +
      `${result.geocoded.side.toLowerCase()} side of the ` +
      `${b.blockName.toLowerCase().replace(/^\d+\s*-\s*\d+\s+block of\s+/, "")} ` +
      `block (Ward ${b.wardId ?? "?"}, ANC ${b.ancId ?? "?"}, SMD **[SMD ID]**).`,
    ``,
    `**[Optional: paragraph explaining the relationship — SMD commissioner, ` +
      `adjacent property owner, or ground-floor tenant — and the reason ` +
      `for support.]**`,
    ``,
    `I have no objection to the proposed streatery occupying public space ` +
      `as described in the Streatery Design Permit application.`,
    ``,
    `Sincerely,`,
    ``,
    `___________________________________  `,
    `**[Signer's printed name]**  `,
    `**[Title / role]**  `,
    `**[Contact email + phone]**`,
  ].join("\n");
}

function termsAndConditionsSection(): string {
  // Verbatim text from Streatery Guidelines, Appendix 2. The brackets in
  // the official text are intentional fill-in placeholders.
  return [
    `---`,
    ``,
    `# Terms and Conditions Sheet`,
    ``,
    `> Official text from Streatery Guidelines, Appendix 2. Permit Holder ` +
      `signs at the bottom. Bracketed fields require operator fill-in.`,
    ``,
    `---`,
    ``,
    `## GOVERNMENT OF THE DISTRICT OF COLUMBIA`,
    `## DEPARTMENT OF TRANSPORTATION`,
    `## WASHINGTON, D.C.`,
    ``,
    `### TERMS AND CONDITIONS FOR THE PUBLIC RIGHT OF WAY OCCUPANCY PERMIT FOR [FOOD ESTABLISHMENT NAME]`,
    ``,
    `### Preamble`,
    ``,
    `This Permit is being granted to the **[Permittee Name]** ("Permit Holder"),`,
    ``,
    `WHEREAS, THE DISTRICT OF COLUMBIA ("District") is the Owner of the ` +
      `following described property in Washington, D.C., located in public ` +
      `space near the street addresses described in and shown on ` +
      `Attachment A attached hereto; and`,
    ``,
    `WHEREAS, the Permit Holder is **[enter brief description of the Permittee]**; and`,
    ``,
    `WHEREAS, the purpose of this Permit is to provide Permit Holder with ` +
      `an Occupancy Permit for the authorized occupation of the parking ` +
      `lane of a roadway or use of designated parts of an alley network or ` +
      `travel lane specifically for outdoor dining; and`,
    ``,
    `WHEREAS, in accordance with the provisions of 24 DCMR § 100.1 et seq., ` +
      `DDOT issued a public space permit to the Permit Holder for the ` +
      `installation and maintenance of a Streatery as shown on the site ` +
      `plans attached here to as Attachment A; and`,
    ``,
    `WHEREAS, the rules and regulations of the District of Columbia ` +
      `authorize the Mayor, or their agent, designee, or representative to ` +
      `impose such conditions on the issuance of said permits as the Mayor ` +
      `may require, 24 DCMR § 100.1, as amended; and`,
    ``,
    `WHEREAS, the District has prepared the permit terms and conditions ` +
      `as set out below; and`,
    ``,
    `NOW, THEREFORE, based upon the above recitals, Permit Holder hereby ` +
      `agrees to the terms and conditions of this occupancy permit as ` +
      `follows:`,
    ``,
    `### Article I. Definitions`,
    ``,
    `1. For the purposes of these Terms and Conditions, the following terms are defined as follows:`,
    ``,
    `   *"APWA color codes"* shall mean the color codes developed by the ` +
      `American Public Works Association for the identification of ` +
      `underground-buried facilities and that have been adopted by the ` +
      `District of Columbia.`,
    ``,
    `   *"Public utility operator"* will have the same definition as in ` +
      `DC Official Code at § 34-2701(5): "a person, agency or ` +
      `instrumentality of the District of Columbia government, who supplies ` +
      `or transports any of the following materials or services by means ` +
      `of a utility line or conduit: (A) Gas of any kind, including ` +
      `flammable, toxic, or corrosive gas; (B) Liquids, including coal ` +
      `slurry, petroleum, petroleum products, or other hazardous liquids; ` +
      `(C) Electric energy; (D) Communication services; (E) Sewage disposal ` +
      `and drainage; (F) Water; or (G) Steam."`,
    ``,
    `### Article II. Scope of this Permit`,
    ``,
    `2. The foregoing recitals are incorporated by reference as substantive ` +
      `provisions of these Terms and Conditions as if they had been ` +
      `restated in their entirety.`,
    ``,
    `3. The parties acknowledge that no right, title, or interest of the ` +
      `public is thereby acquired, waived, or abridged.`,
    ``,
    `4. The Permit Holder shall install the Streatery in accordance with ` +
      `the requirements set forth in the public space permit, the site ` +
      `plans attached here to as Exhibit A, and all applicable laws and ` +
      `regulations.`,
    ``,
    `5. Notwithstanding anything to the contrary in this Agreement, DDOT ` +
      `has the legal right to authorize work and/or issue permits for work ` +
      `to be completed at or around the Permit Holder's permitted Streatery.`,
    ``,
    `### Article III. Maintenance Requirements`,
    ``,
    `6. The Permit Holder shall maintain the Streatery in accordance with ` +
      `these Terms and Conditions, the required public space permit until ` +
      `such time as this Permit is terminated pursuant to the terms of ` +
      `this Permit. All maintenance of the Streatery shall be performed in ` +
      `accordance with all applicable laws and regulations.`,
    ``,
    `7. Without prior notice from the District of Columbia, Permit Holder ` +
      `shall maintain the Streatery during the term of this Permit.`,
    ``,
    `8. The Permit Holder shall maintain and keep the Streatery clean, ` +
      `free of trash, graffiti, rodent activity, tree debris, and unsafe ` +
      `conditions at all times, without the need for prior notice by the ` +
      `District.`,
    ``,
    `9. Repairs of the streatery shall be made by, and at the expense and ` +
      `risk of, Permit Holder.`,
    ``,
    `10. In the event of a declared snow emergency event, the Permit ` +
      `Holder shall remove all furnishings from the Streatery area. Snow ` +
      `may be piled onto the Streatery so long as the adjacent sidewalk is ` +
      `cleared.`,
    ``,
    `11. Permit Holder hereby relieves the District of all duty to repair ` +
      `or maintain said Streatery for the term of this Permit.`,
    ``,
    `### Article IV. Public Space Coordination`,
    ``,
    `12. If Permit Holder proposes to modify any portion of their permit, ` +
      `Permit Holder is required to submit a new public space permit ` +
      `application for the proposed modified streatery design.`,
    ``,
    `13. If DDOT or a public utility operator authorizes or performs ` +
      `non-emergency work in the street that requires the removal of the ` +
      `Streatery (such as maintaining, repairing, or installing utilities, ` +
      `or roadway, or gaining access to the curb for tree trimming, ` +
      `maintenance, or lighting maintenance), the Permit Holder shall be ` +
      `responsible for removing all or a portion of the Streatery platform, ` +
      `barriers and overhead structure required to give full access to the ` +
      `work area at Permit Holder's sole expense. The District will provide ` +
      `a minimum of five (5) calendar days notice to Permit Holder. In ` +
      `addition, DDOT or a public utility operator may relocate assets at ` +
      `Permit Holder's expense. If DDOT or a public utility operator ` +
      `relocates assets elsewhere in the public space, Permit Holder shall ` +
      `be responsible for removing them within 24 hours of relocation. ` +
      `Failure to remove assets shall result in public space fines and ` +
      `penalties.`,
    ``,
    `14. If DDOT or public utility operator authorizes or performs ` +
      `emergency work in the street that requires the removal of the ` +
      `Streatery, the Permit Holder shall be responsible for immediately ` +
      `removing all or a portion of the Streatery platform, barriers, and ` +
      `overhead structure required to give full access to the work area at ` +
      `Permit Holder's sole expense upon notice by the District. In the ` +
      `event that an emergency requires removal of the Streatery before ` +
      `the Permit Holder can arrive on site, DDOT or the public utility ` +
      `operator may, at their sole discretion, remove, or cause the ` +
      `removal of, the Streatery to gain access to the work area and the ` +
      `Permit Holder shall hold DDOT harmless for any damage caused to the ` +
      `Streatery assets. If DDOT or a public utility operator relocates ` +
      `assets elsewhere in the public space, Permit Holder shall be ` +
      `responsible for removing them within 24 hours of relocation. ` +
      `Failure to remove assets shall result in public space fines and ` +
      `penalties.`,
    ``,
    `15. In the event DDOT or the public utility operator removes or ` +
      `causes removal of the Streatery due to the Permit Holder's failure ` +
      `to do so under paragraphs 13 and 14 of this agreement, Permit ` +
      `Holders shall be responsible and liable for all reasonable costs ` +
      `incurred by DDOT or the public utility operators to remove or cause ` +
      `removal of the Streatery, and the Permit Holder's shall, upon ` +
      `receipt of an invoice from DDOT or public utility operators, pay ` +
      `such invoice within ten (10) business days without setoff or ` +
      `reduction. Nothing in this paragraph shall create an affirmative ` +
      `obligation of a Public Utility to remove or cause the removal of a ` +
      `Streatery.`,
    ``,
    `16. The permit holder shall affix two (2) signs to the streatery ` +
      `that indicate the business name, seating hours, seating capacity, ` +
      `and emergency contact information.`,
    ``,
    `17. Permit Holder shall mark the location of all Utility Covers that ` +
      `are covered by a platform by (i) painting a marking on the platform ` +
      `at the approximate location where it covers a Utility Cover; (ii) ` +
      `painting a marking on the street side of the platform or barrier in ` +
      `the approximate location of the Utility Cover, in the same color as ` +
      `the corresponding APWA color code; and (iii) coordinating the ` +
      `markings with Miss Utility.`,
    ``,
    `### Article V. Indemnification and Insurance`,
    ``,
    `18. Permit Holder is responsible, in accordance with applicable law, ` +
      `for the negligent or willful acts or omissions of its employees, ` +
      `agents and assigns that cause injuries to persons or property ` +
      `during the maintenance of the Streatery, including any claims ` +
      `arising from such injuries or damages, caused by, or arising from ` +
      `the negligent or willful acts or omissions of Permit Holder or its ` +
      `employees.`,
    ``,
    `19. Permit Holder shall indemnify and save harmless the District and ` +
      `all of its officers, agents, and servants against any and all ` +
      `claims or liability from whatever source whatsoever, arising from, ` +
      `based on or, as a result of any act, omission, or default of ` +
      `willful or gross negligence of the Permit Holder in designing, ` +
      `constructing, installing maintaining, or repairing said Streatery.`,
    ``,
    `20. At all times during the term of this Permit, Permit Holder shall ` +
      `maintain the insurance coverage specified in the permit.`,
    ``,
    `### Article VI. Termination`,
    ``,
    `21. DDOT shall have the right, after reasonable prior written notice ` +
      `to Permit Holder, to terminate this Permit at any time. Upon ` +
      `termination, the Permit Holder is responsible for removing the ` +
      `Streatery and restoring the site to District standards.`,
    ``,
    `---`,
    ``,
    `The Permit Holder of Permit Tracking No. **PA________** agrees to the ` +
      `above Terms and Conditions.`,
    ``,
    `___________________________________  `,
    `**[Permittee Name]**`,
    ``,
    `___________________________________  `,
    `**[Permittee Signature]**`,
    ``,
    `Date: ___________________________`,
  ].join("\n");
}

function pointOfContactSection(result: PrescreenResult): string {
  return [
    `---`,
    ``,
    `# Point of Contact Information *(template)*`,
    ``,
    `> Per Guidelines §5.2 item 13: provide a PDF with name, title, email, ` +
      `and phone number of the point of contact for the streatery in the ` +
      `event of emergency or non-emergency access requests.`,
    ``,
    `Replace the bracketed fields below.`,
    ``,
    `---`,
    ``,
    `## Streatery Point of Contact`,
    ``,
    `**Streatery location**: ${result.geocoded.mar.fullAddress}  `,
    `**Business name**: **[business name]**  `,
    `**Permit Tracking No.**: PA________`,
    ``,
    `### Primary contact`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Name | **[full name]** |`,
    `| Title | **[title or role]** |`,
    `| Email | **[email]** |`,
    `| Phone | **[direct phone number, reachable 24/7]** |`,
    ``,
    `### Secondary contact *(optional but recommended)*`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Name | **[full name]** |`,
    `| Title | **[title or role]** |`,
    `| Email | **[email]** |`,
    `| Phone | **[direct phone number]** |`,
    ``,
    `*This contact will be called by DDOT, FEMS, or public utility ` +
      `operators when access to the streatery footprint is required for ` +
      `emergency or non-emergency work (see Terms and Conditions ` +
      `Articles 13-15). Notify the agencies of any changes within 7 days.*`,
  ].join("\n");
}

function onSiteSignSection(): string {
  return [
    `---`,
    ``,
    `# On-site Streatery Sign *(template — Appendix 1)*`,
    ``,
    `> Per Guidelines §4.7 and Appendix 1: provide **two 5.5" (l) × 8.5" ` +
      `(w)** signs displayed on the streatery edges facing the sidewalk, ` +
      `visible to pedestrians at all hours. **No other signage, logos, ` +
      `advertising, or branding** is permitted on the streatery.`,
    ``,
    `Print and laminate two copies of the layout below.`,
    ``,
    `---`,
    ``,
    `\`\`\``,
    `+--------------------------------------------------+`,
    `|                                                  |`,
    `|              [BUSINESS NAME]                     |`,
    `|                                                  |`,
    `|  Seating hours:  [e.g. 11am - 10pm daily]        |`,
    `|                                                  |`,
    `|  Seating capacity: [e.g. 16 seats]               |`,
    `|                                                  |`,
    `|  Emergency contact: [name + phone]               |`,
    `|                                                  |`,
    `+--------------------------------------------------+`,
    `\`\`\``,
    ``,
    `Sign dimensions: **5.5" tall × 8.5" wide** (landscape orientation).  `,
    `Quantity: **two** (one on each sidewalk-facing edge of the streatery).`,
  ].join("\n");
}

// ============================================================================
// FOOTER + APPENDIX
// ============================================================================

function provenanceSection(result: PrescreenResult): string {
  return [
    `---`,
    ``,
    `## Data provenance`,
    ``,
    `Data sourced from DC Open Data services (citizenatlas.dc.gov MAR ` +
      `Geocoder, maps2.dcgis.dc.gov ArcGIS REST APIs). DC datasets are ` +
      `point-in-time snapshots; conditions on the ground may have changed ` +
      `since these layers were last updated.`,
    ``,
    `Pre-screen run timestamp: ${result.fetchedAt}`,
  ].join("\n");
}

function jsonAppendixSection(result: PrescreenResult): string {
  return [
    `## Appendix: full structured result`,
    ``,
    `The complete pre-screen output as JSON. Same data the web UI ` +
      `consumes; downstream tools can parse this block directly.`,
    ``,
    "```json",
    JSON.stringify(result, null, 2),
    "```",
  ].join("\n");
}

// ============================================================================
// FILENAME HELPERS
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isoDateSlug(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
