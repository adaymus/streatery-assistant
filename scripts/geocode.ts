/**
 * CLI entry point for the geocoding pipeline.
 *
 * Usage: npm run geocode -- "3110 Mount Pleasant Street NW"
 *
 * All the actual logic lives in src/geocode.ts so the UI and other scripts
 * can reuse it. This file just parses argv and prints a readable summary.
 */

import { geocodeAddress } from "../src/geocode.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run geocode -- "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  console.log(`\n=== Geocoding: "${address}" ===\n`);

  const result = await geocodeAddress(address);
  const { mar, addressPoint, block, side, blockface } = result;

  console.log("1. MAR Geocoder");
  console.log(`   MAR_ID:      ${mar.marId}`);
  console.log(`   Normalized:  ${mar.fullAddress}`);
  console.log(`   Lat/Lon:     ${mar.latitude}, ${mar.longitude}`);
  console.log(`   Confidence:  ${mar.confidenceScore}/100`);

  console.log("\n2. Address Points");
  console.log(`   BLOCKKEY:    ${addressPoint.blockKey}`);
  console.log(`   ROUTEID:     ${addressPoint.routeId}`);
  console.log(`   SUBBLOCKKEY: ${addressPoint.subBlockKey ?? "(none)"}`);

  console.log("\n3. Roadway Block");
  console.log(`   Block:            ${block.blockName}`);
  console.log(`   Bounded by:       ${block.fromStreet} <-> ${block.toStreet}`);
  console.log(
    `   Right side range: ${block.addressRangeRightLow}-${block.addressRangeRightHigh}`,
  );
  console.log(
    `   Left side range:  ${block.addressRangeLeftLow}-${block.addressRangeLeftHigh}`,
  );
  console.log(`   Speed limit:      ${block.speedLimitMph ?? "?"} mph`);
  console.log(
    `   Functional class: FHWA ${block.functionalClassFhwa ?? "?"}, DC ${block.functionalClassDc ?? "?"}`,
  );
  console.log(
    `   Parking lane:     ${block.parkingLaneWidthPerSideFt ?? "?"} ft per side (${block.totalParkingLanes ?? "?"} lanes total)`,
  );
  console.log(
    `   Bus lane:         ${block.hasBusLane ? "YES (disqualifier)" : "no"}`,
  );
  console.log(`   Ward / ANC:       ${block.wardId ?? "?"} / ${block.ancId ?? "?"}`);
  console.log(`   -> Building #${mar.streetNumber} is on the ${side} side`);

  console.log("\n4. Roadway Blockface");
  console.log(`   BLOCKFACEKEY: ${blockface.blockfaceKey}`);
  console.log(
    `   Geometry:     polyline with ${blockface.vertexCount} vertices (WGS84)`,
  );

  console.log("\nPipeline complete.\n");
}

main().catch((err) => {
  console.error("\nPipeline failed:");
  console.error(err);
  process.exit(1);
});
