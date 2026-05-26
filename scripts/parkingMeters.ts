/**
 * CLI entry point for the parking meters fetcher.
 *
 * Usage: npx tsx scripts/parkingMeters.ts "3110 Mount Pleasant Street NW"
 */

import { geocodeAddress } from "../src/geocode.js";
import { fetchMetersOnBlockface } from "../src/parkingMeters.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/parkingMeters.ts "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  console.log(`\n=== Parking meters on the blockface for "${address}" ===\n`);

  const geo = await geocodeAddress(address);
  console.log(
    `Address: #${geo.mar.streetNumber} on the ${geo.side} side of ${geo.block.blockName}`,
  );
  console.log(
    `Route ${geo.addressPoint.routeId}, measure ${geo.block.fromMeasure} - ${geo.block.toMeasure}`,
  );

  const meters = await fetchMetersOnBlockface(
    geo.addressPoint.routeId,
    geo.side,
    geo.block.fromMeasure,
    geo.block.toMeasure,
  );

  // Roll up total spaces — useful for "how much parking is this streatery
  // displacing?" context in the UI later.
  const totalSpaces = meters.reduce(
    (sum, m) => sum + (typeof m.metadata.spaces === "number" ? m.metadata.spaces : 0),
    0,
  );

  console.log(
    `\nFound ${meters.length} meter(s) governing ~${totalSpaces} parking space(s):\n`,
  );
  for (const meter of meters) {
    console.log(`  ${meter.metadata.address}`);
    console.log(
      `    METERID ${meter.metadata.meterId}  (type: ${meter.metadata.type}, ${meter.metadata.spaces} spaces)`,
    );
    console.log(
      `    at ${meter.location.latitude}, ${meter.location.longitude} (measure ${meter.metadata.measure})`,
    );
  }

  if (meters.length === 0) {
    console.log("  (none)");
  }
  console.log();
}

main().catch((err) => {
  console.error("\nFailed:");
  console.error(err);
  process.exit(1);
});
