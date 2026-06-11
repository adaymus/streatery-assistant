/**
 * CLI entry point: generate the parametric streatery drawings for an
 * address. M1 scope: the street-side elevation.
 *
 * Usage:
 *   npm run drawings -- "3110 Mount Pleasant Street NW" --out elevation.svg
 *   npm run drawings -- "3110 Mount Pleasant Street NW" --name "Martha Dear" --palette polycarbonate --out elevation.svg
 *
 * Prefer --out over piping stdout: `npm run` prints its script banner
 * to STDOUT (not stderr), so `npm run drawings -- ... > file.svg`
 * captures the banner and produces an invalid SVG. (`npm run -s` also
 * works, but --out can't be gotten wrong.) Without --out the SVG still
 * goes to stdout for piping from tsx directly.
 *
 * A layout summary goes to stderr so you can eyeball the resolved
 * dimensions without opening the drawing — that summary is also what we
 * diff against the approved reference sets for validation.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** writeFileSync that creates the target directory if needed. */
function writeOut(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

import { prescreenAddress } from "../src/prescreen.js";
import { extractInputs, type OperatorOverrides } from "../src/design/extractInputs.js";
import { layoutStreatery } from "../src/design/layout.js";
import { extractSiteContext } from "../src/design/siteContext.js";
import { formatNotesReport } from "../src/design/notes/index.js";
import {
  fitSheetToPage,
  PAGE_SIZES,
  type PageSizeId,
} from "../src/design/page.js";
import { SHEET_INDEX } from "../src/design/sheetIndex.js";
import { ftIn } from "../src/design/renderers/shared.js";
// The view registry (name → renderer) is shared with the browser print
// module (src/drawingSetPrint.ts), so it lives in src/design/views.ts.
// "all" fans out to every entry; adding a view = adding a line there.
import { VIEWS } from "../src/design/views.js";

// ---------- Tiny flag parser (address words + --flag value pairs) ----------

const argv = process.argv.slice(2);
const addressWords: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]!;
  if (arg.startsWith("--")) {
    // Boolean flags (like --notes) have no value: when the next token
    // is another flag or missing, don't consume it as this flag's value.
    const next = argv[i + 1];
    if (next != null && !next.startsWith("--")) {
      flags.set(arg.slice(2), next);
      i++;
    } else {
      flags.set(arg.slice(2), "");
    }
  } else {
    addressWords.push(arg);
  }
}
const address = addressWords.join(" ");
if (!address) {
  console.error(
    'Usage: npm run drawings -- "<address>" [--name "Business"] [--palette pvc-corrugated|polycarbonate] [--entry <ft>] [--length-cap <ft>] [--frontage <ft>] [--view street|sidewalk|end-low|end-high|section|section-entry|site-plan|cover|general-notes|life-safety|ddot-details|all] [--page arch-d|tabloid|letter] [--pdf] [--notes] [--out <file>]\n' +
      '  --pdf: render the COMPLETE set as one combined PDF in sheet-index order (requires --out <file.pdf>; pages at --page, default arch-d)',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  console.error(`Pre-screening ${address} ...`);
  // --frontage models a §4.1 consent-based extension (or reproduces an
  // approved set that used one) by overriding the frontage window the
  // envelope is confined to. Default: the building footprint's extent.
  const result = await prescreenAddress(
    address,
    flags.has("frontage")
      ? { frontageLengthFt: Number(flags.get("frontage")) }
      : {},
  );

  const overrides: OperatorOverrides = {};
  if (flags.has("name")) overrides.businessName = flags.get("name")!;
  if (flags.has("palette")) {
    overrides.roofPalette = flags.get("palette") as OperatorOverrides["roofPalette"];
  }
  if (flags.has("entry")) overrides.entryStationFt = Number(flags.get("entry"));
  if (flags.has("length-cap")) {
    overrides.structureLengthCapFt = Number(flags.get("length-cap"));
  }

  // Site context comes FIRST: it measures how far the blockface line
  // sits from the real curb (Planimetrics curb layer), and that
  // correction feeds extractInputs' curb-relative tree/crosswalk
  // filters before the layout is solved.
  const siteContext = await extractSiteContext(result);
  const inputs = extractInputs(result, overrides, {
    curbOffsetFt: siteContext.curbReference.offsetFt,
  });
  const design = layoutStreatery(inputs);

  // ---------- Layout summary (stderr) — the validation surface ----------

  // The frontage line shows where the length limit came from — extractInputs
  // already guarantees eligibility is non-null (it throws otherwise).
  const frontage = result.eligibility!.frontage;

  const summary = [
    ``,
    `═══ Layout summary — ${design.businessName} ═══`,
    `Structure:   ${ftIn(design.platform.lengthFt)} long × ${ftIn(design.platform.widthFt)} wide` +
      ` (parking lane ${ftIn(inputs.parkingLaneWidthFt)} − 2'-0" travel buffer)`,
    `Frontage:    ${ftIn(frontage.lengthFt)} (${
      frontage.source === "building_footprint"
        ? "DC Building Footprints — envelope confined to storefront width"
        : frontage.source === "operator_override"
          ? "override via --frontage — assumes §4.1 consent letters"
          : "ASSUMED — no footprint polygon; confirm storefront width"
    })`,
    `Anchor:      starts ${ftIn(design.anchor.structureStartStationFt)} along blockface of ${ftIn(design.anchor.blockfaceLengthFt)}`,
    `Barrier:     ${design.jerseyBarrier.atEnd}-station end, ${ftIn(design.jerseyBarrier.segment.startFt)}–${ftIn(design.jerseyBarrier.segment.endFt)} (${inputs.barrierType})`,
    `Posts:       ${design.posts.length} @ [${design.posts.map((p) => ftIn(p.stationFt) + (p.shifted ? "*" : "")).join(", ")}]${design.posts.some((p) => p.shifted) ? "  (* = shifted off tree)" : ""}`,
    `Roof:        ${
      design.roofSegments.length === 0
        ? "none (§4.3 exclusions)"
        : design.roofSegments
            .map((s) => `${ftIn(s.startFt)}–${ftIn(s.endFt)} (${ftIn(s.endFt - s.startFt)} run)`)
            .join(", ") +
          ` — edge ${ftIn(design.roof.edgeHeightFt)}, fascia ${ftIn(design.roof.peakHeightFt)}`
    }`,
    `Trees:       ${design.trees.length === 0 ? "none in structure" : design.trees.map((t) => `${t.commonName ?? "tree"} @ ${ftIn(t.stationFt)}`).join(", ")}`,
    `Entry:       @ ${ftIn(design.entry.stationFt)}, ${ftIn(design.entry.widthFt)} clear (sidewalk side)`,
    `Seating:     ${design.seating.capacity} seats (${design.seating.areaSf} usable SF / 15)`,
    `Notes:       ${design.notes.length}`,
    ...design.notes.map((n, i) => `  ${i + 1}. ${n}`),
    ``,
  ].join("\n");
  console.error(summary);

  // ---------- --notes: dump the evaluated note library instead of drawing ----------
  // The M4 acceptance surface, and a standalone artifact for the
  // architect conversation: every note the set would carry, with the
  // key, citation, and category that explain why it fired.

  const view = flags.get("view") ?? "street";
  const outPath = flags.get("out");

  // --page snaps every sheet onto real paper at the largest standard
  // architectural scale that fits — without it, sheets stay content-
  // sized ("auto"), which is what the web app wants. TOPS uploads
  // allow ~25 MB, so this is a presentation choice, not a size one.
  const pageId = flags.get("page") as PageSizeId | undefined;
  if (pageId != null && !(pageId in PAGE_SIZES)) {
    console.error(
      `Unknown --page "${pageId}". Valid: ${Object.keys(PAGE_SIZES).join(", ")} (omit for content-sized output)`,
    );
    process.exit(1);
  }
  const toPage = (svg: string): string =>
    pageId ? fitSheetToPage(svg, pageId) : svg;

  // ---------- --pdf: the complete set as ONE combined PDF ----------
  // What TOPS wants (confirmed 2026-06): a single file, grayscale fine,
  // ~25 MB limit. Every sheet renders, gets paged (ARCH D unless --page
  // says otherwise), and rsvg-convert binds them in SHEET_INDEX order —
  // cover first, matching the cover's own index.

  if (flags.has("pdf")) {
    if (!outPath) {
      console.error('--pdf requires --out (e.g. --out drawing-set.pdf)');
      process.exit(1);
    }
    const pdfPageId: PageSizeId = pageId ?? "arch-d";
    const tmpDir = mkdtempSync(join(tmpdir(), "streatery-sheets-"));
    try {
      const sheetPaths: string[] = [];
      for (const sheet of SHEET_INDEX) {
        const render = VIEWS[sheet.view];
        if (!render) {
          throw new Error(
            `Sheet index names view "${sheet.view}" but the registry has no renderer for it.`,
          );
        }
        const path = join(tmpDir, `${sheet.number}.svg`);
        writeFileSync(
          path,
          fitSheetToPage(render(design, siteContext), pdfPageId),
        );
        sheetPaths.push(path);
        console.error(`Rendered ${sheet.number} — ${sheet.title}`);
      }
      const result = spawnSync(
        "rsvg-convert",
        ["-f", "pdf", "-o", outPath, ...sheetPaths],
        { stdio: "inherit" },
      );
      if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "rsvg-convert not found — install librsvg (macOS: brew install librsvg) to assemble the PDF.",
        );
      }
      if (result.status !== 0) {
        throw new Error(`rsvg-convert exited with status ${result.status}.`);
      }
      console.error(
        `Wrote ${outPath} (${SHEET_INDEX.length} sheets, ${PAGE_SIZES[pdfPageId].label})`,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    return;
  }

  if (flags.has("notes")) {
    const report =
      `Applicable notes — ${design.businessName} (${design.address})\n\n` +
      formatNotesReport({ design, inputs, site: siteContext });
    if (outPath) {
      writeOut(outPath, report + "\n");
      console.error(`Wrote ${outPath}`);
    } else {
      console.log(report);
    }
    return;
  }

  if (view === "all") {
    // "all" needs file output: 6 SVGs can't share one stdout. Filenames
    // derive from --out by inserting the view name before ".svg".
    if (!outPath) {
      console.error('--view all requires --out (e.g. --out drawings/martha.svg → martha-street.svg, martha-sidewalk.svg, ...)');
      process.exit(1);
    }
    for (const [name, render] of Object.entries(VIEWS)) {
      const path = outPath.replace(/\.svg$/i, `-${name}.svg`);
      writeOut(path, toPage(render(design, siteContext)) + "\n");
      console.error(`Wrote ${path}`);
    }
    return;
  }

  const render = VIEWS[view];
  if (!render) {
    console.error(
      `Unknown --view "${view}". Valid: ${Object.keys(VIEWS).join(", ")}, all`,
    );
    process.exit(1);
  }
  const svg = toPage(render(design, siteContext));
  if (outPath) {
    writeOut(outPath, svg + "\n");
    console.error(`Wrote ${outPath}`);
  } else {
    console.log(svg);
  }
}

main().catch((err) => {
  console.error("\nDrawing generation failed:");
  console.error(err);
  process.exit(1);
});
