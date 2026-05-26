/**
 * CLI entry point for the full pre-screener.
 *
 * Usage: npm run prescreen -- "3110 Mount Pleasant Street NW"
 *
 * Prints a structured summary of everything we know about the address:
 * the geocoding result, all curbside features, early-out disqualifiers,
 * and the mandatory site walk caveat list.
 */

import { prescreenAddress, type PrescreenResult } from "../src/prescreen.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run prescreen -- "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  PRE-SCREEN: ${address}`);
  console.log(`${"=".repeat(72)}\n`);

  const result = await prescreenAddress(address);
  const elapsedMs = Date.now() - startTime;
  const { geocoded, curbFeatures, earlyDisqualifiers, siteWalkCaveats } = result;

  // --- Location header ---
  console.log("LOCATION");
  console.log(`  ${geocoded.mar.fullAddress}`);
  console.log(
    `  ${geocoded.mar.latitude}, ${geocoded.mar.longitude} (MAR confidence ${geocoded.mar.confidenceScore}/100)`,
  );
  console.log(`  ${geocoded.block.blockName}`);
  console.log(
    `  Bounded by ${geocoded.block.fromStreet} <-> ${geocoded.block.toStreet}`,
  );
  console.log(
    `  Side: ${geocoded.side} (building #${geocoded.mar.streetNumber})`,
  );
  console.log(
    `  Ward ${geocoded.block.wardId ?? "?"}, ANC ${geocoded.block.ancId ?? "?"}`,
  );

  // --- Street attributes ---
  console.log("\nSTREET ATTRIBUTES");
  console.log(`  Speed limit:       ${geocoded.block.speedLimitMph ?? "?"} mph`);
  console.log(
    `  Functional class:  FHWA ${geocoded.block.functionalClassFhwa ?? "?"}, DC ${geocoded.block.functionalClassDc ?? "?"}`,
  );
  console.log(
    `  Parking lane:      ${geocoded.block.parkingLaneWidthPerSideFt ?? "?"} ft per side`,
  );
  console.log(`  Bus lane:          ${geocoded.block.hasBusLane ? "YES" : "no"}`);

  // --- Early disqualifiers ---
  console.log("\nEARLY DISQUALIFIERS");
  if (earlyDisqualifiers.length === 0) {
    console.log("  None — proceed to envelope sizing.");
  } else {
    for (const dq of earlyDisqualifiers) {
      console.log(`  [DISQUALIFIED] ${dq.rule}`);
      console.log(`    ${dq.detail}`);
    }
  }

  // --- Verdict + envelope ---
  if (result.eligibility) {
    const e = result.eligibility;
    console.log("\nVERDICT");
    console.log(`  ${e.verdict}`);

    if (e.hardDisqualifiers.length > 0) {
      console.log("\n  Hard disqualifiers:");
      for (const hd of e.hardDisqualifiers) {
        console.log(`    - ${hd}`);
      }
    }

    console.log("\nBUILDABLE ENVELOPE");
    console.log(
      `  Length:    ${e.envelope.lengthFt.toFixed(1)} ft (~${e.envelope.approximateParkingSpaces} parking space${e.envelope.approximateParkingSpaces === 1 ? "" : "s"})`,
    );
    console.log(`  Width:     ${e.envelope.widthFt.toFixed(0)} ft (full parking lane)`);
    console.log(`  Template:  ${e.envelope.recommendedTemplate}`);
    console.log(
      `  Position:  ${e.envelope.startAlongBlockfaceFt.toFixed(1)} - ${e.envelope.endAlongBlockfaceFt.toFixed(1)} ft along blockface`,
    );

    if (e.bindingConstraints.length > 0) {
      console.log("\nBINDING CONSTRAINTS (what's limiting the envelope)");
      for (const c of e.bindingConstraints) {
        console.log(
          `  - ${c.description}: ${c.bufferFt} ft buffer, limits ${c.limits}`,
        );
      }
    }

    if (e.extensionOpportunity.couldHelp) {
      console.log("\nEXTENSION OPPORTUNITY");
      console.log(
        `  With neighbor consent, extending the frontage to ${e.extensionOpportunity.extendedFrontageFt} ft`,
      );
      console.log(
        `  would yield a ${e.extensionOpportunity.extendedEnvelopeLengthFt.toFixed(1)} ft envelope (vs ${e.envelope.lengthFt.toFixed(1)} ft alone).`,
      );
    }
  }

  // --- Curb features summary ---
  console.log("\nCURB FEATURES (this blockface)");
  const counts = [
    ["Parking meters (this side)", curbFeatures.parkingMeters.length],
    ["Fire hydrants (this side)", curbFeatures.fireHydrants.length],
    ["Bus stops (this block)", curbFeatures.busStops.length],
    ["Bicycle lanes (this block)", curbFeatures.bicycleLanes.length],
  ] as const;
  for (const [label, count] of counts) {
    console.log(`  ${label.padEnd(34)} ${count}`);
  }

  console.log("\nCURB FEATURES (within 150-200 ft, both sides)");
  const spatialCounts = [
    ["Loading zones", curbFeatures.loadingZones.length],
    ["Street trees", curbFeatures.streetTrees.length],
    ["ADA curb ramps", curbFeatures.adaCurbRamps.length],
    ["Driveway curb cuts", curbFeatures.driveways.length],
    ["Crosswalks", curbFeatures.crosswalks.length],
  ] as const;
  for (const [label, count] of spatialCounts) {
    console.log(`  ${label.padEnd(34)} ${count}`);
  }

  // --- Bike lane special handling: surface the disqualifier-relevant flag ---
  const adjacentBikeLanes = curbFeatures.bicycleLanes.filter(
    (b) => b.metadata.adjacentToParkingLane === true,
  );
  if (adjacentBikeLanes.length > 0) {
    console.log("\n  WARNING: bike lane is adjacent to the parking lane on this block.");
    console.log("  A streatery here would block the bike lane (disqualifier per DDOT).");
  }

  // --- Mandatory site walk caveats ---
  console.log("\nSITE WALK CAVEATS (always required, never skip)");
  for (const caveat of siteWalkCaveats) {
    console.log(`  - ${caveat}`);
  }

  // --- Footer ---
  console.log(
    `\nFetched ${countAll(curbFeatures)} features in ${elapsedMs} ms at ${result.fetchedAt}\n`,
  );
}

function countAll(curbFeatures: PrescreenResult["curbFeatures"]): number {
  return Object.values(curbFeatures).reduce(
    (sum, list) => sum + (list as unknown[]).length,
    0,
  );
}

main().catch((err) => {
  console.error("\nPre-screen failed:");
  console.error(err);
  process.exit(1);
});
