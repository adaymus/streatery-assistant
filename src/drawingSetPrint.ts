/**
 * Drawing set — PDF export via printable HTML view.
 *
 * Same "render then print" pattern as the submission package
 * (submissionPackagePrint.ts), applied to the 11-sheet drawing set the
 * CLI produces with `npm run drawings -- "<addr>" --pdf`:
 *
 *   1. Run the design pipeline (site context → parametric inputs →
 *      layout) on the already-fetched PrescreenResult
 *   2. Render every sheet in SHEET_INDEX to SVG and fit each onto a
 *      tabloid (11×17) page at a standard architect's scale
 *   3. Inline the SVGs into a print-styled HTML document, one sheet
 *      per page (@page size matches the sheet's physical size)
 *   4. Open in a new tab, auto-trigger window.print()
 *   5. User picks "Save as PDF" — output stays vector, so dimension
 *      text is crisp and the file is small
 *
 * Why not the CLI's rsvg-convert path? That's a native binary — it
 * can't run in the browser or on Cloudflare Pages. The browser's print
 * engine is the only zero-infrastructure way to bind SVGs into a PDF
 * client-side, and it's the pattern this app already uses.
 *
 * Tabloid (not ARCH D) because browser print dialogs offer 11×17 as a
 * stock paper size; ARCH D would force a non-technical operator to
 * configure a custom size. The architect's full-size ARCH D set still
 * comes from the CLI.
 *
 * Timing difference vs the submission package: the design pipeline
 * awaits network fetches (curb reference, building footprint, vicinity
 * streets), but popup blockers only allow window.open during the click
 * event itself. So we open the tab synchronously with a placeholder,
 * then write the real document into it once the sheets are rendered.
 */

import type { PrescreenResult } from "./prescreen.js";
import { extractSiteContext } from "./design/siteContext.js";
import { extractInputs } from "./design/extractInputs.js";
import { layoutStreatery } from "./design/layout.js";
import { SHEET_INDEX } from "./design/sheetIndex.js";
import { VIEWS } from "./design/views.js";
import { fitSheetToPage, PAGE_SIZES } from "./design/page.js";

/** The page every sheet is fitted to. Matches PAGE_SIZES.tabloid. */
const PAGE_ID = "tabloid" as const;

/**
 * Generate the drawing set and open it as a printable view in a new
 * tab, auto-triggering the print dialog. Falls back to downloading the
 * HTML file when a popup blocker eats the tab.
 *
 * Throws if the result has nothing to draw (extractInputs rejects
 * INELIGIBLE results) or a network fetch fails — callers should catch
 * and surface the message.
 */
export async function openPrintableDrawingSet(
  result: PrescreenResult,
): Promise<void> {
  // Open the tab BEFORE any await — popup blockers only trust
  // window.open calls made synchronously inside the user's click.
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(PLACEHOLDER_HTML);
    printWindow.document.close();
  }

  let fullHtml: string;
  let title: string;
  try {
    ({ html: fullHtml, title } = await buildDrawingSetHtml(result));
  } catch (err) {
    // Don't leave an orphaned "generating..." tab behind on failure.
    printWindow?.close();
    throw err;
  }

  if (!printWindow) {
    downloadAsHtml(fullHtml, `${title}.html`);
    return;
  }

  // Replace the placeholder document wholesale. The written document
  // carries its own auto-print script (see wrapInPrintableDocument),
  // which is more reliable than listening for 'load' from out here on
  // a window that already fired it once for the placeholder.
  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
}

/**
 * Run the design pipeline and assemble the printable document.
 * Exported separately from the window plumbing so it's testable
 * without a DOM.
 */
