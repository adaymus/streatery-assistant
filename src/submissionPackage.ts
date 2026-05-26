/**
 * Submission package compiler (v1: briefing document).
 *
 * Renders a pre-screen result into a single Markdown document suitable for
 * emailing, printing, or sharing. The spec calls the eventual tool a
 * "package compiler" — generating PSC application bundles with site
 * plans, narratives, and forms. That's v2+. For v1, the high-leverage
 * win is consolidating everything we know into one shareable file:
 *
 *   - Mitra can email it to a restaurant owner: "here's what we found"
 *   - The architect can read it before doing a site walk
 *   - A downstream tool can re-ingest the embedded JSON without scraping
 *
 * Output is a `{ filename, content }` pair the UI hands to a Blob URL
 * for download.
 */

import type { PrescreenResult } from "./prescreen.js";

interface Briefing {
  filename: string;
  content: string;
}

export function buildBriefing(result: PrescreenResult): Briefing {
  const { geocoded, eligibility, curbFeatures, earlyDisqualifiers, siteWalkCaveats } =
    result;
  const fetchedDate = new Date(result.fetchedAt);

  const sections: string[] = [];

  // Heading + address
  sections.push(
    `# Streatery Pre-Screen Briefing\n\n` +
      `**${geocoded.mar.fullAddress}**\n\n` +
      `Pre-screened ${fetchedDate.toLocaleString()}.`,
  );

  // Project context (constant, so the reader knows what they're looking at)
  sections.push(
    `## About this document\n\n` +
      `This briefing summarizes whether the above address can support a ` +
      `parking-lane streatery under DC's permanent streatery program ` +
      `(DDOT, December 2024). It was generated automatically from DC ` +
      `Open Data sources by the Mt. Pleasant Streatery Pre-Screener.\n\n` +
      `**This document is advisory only.** It does not substitute for a ` +
      `site walk, an architect's review, a Professional Engineer's seal, ` +
      `or formal approval by the Public Space Committee.`,
  );

  // Verdict + envelope summary table
  sections.push(verdictSection(result));

  // Location context
  sections.push(locationSection(result));

  // Hard / early disqualifiers (if any) — these matter most
  if (earlyDisqualifiers.length > 0 || (eligibility?.hardDisqualifiers.length ?? 0) > 0) {
    sections.push(disqualifiersSection(result));
  }

  // Binding constraints (what's actually limiting the envelope)
  if (eligibility && eligibility.bindingConstraints.length > 0) {
    sections.push(bindingConstraintsSection(eligibility.bindingConstraints));
  }

  // Extension opportunity (only when meaningful)
  if (eligibility?.extensionOpportunity.couldHelp) {
    sections.push(extensionSection(eligibility));
  }

  // All curb features (as a reference table)
  sections.push(curbFeaturesSection(curbFeatures));

  // Site walk checklist
  sections.push(siteWalkSection(siteWalkCaveats));

  // Data freshness footer
  sections.push(provenanceSection(result));

  // Appendix: the full structured result for downstream machine consumers
  sections.push(
    `## Appendix: full structured result\n\n` +
      `The complete pre-screen output as JSON. This is the same data the ` +
      `web UI consumes; downstream tools can parse this block directly.\n\n` +
      "```json\n" +
      JSON.stringify(result, null, 2) +
      "\n```",
  );

  // Build filename: streatery-briefing-3110-mt-pleasant-2026-05-26.md
  const addressSlug = slugify(geocoded.mar.fullAddress);
  const dateSlug = isoDateSlug(fetchedDate);
  const filename = `streatery-briefing-${addressSlug}-${dateSlug}.md`;

  return {
    filename,
    content: sections.join("\n\n") + "\n",
  };
}

// ---------- Section builders ----------

function verdictSection(result: PrescreenResult): string {
  const { eligibility, earlyDisqualifiers } = result;
  const verdict =
    earlyDisqualifiers.length > 0
      ? "INELIGIBLE"
      : (eligibility?.verdict ?? "INELIGIBLE");

  const lines = [
    `## Verdict\n`,
    `**${verdict.replace(/_/g, " ")}**\n`,
  ];

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
      thresholdsExplanation(),
    );
  }

  return lines.join("\n");
}

function thresholdsExplanation(): string {
  return (
    `*Verdict thresholds: an envelope of 20 ft or more is **ELIGIBLE** ` +
    `(fits the 1-space template without compromise). 12 to 20 ft is ` +
    `**ELIGIBLE_WITH_CAVEATS** (viable only with a frontage extension via ` +
    `neighbor + ground-floor tenant consent, or a custom shorter design). ` +
    `Under 12 ft is **INELIGIBLE** — no realistic configuration fits.*`
  );
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
    `| Ward / ANC | Ward ${b.wardId ?? "?"} / ANC ${b.ancId ?? "?"} |`,
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
      `what's actually limiting the streatery's size.`,
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
      `ground-floor tenant**, the streatery could extend into the neighbor's ` +
      `frontage. With a ${e.extendedFrontageFt} ft combined frontage, the ` +
      `buildable envelope grows to **${e.extendedEnvelopeLengthFt.toFixed(1)} ft** ` +
      `(vs ${eligibility.envelope.lengthFt.toFixed(1)} ft on the operator's ` +
      `frontage alone).`,
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
    `These items cannot be verified from DC Open Data and must be confirmed ` +
      `on site, **even when the verdict is ELIGIBLE**.`,
    ``,
  ];
  for (const c of caveats) {
    lines.push(`- [ ] ${c}`);
  }
  return lines.join("\n");
}

function provenanceSection(result: PrescreenResult): string {
  return [
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

// ---------- Filename helpers ----------

function slugify(text: string): string {
  // Lowercase, drop quadrant clutter ("NW" → "nw"), collapse whitespace
  // and punctuation to hyphens, trim leading/trailing hyphens.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isoDateSlug(date: Date): string {
  // YYYY-MM-DD form, ignoring time-of-day. Local time so the date in the
  // filename matches what the user sees on their wall.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
