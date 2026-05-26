/**
 * Submission package — PDF export via printable HTML view.
 *
 * The "render then print" pattern is the right v1.5 PDF approach:
 *   - native browser PDF engine = excellent quality, real text
 *   - no server roundtrip, no Puppeteer infra
 *   - tiny code surface, no specialized PDF library
 *
 * Flow:
 *   1. Build the Markdown package (existing buildSubmissionPackage,
 *      with the JSON appendix omitted — pointless on paper)
 *   2. Convert Markdown to HTML via marked
 *   3. Wrap in a self-contained styled HTML document
 *   4. Open in a new browser tab, auto-trigger window.print()
 *   5. User picks "Save as PDF" in the print dialog (default on macOS,
 *      one click away on Chrome/Edge/Firefox)
 *
 * The print stylesheet adds proper page breaks (H1 starts a new page),
 * letter-sized pages, and readable typography.
 *
 * Both `marked` and this module are loaded lazily (see ResultPanel),
 * so users who never request a PDF don't pay the bundle cost.
 */

import { Marked } from "marked";
import { buildSubmissionPackage } from "./submissionPackage.js";
import type { PrescreenResult } from "./prescreen.js";

/**
 * Render the package as a printable HTML view, open it in a new tab,
 * and auto-trigger the print dialog. The user picks "Save as PDF" to
 * complete the export.
 */
export function openPrintableSubmissionPackage(
  result: PrescreenResult,
): void {
  const { filename, content } = buildSubmissionPackage(result, {
    includeJsonAppendix: false,
  });

  const marked = new Marked({
    gfm: true, // GitHub-flavored Markdown — needed for tables
    breaks: false,
  });
  const bodyHtml = marked.parse(content) as string;

  // The browser uses document.title as the default PDF filename in the
  // print dialog. Strip the .md extension since this is PDF-bound.
  const pdfTitle = filename.replace(/\.md$/, "");
  const fullHtml = wrapInPrintableDocument(bodyHtml, pdfTitle);

  // Open a blank tab first so we can write into it. window.open returns
  // null when a popup blocker fires — handle that with a fallback that
  // downloads the HTML file instead of opening it.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    downloadAsHtml(fullHtml, `${pdfTitle}.html`);
    return;
  }

  printWindow.document.write(fullHtml);
  printWindow.document.close();

  // Wait for layout + fonts before triggering print. Firefox is more
  // permissive but Safari/Chrome can mis-paginate if print() fires too
  // early. 250ms is comfortably past the typical browser paint cycle.
  printWindow.addEventListener("load", () => {
    setTimeout(() => printWindow.print(), 250);
  });
}

/**
 * Fallback when the popup is blocked: download the HTML as a file so
 * the user can open it themselves and print from there.
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

/**
 * Wrap the body HTML in a complete styled document. Inline styles
 * (rather than linked stylesheet) keep this self-contained — the new
 * window has no access to our app's CSS bundle.
 */
function wrapInPrintableDocument(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <main>${bodyHtml}</main>
  <script>
    // Browser print dialog uses document.title as the default filename.
    // Set it explicitly here in case the head's <title> hasn't latched.
    document.title = ${JSON.stringify(title)};
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

/**
 * Self-contained CSS — covers both screen view (the new tab while the
 * user is in the print dialog) and the actual print output.
 *
 * Print rules:
 *   - Letter-sized pages, 0.75" margins (US convention)
 *   - Every <h1> starts a new page (each "document" in the package
 *     becomes its own section in the PDF)
 *   - First <h1> doesn't (avoids a blank first page)
 *   - Tables don't break across pages mid-row
 *   - Page numbers in the bottom-right corner
 */
const PRINT_STYLES = `
:root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
               "Helvetica Neue", Arial, sans-serif;
  color: #1c1917;
  line-height: 1.55;
}

body {
  margin: 0;
  padding: 0;
  background: #f5f5f4;
}

main {
  max-width: 7in;
  margin: 24px auto;
  padding: 0.75in;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  font-size: 11pt;
}

h1, h2, h3, h4 {
  font-weight: 700;
  line-height: 1.25;
  margin-top: 1.4em;
  margin-bottom: 0.5em;
  page-break-after: avoid;
}

h1 {
  font-size: 22pt;
  border-bottom: 2px solid #1c1917;
  padding-bottom: 6pt;
  margin-top: 0.6em;
}

h2 {
  font-size: 14pt;
  color: #1c1917;
}

h3 {
  font-size: 12pt;
  color: #44403c;
}

h4 {
  font-size: 11pt;
  color: #57534e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

p, ul, ol {
  margin: 0.6em 0;
}

ul, ol {
  padding-left: 1.4em;
}

li {
  margin-bottom: 0.2em;
}

/* Tables: clean borders, alternating row tint for readability */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
  font-size: 10pt;
  page-break-inside: auto;
}

th, td {
  border: 1px solid #d6d3d1;
  padding: 6pt 8pt;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f5f5f4;
  font-weight: 600;
}

tbody tr:nth-child(even) td {
  background: #fafaf9;
}

tr {
  page-break-inside: avoid;
}

/* Code / monospace */
code {
  font-family: ui-monospace, SFMono-Regular, "Menlo", monospace;
  font-size: 0.92em;
  background: #f5f5f4;
  padding: 1pt 4pt;
  border-radius: 3pt;
}

pre {
  background: #f5f5f4;
  border: 1px solid #e7e5e4;
  border-radius: 4pt;
  padding: 10pt 12pt;
  overflow-x: auto;
  font-size: 9.5pt;
  line-height: 1.4;
  page-break-inside: auto;
}

pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* Blockquotes — used for the placeholder callouts */
blockquote {
  border-left: 3pt solid #a8a29e;
  background: #fafaf9;
  margin: 0.8em 0;
  padding: 8pt 14pt;
  color: #44403c;
  page-break-inside: avoid;
}

blockquote p {
  margin: 0.3em 0;
}

/* Horizontal rules — subtle */
hr {
  border: none;
  border-top: 1px solid #d6d3d1;
  margin: 1.6em 0;
}

strong {
  font-weight: 700;
}

a {
  color: #1c1917;
  text-decoration: underline;
}

/* --------- PRINT ONLY --------- */
@media print {
  body {
    background: white;
  }

  main {
    margin: 0;
    padding: 0;
    box-shadow: none;
    max-width: none;
    font-size: 10.5pt;
  }

  @page {
    size: letter;
    margin: 0.75in;
    /* Footer page numbers via @page rule. Supported in Chrome/Safari/Edge.
       Firefox ignores @bottom-right; users still get default print headers. */
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 9pt;
      color: #78716c;
    }
  }

  /* Each H1 starts a new page — the package is structured so each H1
     marks a logically separable document (Letter of Support, T&C,
     etc.). Avoid the new page on the very first heading though. */
  h1 {
    page-break-before: always;
  }

  main > h1:first-child,
  main > :first-child {
    page-break-before: avoid;
  }

  /* Avoid orphaned headings at page bottoms */
  h2, h3, h4 {
    page-break-after: avoid;
  }

  /* Hide elements not useful in print (none right now, but reserved
     here for future "screen only" tweaks). */
  .no-print {
    display: none !important;
  }
}
`;
