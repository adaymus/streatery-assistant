#!/usr/bin/env bash
#
# Extract the DDOT standard figures from the Streatery Guidelines PDF
# into src/design/assets/guidelineFigures.ts as base64 PNG data URIs.
#
# These are DDOT's OWN drawings (Appendix 3 reflector details are signed
# by the chief engineer) — the A4.00 details sheet embeds them
# near-verbatim instead of redrawing, exactly what the approved Queen's
# English set did on its A2.01.
#
# Re-run when the guidelines PDF is revised:
#   bash scripts/extract-guideline-assets.sh
#
# Requires poppler (pdftoppm) + Python PIL. The generated TS module is
# checked in so the drawing pipeline has no runtime PDF dependency.

set -euo pipefail
cd "$(dirname "$0")/.."

PDF="drawing_examples/Streatery_Guidelines_-_2024.12.05_-_FINAL (2).pdf"
OUT_DIR="src/design/assets"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# 150 dpi: crisp enough to read the drawing text, small enough that the
# generated module stays in the low megabytes.
for page in 12 27 28 29 32; do
  pdftoppm -png -r 150 -f "$page" -l "$page" "$PDF" "$TMP_DIR/page"
done

python3 - "$TMP_DIR" "$OUT_DIR" <<'PYEOF'
import base64
import io
import sys
from PIL import Image

tmp_dir, out_dir = sys.argv[1], sys.argv[2]

# Crops as page-fraction boxes (left, top, right, bottom) tuned to the
# figure frames on each page; the verify step renders them for review.
FIGURES = [
    # key, page file, crop box, caption (provenance printed on the sheet)
    ("type1PlanDiagram", "page-12.png", (0.06, 0.245, 0.94, 0.560),
     "DDOT Streatery Guidelines (Dec 2024) §4.2 — Type 1 Arterials barrier placement"),
    ("type2PlanDiagram", "page-12.png", (0.06, 0.560, 0.94, 0.880),
     "DDOT Streatery Guidelines (Dec 2024) §4.2 — Type 2 Arterials, Collector, and Local Streets barrier placement"),
    ("reflectorsSideMounted", "page-27.png", (0.07, 0.150, 0.93, 0.700),
     "DDOT DWG 610.06 — Concrete Barrier Reflectors, Side Mounted (Appendix 3; chief-engineer signed)"),
    ("reflectorsTopMounted", "page-28.png", (0.07, 0.050, 0.93, 0.610),
     "DDOT DWG 610.07 — Concrete Barrier Reflectors, Top Mounted (Appendix 3; chief-engineer signed)"),
    ("reflectorSpecs", "page-29.png", (0.07, 0.050, 0.93, 0.610),
     "DDOT DWG 610.08 — Concrete Barrier Reflectors Specifications (Appendix 3; chief-engineer signed)"),
    ("concreteBlockDetail", "page-32.png", (0.12, 0.150, 0.89, 0.910),
     "DDOT Streatery Guidelines (Dec 2024) Appendix 6 — Precast Concrete Curb Barrier Detail"),
]

entries = []
total_bytes = 0
for key, page_file, (l, t, r, b), caption in FIGURES:
    im = Image.open(f"{tmp_dir}/{page_file}")
    w, h = im.size
    crop = im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
    # Grayscale + palette quantization: these are line drawings; this
    # roughly halves the PNG size with no legibility loss.
    crop = crop.convert("L")
    buf = io.BytesIO()
    crop.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    total_bytes += len(data)
    b64 = base64.b64encode(data).decode("ascii")
    entries.append((key, crop.size, caption, b64))
    print(f"  {key}: {crop.size[0]}x{crop.size[1]} px, {len(data)//1024} KB")

lines = [
    "/**",
    " * GENERATED FILE — do not edit by hand.",
    " * Regenerate with: bash scripts/extract-guideline-assets.sh",
    " *",
    " * DDOT standard figures extracted from the Streatery Guidelines PDF",
    " * (FINAL, Dec 5 2024) for near-verbatim embedding on the A4.00 DDOT",
    " * details sheet — the approved Queen's English set's A2.01 pattern.",
    " * Each figure carries its provenance caption; the captions print on",
    " * the sheet so a reviewer can trace every embedded drawing.",
    " */",
    "",
    "export interface GuidelineFigure {",
    "  /** PNG data URI for an SVG <image> element. */",
    "  dataUri: string;",
    "  /** Natural pixel size of the extracted crop. */",
    "  widthPx: number;",
    "  heightPx: number;",
    "  /** Provenance line printed under the figure on the sheet. */",
    "  caption: string;",
    "}",
    "",
]
for key, (w, h), caption, b64 in entries:
    lines.append(f"export const {key}: GuidelineFigure = {{")
    lines.append(f"  widthPx: {w},")
    lines.append(f"  heightPx: {h},")
    lines.append(f"  caption: {caption!r},")
    lines.append(f'  dataUri: "data:image/png;base64,{b64}",')
    lines.append("};")
    lines.append("")

with open(f"{out_dir}/guidelineFigures.ts", "w") as f:
    f.write("\n".join(lines))

print(f"Wrote {out_dir}/guidelineFigures.ts ({total_bytes // 1024} KB of PNG data)")
PYEOF
