/**
 * CLI entry point that generates a Markdown briefing for an address and
 * prints it to stdout (or `> file.md` to save).
 *
 * Usage: npx tsx scripts/briefing.ts "3110 Mount Pleasant Street NW"
 *   or:  npx tsx scripts/briefing.ts "3155 Mt Pleasant St NW" > out.md
 */

import { prescreenAddress } from "../src/prescreen.js";
import { buildBriefing } from "../src/submissionPackage.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/briefing.ts "<address>"');
  process.exit(1);
}
const address = args.join(" ");

async function main(): Promise<void> {
  const result = await prescreenAddress(address);
  const { filename, content } = buildBriefing(result);
  // The filename is useful as a header in stdout-mode so the user knows
  // what to call the file if they're copy-pasting.
  console.error(`# File: ${filename}\n`);
  console.log(content);
}

main().catch((err) => {
  console.error("\nBriefing failed:");
  console.error(err);
  process.exit(1);
});
