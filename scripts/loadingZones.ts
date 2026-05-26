/**
 * CLI entry point for the loading-zones fetcher.
 *
 * Usage: npx tsx scripts/loadingZones.ts "3110 Mount Pleasant Street NW"
 */

import { geocodeAddress } from "../src/geocode.js";
import { fetchLoadingZonesNear } from "../src/loadingZones.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/loadingZones.ts "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  console.log(`\n=== Loading zones near "${address}" ===\n`);

  // We need the address's lat/lon. Cheapest way: run the MAR step of the
  // geocoding pipeline. For the orchestrator script (prescreen.ts) this
  // result will be cached so subsequent fetchers reuse it.
  const geo = await geocodeAddress(address);
  console.log(
    `Address resolved to ${geo.mar.latitude}, ${geo.mar.longitude} on the ${geo.side} side`,
  );

  const loadingZones = await fetchLoadingZonesNear(
    geo.mar.latitude,
    geo.mar.longitude,
  );

  console.log(`\nFound ${loadingZones.length} unique loading zone(s) within 200 ft:\n`);
  for (const lz of loadingZones) {
    console.log(`  LZ ${lz.metadata.lzId}`);
    console.log(`    at ${lz.location.latitude}, ${lz.location.longitude}`);
    console.log(`    block: ${lz.metadata.block}, side code: ${lz.metadata.sideOfStreetCode}`);
    console.log(`    near: ${lz.metadata.nearbyAddress}`);
  }

  if (loadingZones.length === 0) {
    console.log("  (none)");
  }
  console.log();
}

main().catch((err) => {
  console.error("\nFailed:");
  console.error(err);
  process.exit(1);
});
