/**
 * CLI entry point for testing all Tier 4 (bbox spatial) fetchers together.
 *
 * Usage: npx tsx scripts/tier4.ts "3110 Mount Pleasant Street NW"
 */

import { geocodeAddress } from "../src/geocode.js";
import { fetchStreetTreesNear } from "../src/streetTrees.js";
import { fetchAdaCurbRampsNear } from "../src/adaCurbRamps.js";
import { fetchDrivewaysNear } from "../src/driveways.js";
import { fetchCrosswalksNear } from "../src/crosswalks.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/tier4.ts "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  console.log(`\n=== Tier 4 (bbox spatial) curb features for "${address}" ===\n`);

  const geo = await geocodeAddress(address);
  console.log(
    `Resolved to ${geo.mar.latitude}, ${geo.mar.longitude} (${geo.block.blockName})`,
  );

  // All four fetchers run in parallel — independent network calls.
  const [trees, ramps, driveways, crosswalks] = await Promise.all([
    fetchStreetTreesNear(geo.mar.latitude, geo.mar.longitude),
    fetchAdaCurbRampsNear(geo.mar.latitude, geo.mar.longitude),
    fetchDrivewaysNear(geo.mar.latitude, geo.mar.longitude),
    fetchCrosswalksNear(geo.mar.latitude, geo.mar.longitude),
  ]);

  console.log(`\n--- Street Trees (${trees.length} within 150 ft) ---`);
  for (const t of trees) {
    const dbh = t.metadata.dbhInches ? `${t.metadata.dbhInches}" DBH` : "size unknown";
    console.log(`  ${t.metadata.commonName ?? t.metadata.scientificName ?? "?"} (${dbh})`);
    console.log(
      `    at ${t.location.latitude}, ${t.location.longitude} — tree box ${t.metadata.treeBoxLengthFt ?? "?"} x ${t.metadata.treeBoxWidthFt ?? "?"} ft`,
    );
  }
  if (trees.length === 0) console.log("  (none)");

  console.log(`\n--- ADA Curb Ramps (${ramps.length} within 150 ft) ---`);
  for (const r of ramps) {
    console.log(
      `  ${r.metadata.gisId} — ${r.metadata.condition ?? "?"} (inspected ${r.metadata.yearInspected ?? "?"})`,
    );
    console.log(`    at ${r.location.latitude}, ${r.location.longitude}`);
  }
  if (ramps.length === 0) console.log("  (none)");

  console.log(`\n--- Driveway Curb Cuts (${driveways.length} within 200 ft) ---`);
  for (const d of driveways) {
    console.log(
      `  ${d.metadata.gisId} — ${d.metadata.condition ?? "?"} (inspected ${d.metadata.yearInspected ?? "?"})`,
    );
    console.log(`    at ${d.location.latitude}, ${d.location.longitude}`);
  }
  if (driveways.length === 0) console.log("  (none)");

  console.log(`\n--- Crosswalks (${crosswalks.length} within 150 ft) ---`);
  for (const c of crosswalks) {
    console.log(
      `  ${c.metadata.detail} crosswalk #${c.metadata.markingId} (condition ${c.metadata.condition})`,
    );
    console.log(`    at ${c.location.latitude}, ${c.location.longitude}`);
  }
  if (crosswalks.length === 0) console.log("  (none)");

  console.log();
}

main().catch((err) => {
  console.error("\nFailed:");
  console.error(err);
  process.exit(1);
});
