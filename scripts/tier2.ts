/**
 * CLI entry point for testing all Tier 2 fetchers together.
 *
 * Usage: npx tsx scripts/tier2.ts "3110 Mount Pleasant Street NW"
 */

import { geocodeAddress } from "../src/geocode.js";
import { fetchHydrantsOnBlockface } from "../src/fireHydrants.js";
import { fetchBicycleLanesOnBlock } from "../src/bicycleLanes.js";
import { fetchBusStopsOnBlock } from "../src/busStops.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/tier2.ts "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  console.log(`\n=== Tier 2 curb features for "${address}" ===\n`);

  const geo = await geocodeAddress(address);
  console.log(`Block: ${geo.block.blockName}`);
  console.log(
    `BLOCKKEY ${geo.addressPoint.blockKey.slice(0, 8)}..., BLOCKFACEKEY ${geo.blockface.blockfaceKey.slice(0, 8)}...`,
  );

  // Run all three fetchers in parallel — they're independent network calls,
  // so there's no reason to wait for one before starting the next.
  // Promise.all takes an array of promises and resolves when all complete
  // (or rejects on the first failure).
  const [hydrants, bikeLanes, busStops] = await Promise.all([
    fetchHydrantsOnBlockface(geo.blockface.blockfaceKey),
    fetchBicycleLanesOnBlock(geo.addressPoint.blockKey),
    fetchBusStopsOnBlock(geo.addressPoint.blockKey),
  ]);

  console.log(`\n--- Fire Hydrants on this blockface (${hydrants.length}) ---`);
  for (const h of hydrants) {
    console.log(
      `  ${h.metadata.assetNum} (${h.metadata.inService ? "in service" : "OUT OF SERVICE"}, ${h.metadata.bandColor ?? "?"} band, ${h.metadata.flowGpm ?? "?"} gpm)`,
    );
    console.log(
      `    at ${h.location.latitude}, ${h.location.longitude}`,
    );
    if (h.metadata.locationDetail) {
      console.log(`    detail: ${h.metadata.locationDetail}`);
    }
  }
  if (hydrants.length === 0) console.log("  (none)");

  console.log(`\n--- Bicycle Lanes on this block (${bikeLanes.length}) ---`);
  for (const b of bikeLanes) {
    const types = [
      b.metadata.isProtected && "protected",
      b.metadata.isBuffered && "buffered",
      b.metadata.isConventional && "conventional",
      b.metadata.isContraflow && "contraflow",
    ]
      .filter(Boolean)
      .join(", ") || "(unspecified)";
    console.log(`  ${b.metadata.streetName} — ${types}`);
    console.log(
      `    adjacent to parking lane: ${b.metadata.adjacentToParkingLane ? "YES (disqualifier check)" : "no"}`,
    );
    console.log(
      `    ${b.metadata.totalLanes} lane(s), ${b.metadata.totalWidthFt} ft total`,
    );
  }
  if (bikeLanes.length === 0) console.log("  (none)");

  console.log(`\n--- Metro Bus Stops on this block (${busStops.length}) ---`);
  for (const s of busStops) {
    console.log(
      `  Stop ${s.metadata.regionalId} on ${s.metadata.onStreet} at ${s.metadata.atStreet}`,
    );
    console.log(`    at ${s.location.latitude}, ${s.location.longitude}`);
    if (s.metadata.description) {
      console.log(`    ${s.metadata.description}`);
    }
  }
  if (busStops.length === 0) console.log("  (none)");

  console.log();
}

main().catch((err) => {
  console.error("\nFailed:");
  console.error(err);
  process.exit(1);
});
