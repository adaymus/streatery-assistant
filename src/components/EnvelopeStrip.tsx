/**
 * The envelope strip — the result's signature graphic.
 *
 * A miniature architect's diagram of the curb in front of the address:
 * the storefront's frontage window bracketed above, the buildable
 * envelope drawn as a bar on the curb line, and a true dimension line
 * below it — 45° tick marks (drafting convention, not arrowheads) and
 * feet-and-inches labels from the SAME ftIn() helper the generated
 * drawing sheets use. The website previews the document.
 *
 * Everything is drawn from real station coordinates (feet along the
 * blockface) that the eligibility engine computed — this is the actual
 * geometry, scaled to fit, not an illustration.
 */
import { ftIn } from "../design/renderers/shared.js";
import type { EligibilityResult } from "../envelope.js";
import type { Verdict } from "../envelope.js";

interface EnvelopeStripProps {
  frontage: EligibilityResult["frontage"];
  envelope: {
    startAlongBlockfaceFt: number;
    endAlongBlockfaceFt: number;
    lengthFt: number;
  };
  verdict: Verdict;
}

// Virtual canvas size. The SVG scales responsively via viewBox; these
// are layout coordinates, not pixels on screen.
const W = 800;
const H = 200;

export function EnvelopeStrip({
  frontage,
  envelope,
  verdict,
}: EnvelopeStripProps): React.ReactElement | null {
  if (envelope.lengthFt <= 0) return null;

  // ---------- Station → x mapping ----------
  // Show the frontage window plus breathing room each side; the curb
  // line runs edge to edge with break marks to say "street continues".
  const padFt = Math.max(8, frontage.lengthFt * 0.18);
  const viewStartFt = frontage.startAlongBlockfaceFt - padFt;
  const viewEndFt = frontage.endAlongBlockfaceFt + padFt;
  const x = (stationFt: number): number =>
    ((stationFt - viewStartFt) / (viewEndFt - viewStartFt)) * W;

  const fx0 = x(frontage.startAlongBlockfaceFt);
  const fx1 = x(frontage.endAlongBlockfaceFt);
  const ex0 = x(envelope.startAlongBlockfaceFt);
  const ex1 = x(envelope.endAlongBlockfaceFt);

  // Vertical layout (top → bottom): frontage bracket, parking lane with
  // the envelope bar sitting on the curb, sidewalk, dimension line.
  const yBracket = 38;
  const yCurb = 108;
  const yEnvTop = 78;
  const yDim = 158;

  // Verdict color classes for the envelope bar. Tailwind utilities work
  // on SVG elements (fill-*/stroke-* map to the same theme tokens).
  const barFill =
    verdict === "ELIGIBLE"
      ? "fill-tree-wash stroke-tree"
      : verdict === "ELIGIBLE_WITH_CAVEATS"
        ? "fill-curb-wash stroke-curb"
        : "fill-signal-wash stroke-signal";

  const frontageLabel =
    frontage.source === "building_footprint"
      ? `STOREFRONT — ${ftIn(frontage.lengthFt)}`
      : frontage.source === "operator_override"
        ? `FRONTAGE WITH NEIGHBOR CONSENT — ${ftIn(frontage.lengthFt)}`
        : `ASSUMED FRONTAGE — ${ftIn(frontage.lengthFt)} (no building record)`;

  return (
    // overflow-x-auto + min-width: on phones the diagram keeps a
    // readable drawing size and pans sideways — like reading a real
    // drawing sheet on a small screen — instead of shrinking its
    // dimension text below legibility.
    <div className="overflow-x-auto">
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto min-w-[520px]"
      role="img"
      aria-label={`Diagram: ${ftIn(envelope.lengthFt)} of buildable curb space within the ${ftIn(frontage.lengthFt)} storefront frontage.`}
    >
      {/* ---------- Zone labels ---------- */}
      <text x={12} y={yCurb - 10} className="fill-graphite-faint" fontSize={11.5} letterSpacing={2}>
        PARKING LANE
      </text>
      <text x={12} y={yCurb + 18} className="fill-graphite-faint" fontSize={11.5} letterSpacing={2}>
        SIDEWALK
      </text>

      {/* ---------- Curb line with break marks ---------- */}
      <line x1={0} y1={yCurb} x2={W} y2={yCurb} className="stroke-graphite" strokeWidth={1.5} />
      <BreakMark x={26} y={yCurb} />
      <BreakMark x={W - 26} y={yCurb} />

      {/* ---------- Frontage bracket ---------- */}
      <line x1={fx0} y1={yBracket} x2={fx1} y2={yBracket} className="stroke-rule" strokeWidth={1} />
      <line x1={fx0} y1={yBracket} x2={fx0} y2={yBracket + 8} className="stroke-rule" strokeWidth={1} />
      <line x1={fx1} y1={yBracket} x2={fx1} y2={yBracket + 8} className="stroke-rule" strokeWidth={1} />
      {/* Faint extension lines dropping from frontage edges to the curb —
          how a drafter shows "this measurement belongs to that geometry". */}
      <line x1={fx0} y1={yBracket + 8} x2={fx0} y2={yCurb} className="stroke-hairline" strokeWidth={1} strokeDasharray="3 4" />
      <line x1={fx1} y1={yBracket + 8} x2={fx1} y2={yCurb} className="stroke-hairline" strokeWidth={1} strokeDasharray="3 4" />
      <text
        x={(fx0 + fx1) / 2}
        y={yBracket - 9}
        textAnchor="middle"
        className="fill-graphite-soft"
        fontSize={12.5}
        letterSpacing={1.5}
      >
        {frontageLabel}
      </text>

      {/* ---------- Buildable envelope bar ---------- */}
      <rect
        x={ex0}
        y={yEnvTop}
        width={Math.max(ex1 - ex0, 2)}
        height={yCurb - yEnvTop}
        className={barFill}
        strokeWidth={1.5}
      />

      {/* ---------- Dimension line (45° ticks, drafting style) ---------- */}
      <line x1={ex0} y1={yCurb} x2={ex0} y2={yDim + 6} className="stroke-rule" strokeWidth={1} />
      <line x1={ex1} y1={yCurb} x2={ex1} y2={yDim + 6} className="stroke-rule" strokeWidth={1} />
      <line x1={ex0} y1={yDim} x2={ex1} y2={yDim} className="stroke-graphite" strokeWidth={1} />
      <DimTick x={ex0} y={yDim} />
      <DimTick x={ex1} y={yDim} />
      <text
        x={(ex0 + ex1) / 2}
        y={yDim + 24}
        textAnchor="middle"
        className="fill-graphite font-mono"
        fontSize={16}
        fontWeight={600}
      >
        {ftIn(envelope.lengthFt)}
      </text>
      <text
        x={(ex0 + ex1) / 2}
        y={yDim + 40}
        textAnchor="middle"
        className="fill-graphite-faint"
        fontSize={11.5}
        letterSpacing={2}
      >
        BUILDABLE
      </text>
    </svg>
    </div>
  );
}

/** The drafting break symbol — a double slash through a line that says
    "this continues beyond the drawing". */
function BreakMark({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g className="stroke-graphite" strokeWidth={1.5}>
      <line x1={x - 3} y1={y + 6} x2={x + 3} y2={y - 6} className="stroke-vellum" strokeWidth={5} />
      <line x1={x - 6} y1={y + 6} x2={x} y2={y - 6} />
      <line x1={x} y1={y + 6} x2={x + 6} y2={y - 6} />
    </g>
  );
}

/** A 45° dimension tick — architects mark dimension-line ends with
    slashes, not arrowheads. The detail that makes it read as drafting. */
function DimTick({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <line
      x1={x - 5}
      y1={y + 5}
      x2={x + 5}
      y2={y - 5}
      className="stroke-graphite"
      strokeWidth={1.5}
    />
  );
}
