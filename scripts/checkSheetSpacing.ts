/**
 * Sheet spacing check: find overlapping text on generated drawing SVGs.
 *
 * Usage:
 *   npx tsx scripts/checkSheetSpacing.ts <sheet.svg> [...more.svg]
 *
 * Parses every <text> element, estimates its bounding box from
 * character count × font size (ALL-CAPS sans-serif averages ~0.62 em
 * per glyph; mixed case ~0.52), applies rotate() transforms, and
 * reports pairs whose boxes overlap meaningfully. The estimate is
 * deliberately a little generous — a clean report means real spacing
 * headroom, and a flagged pair is worth an eyeball even if the true
 * glyphs just kiss.
 *
 * The draft watermark is skipped (it overlaps everything by design,
 * at 6% opacity).
 */

import { readFileSync } from "node:fs";

interface TextBox {
  /** AABB in drawing units. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  text: string;
  /**
   * Innermost ROTATED group this text sits in (0 = none). Texts laid
   * out together inside one rotated group (e.g. the multi-line
   * NOT-REQUIRED stamp) are designed as a unit — and their rotated
   * AABBs inflate enough to fake-collide — so same-group pairs are
   * skipped.
   */
  rotatedGroupId: number;
}

const ATTR_RE = /([a-zA-Z-]+)="([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) attrs[m[1]!] = m[2]!;
  return attrs;
}

/** A 2D affine transform (a c e / b d f — SVG matrix order). */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parse translate(...) and rotate(...) chains into one matrix. */
function parseTransform(raw: string | undefined): Matrix {
  if (!raw) return IDENTITY;
  let m = IDENTITY;
  for (const op of raw.matchAll(/(translate|rotate)\(([^)]*)\)/g)) {
    const args = op[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    if (op[1] === "translate") {
      m = multiply(m, [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]);
    } else {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
      m = multiply(m, [1, 0, 0, 1, cx, cy]);
      m = multiply(m, [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]);
      m = multiply(m, [1, 0, 0, 1, -cx, -cy]);
    }
  }
  return m;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Average glyph width in em: caps-heavy text runs wider. */
function glyphFactor(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0.55;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.6 ? 0.62 : 0.52;
}

/**
 * Walk the document sequentially, maintaining a stack of group
 * transforms so a <text> inside <g transform="translate(...)"> lands
 * where it actually renders. Handles the only ops the renderers use:
 * translate and rotate (including on the text element itself).
 */
function extractBoxes(svg: string): TextBox[] {
  const boxes: TextBox[] = [];
  const stack: Matrix[] = [IDENTITY];
  const rotatedGroupStack: number[] = [0];
  let nextGroupId = 1;
  const TOKEN_RE = /<g\b([^>]*)>|<\/g>|<text\b([^>]*)>([^<]*)<\/text>/g;

  for (const token of svg.matchAll(TOKEN_RE)) {
    if (token[0] === "</g>") {
      if (stack.length > 1) stack.pop();
      if (rotatedGroupStack.length > 1) rotatedGroupStack.pop();
      continue;
    }
    if (token[0].startsWith("<g")) {
      const attrs = parseAttrs(token[1] ?? "");
      stack.push(multiply(stack[stack.length - 1]!, parseTransform(attrs.transform)));
      rotatedGroupStack.push(
        attrs.transform?.includes("rotate")
          ? nextGroupId++
          : rotatedGroupStack[rotatedGroupStack.length - 1]!,
      );
      continue;
    }

    const attrs = parseAttrs(token[2] ?? "");
    const text = decodeEntities((token[3] ?? "").trim());
    if (!text) continue;
    // The watermark overlaps by design; skip anything near-transparent.
    const opacity = Number(attrs["fill-opacity"] ?? 1);
    if (opacity < 0.2) continue;

    const x = Number(attrs.x ?? 0);
    const y = Number(attrs.y ?? 0);
    const fs = Number(attrs["font-size"] ?? 1);
    const anchor = attrs["text-anchor"] ?? "start";
    const w = text.length * fs * glyphFactor(text);

    // Baseline box: ascent ~0.75 em above the baseline, ~0.2 below.
    const minX = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    const local: Array<[number, number]> = [
      [minX, y - 0.75 * fs],
      [minX + w, y - 0.75 * fs],
      [minX + w, y + 0.2 * fs],
      [minX, y + 0.2 * fs],
    ];

    const m = multiply(stack[stack.length - 1]!, parseTransform(attrs.transform));
    const corners = local.map(([px, py]) => apply(m, px, py));

    boxes.push({
      minX: Math.min(...corners.map((c) => c[0])),
      minY: Math.min(...corners.map((c) => c[1])),
      maxX: Math.max(...corners.map((c) => c[0])),
      maxY: Math.max(...corners.map((c) => c[1])),
      text,
      rotatedGroupId: rotatedGroupStack[rotatedGroupStack.length - 1]!,
    });
  }
  return boxes;
}

/** Overlap area as a fraction of the SMALLER box (0 = clear, 1 = swallowed). */
function overlapFraction(a: TextBox, b: TextBox): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (w <= 0 || h <= 0) return 0;
  const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
  const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
  return (w * h) / Math.min(areaA, areaB);
}

/** Below this fraction it's a kiss, not a collision — estimate noise. */
const REPORT_THRESHOLD = 0.15;

let totalPairs = 0;
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npx tsx scripts/checkSheetSpacing.ts <sheet.svg> [...]");
  process.exit(1);
}

for (const file of files) {
  const boxes = extractBoxes(readFileSync(file, "utf8"));
  const pairs: Array<{ a: TextBox; b: TextBox; frac: number }> = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.rotatedGroupId !== 0 && a.rotatedGroupId === b.rotatedGroupId) continue;
      const frac = overlapFraction(a, b);
      if (frac >= REPORT_THRESHOLD) {
        pairs.push({ a: boxes[i]!, b: boxes[j]!, frac });
      }
    }
  }
  const name = file.split("/").pop();
  if (pairs.length === 0) {
    console.log(`✓ ${name} — clean (${boxes.length} text elements)`);
    continue;
  }
  totalPairs += pairs.length;
  console.log(`✗ ${name} — ${pairs.length} overlap(s):`);
  pairs.sort((p, q) => q.frac - p.frac);
  for (const { a, b, frac } of pairs) {
    const clip = (s: string): string => (s.length > 42 ? s.slice(0, 39) + "..." : s);
    console.log(
      `   ${(frac * 100).toFixed(0).padStart(3)}%  "${clip(a.text)}"  ×  "${clip(b.text)}"`,
    );
  }
}

console.log(`\n${totalPairs} overlapping pair(s) across ${files.length} sheet(s).`);
process.exit(totalPairs > 0 ? 2 : 0);
