/**
 * CLI entry point: generate a parametric Site Plan SVG strawman for an
 * address and write it to stdout (or `> file.svg` to save).
 *
 * Usage: npm run site-plan -- "3110 Mount Pleasant Street NW" > out.svg
 */

import { prescreenAddress } from "../src/prescreen.js";
import { buildSitePlanMockupSvg } from "../src/sitePlanMockup.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/sitePlanMockup.ts "<address>" > out.svg');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  const result = await prescreenAddress(address);
  const svg = buildSitePlanMockupSvg(result);
  console.log(svg);
}

main().catch((err) => {
  console.error("\nSite plan generation failed:");
  console.error(err);
  process.exit(1);
});