export async function buildDrawingSetHtml(
  result: PrescreenResult,
): Promise<{ html: string; title: string }> {
  // Site context first: it measures how far the blockface line sits
  // from the real curb, and that correction feeds extractInputs' curb-
  // relative tree/crosswalk filters before the layout is solved. (Same
  // order as the CLI — see scripts/drawings.ts.)
  const siteContext = await extractSiteContext(result);
  const inputs = extractInputs(result, {}, {
    curbOffsetFt: siteContext.curbReference.offsetFt,
  });
  const design = layoutStreatery(inputs);

  const sheets = SHEET_INDEX.map((sheet) => {
    const render = VIEWS[sheet.view];
    if (!render) {
      throw new Error(
        `Sheet index names view "${sheet.view}" but the registry has no renderer for it.`,
      );
    }
    return {
      number: sheet.number,
      title: sheet.title,
      svg: fitSheetToPage(render(design, siteContext), PAGE_ID),
    };
  });

  const addressSlug = slugify(result.geocoded.mar.fullAddress);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const title = `streatery-drawing-set-${addressSlug}-${dateSlug}`;

  return { html: wrapInPrintableDocument(sheets, title), title };
}

/**
 * Fallback when the popup is blocked: download the HTML as a file so
 * the user can open it themselves and print from there. (The file
 * auto-triggers its own print dialog on open.)
 */
function downloadAsHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "3110 MOUNT PLEASANT STREET NW" → "3110-mount-pleasant-street-nw" */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** What the user sees in the new tab while the sheets render (~2s). */
const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Generating drawing set…</title></head>
<body style="font-family: system-ui, sans-serif; color: #44403c; display: grid; place-items: center; min-height: 80vh;">
  <p>Generating drawing sheets — fetching site data from DC Open Data…</p>
</body>
</html>`;

/**
 * Wrap the fitted sheet SVGs in a complete printable document. Each
 * sheet is one print page; the @page size matches the sheet's physical
 * 17×11 size so the browser doesn't rescale anything — dimension
 * strings stay honest against an architect's scale ruler.
 */
function wrapInPrintableDocument(
  sheets: Array<{ number: string; title: string; svg: string }>,
  title: string,
): string {
  const page = PAGE_SIZES[PAGE_ID];

  const sheetSections = sheets
    .map(
      (s) =>
        `<section class="sheet" aria-label="${escapeHtml(`${s.number} — ${s.title}`)}">\n${s.svg}\n</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
body {
  margin: 0;
  padding: 24px 0;
  background: #f5f5f4;
}

/* Screen preview: sheets scale to the viewport, stacked with shadows
   so the tab reads as "here is your document" while the print dialog
   is up. The SVGs carry physical width/height attributes (17in/11in);
   CSS overrides them for the screen view only. */
.sheet {
  width: min(94vw, 1280px);
  margin: 0 auto 24px;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.sheet svg {
  display: block;
  width: 100%;
  height: auto;
}

@media print {
  body {
    padding: 0;
    background: white;
  }

  /* Page size = sheet size, zero margin: the fitted SVG already
     carries its own ${page.marginIn}" internal margins and border, so
     the browser shouldn't add more (which would shrink the scale). */
  @page {
    size: ${page.widthIn}in ${page.heightIn}in;
    margin: 0;
  }

  .sheet {
    width: auto;
    margin: 0;
    box-shadow: none;
    page-break-after: always;
    page-break-inside: avoid;
  }

  .sheet:last-child {
    page-break-after: auto;
  }

  /* Restore true physical size for print. */
  .sheet svg {
    width: ${page.widthIn}in;
    height: ${page.heightIn}in;
  }
}
  </style>
</head>
<body>
${sheetSections}
<script>
  // Browser print dialog uses document.title as the default filename.
  document.title = ${JSON.stringify(title)};
  // Auto-open the print dialog once layout settles. The script lives
  // INSIDE the document (rather than the opener calling print()) so it
  // also works when this file is downloaded and opened directly — the
  // popup-blocked fallback path.
  window.addEventListener("load", function () {
    setTimeout(function () { window.print(); }, 250);
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
