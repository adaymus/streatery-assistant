/**
 * The result, rendered as a public document — one continuous "sheet"
 * in the same graphic language as the architect's drawings the tool
 * generates: a title block up top, a plan-review-style verdict stamp,
 * a measured diagram of the buildable curb, and sections divided by
 * hairline rules instead of floating cards.
 *
 * Audience contract (general-public redesign): every section leads in
 * plain English; the technical detail an operator like District Bridges
 * needs (block keys, functional classes, feature counts, confidence
 * scores) is all still here — behind one "Technical detail" disclosure
 * at the bottom rather than in the reader's face.
 */
import { lazy, Suspense, useState } from "react";

import type { PrescreenResult } from "../prescreen.js";
import type { Verdict } from "../envelope.js";
import { ftIn } from "../design/renderers/shared.js";
import { EnvelopeStrip } from "./EnvelopeStrip.js";

// Lazy-load the map. MapLibre GL is ~400KB minified and only matters once
// we have a result to render — no reason to ship it in the initial bundle
// for someone still typing an address.
const MapView = lazy(() =>
  import("./MapView.js").then((m) => ({ default: m.MapView })),
);

interface ResultPanelProps {
  result: PrescreenResult;
}

export function ResultPanel({ result }: ResultPanelProps): React.ReactElement {
  const { geocoded, eligibility, earlyDisqualifiers, siteWalkCaveats } = result;

  // If we short-circuited on an early disqualifier (speed / arterial /
  // bus lane), there's no envelope to show — the verdict carries it.
  const verdict: Verdict =
    earlyDisqualifiers.length > 0
      ? "INELIGIBLE"
      : (eligibility?.verdict ?? "INELIGIBLE");

  const canDraw = !!eligibility && eligibility.envelope.lengthFt > 0;

  return (
    <article className="bg-vellum border border-rule rounded-xs">
      {/* ---------- Title block ---------- */}
      <header className="px-5 sm:px-7 py-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint">
            Streatery eligibility report
          </p>
          <h2 className="mt-1 text-lg sm:text-xl font-bold text-graphite">
            {titleCaseAddress(geocoded.mar.fullAddress)}
          </h2>
          <p className="mt-0.5 text-xs text-graphite-soft">
            {titleCaseAddress(geocoded.block.blockName).replace(" Of ", " of ")}
          </p>
        </div>
        <VerdictStamp verdict={verdict} />
      </header>

      {/* ---------- Plain-English answer ---------- */}
      <section className="px-5 sm:px-7 pb-6">
        <PlainAnswer
          verdict={verdict}
          eligibility={eligibility}
          earlyDisqualifiers={earlyDisqualifiers.map((d) => d.detail)}
        />
      </section>

      {/* ---------- The measured diagram ---------- */}
      {canDraw && eligibility && (
        <section className="border-t border-hairline px-5 sm:px-7 py-6">
          <SectionLabel>The space, measured</SectionLabel>
          <p className="mt-1.5 mb-4 text-sm text-graphite-soft max-w-2xl">
            The bar is the stretch of parking lane in front of this address
            that clears every required clearance — drawn from the city's
            actual geometry for this curb.
          </p>
          <EnvelopeStrip
            frontage={eligibility.frontage}
            envelope={eligibility.envelope}
            verdict={verdict}
          />
        </section>
      )}

      {/* ---------- What's limiting the size ---------- */}
      {eligibility && eligibility.bindingConstraints.length > 0 && (
        <section className="border-t border-hairline px-5 sm:px-7 py-6">
          <SectionLabel>What sets the limits</SectionLabel>
          <p className="mt-1.5 mb-4 text-sm text-graphite-soft max-w-2xl">
            Each item below is a real feature of this block and the clearance
            DDOT requires from it — these are what hold the buildable space
            to {eligibility.envelope.lengthFt.toFixed(0)} feet.
          </p>
          <ul className="space-y-2.5">
            {eligibility.bindingConstraints.map((c, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs px-1.5 py-0.5 bg-wash border border-hairline rounded-xs text-graphite-soft shrink-0 mt-0.5 tabular-nums">
                  {c.bufferFt} ft
                </span>
                <div>
                  <div className="text-graphite">{c.description}</div>
                  <div className="text-xs text-graphite-faint">
                    Limits the {c.limits}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Extension opportunity ---------- */}
      {eligibility && eligibility.extensionOpportunity.couldHelp && (
        <section className="border-t border-hairline px-5 sm:px-7 py-6">
          <SectionLabel>Room to grow — with a neighbor's consent</SectionLabel>
          <p className="mt-1.5 text-sm text-graphite-soft max-w-2xl">
            The rules allow a streatery to extend in front of the property
            next door if its owner and ground-floor tenant agree in writing.
            Here, that would stretch the buildable space from about{" "}
            {Math.round(eligibility.envelope.lengthFt)} feet to{" "}
            <strong className="text-graphite">
              about{" "}
              {Math.round(
                eligibility.extensionOpportunity.extendedEnvelopeLengthFt,
              )}{" "}
              feet
            </strong>
            .
          </p>
        </section>
      )}

      {/* ---------- Map ---------- */}
      <section className="border-t border-hairline px-5 sm:px-7 py-6">
        <SectionLabel>On the map</SectionLabel>
        <div className="mt-3">
          <Suspense fallback={<MapPlaceholder />}>
            <MapView result={result} />
          </Suspense>
        </div>
      </section>

      {/* ---------- Check on site ---------- */}
      <section className="border-t border-hairline px-5 sm:px-7 py-6">
        <SectionLabel>What still needs eyes on the street</SectionLabel>
        <p className="mt-1.5 mb-3 text-sm text-graphite-soft max-w-2xl">
          City data can't see everything. Even a clear verdict depends on
          checking these in person:
        </p>
        <ul className="space-y-1.5 text-sm text-graphite-soft">
          {siteWalkCaveats.map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="text-graphite-faint shrink-0" aria-hidden>
                □
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Next steps, by reader ---------- */}
      <section className="border-t border-hairline px-5 sm:px-7 py-6">
        <SectionLabel>Next steps</SectionLabel>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-graphite">
              If this is your restaurant
            </h4>
            <p className="mt-1.5 text-sm text-graphite-soft">
              District Bridges coordinates Mt. Pleasant applications as a
              group, roughly halving each restaurant's cost. Start with the
              documents below — they're pre-filled from this result and give
              your architect a running start.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrintPackageButton result={result} />
              {canDraw && <PrintDrawingSetButton result={result} />}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-graphite">
              If you're reporting or researching
            </h4>
            <p className="mt-1.5 text-sm text-graphite-soft">
              Every number here comes live from DC Open Data and the DC
              Master Address Repository (fetched{" "}
              {new Date(result.fetchedAt).toLocaleDateString()}). The method
              is on the home page; the link below reproduces this exact
              result.
            </p>
            <div className="mt-3">
              <CopyLinkButton />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Technical detail (the operator view) ---------- */}
      <section className="border-t border-hairline px-5 sm:px-7 py-4">
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint hover:text-graphite-soft list-none flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block transition-transform duration-150 group-open:rotate-90"
            >
              ▸
            </span>
            Technical detail
          </summary>
          <div className="mt-4 space-y-5">
            <TechnicalGrid result={result} />
            <CurbFeatureCounts curbFeatures={result.curbFeatures} />
            <p className="text-xs text-graphite-faint">
              Geocoded with {geocoded.mar.confidenceScore}/100 confidence ·
              fetched {new Date(result.fetchedAt).toLocaleString()}
            </p>
          </div>
        </details>
      </section>
    </article>
  );
}

// ---------- Verdict stamp ----------

/**
 * The plan-review stamp: double-ring border, slight rotation, verdict
 * color. "PRELIMINARY SCREEN" inside the ring keeps the stamp honest —
 * it must never read as a DDOT approval.
 */
function VerdictStamp({ verdict }: { verdict: Verdict }): React.ReactElement {
  const color =
    verdict === "ELIGIBLE"
      ? "text-tree border-tree"
      : verdict === "ELIGIBLE_WITH_CAVEATS"
        ? "text-curb border-curb"
        : "text-signal border-signal";
  const label =
    verdict === "ELIGIBLE"
      ? "Eligible"
      : verdict === "ELIGIBLE_WITH_CAVEATS"
        ? "Eligible · with caveats"
        : "Ineligible";

  return (
    <div
      className={`shrink-0 -rotate-2 border-2 rounded-xs p-[3px] ${color}`}
      aria-label={`Verdict: ${label}`}
    >
      <div className={`border rounded-xs px-3 py-1.5 text-center ${color}`}>
        <div className="text-sm font-bold uppercase tracking-[0.12em]">
          {label}
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] opacity-80">
          Preliminary screen
        </div>
      </div>
    </div>
  );
}

// ---------- Plain-English answer ----------

function PlainAnswer({
  verdict,
  eligibility,
  earlyDisqualifiers,
}: {
  verdict: Verdict;
  eligibility: PrescreenResult["eligibility"];
  earlyDisqualifiers: string[];
}): React.ReactElement {
  const env = eligibility?.envelope;
  const templateInWords =
    env?.recommendedTemplate === "1-space"
      ? "a standard one-parking-space design"
      : env?.recommendedTemplate === "2-space"
        ? "a two-parking-space design"
        : env?.recommendedTemplate === "3-space+"
          ? "a design spanning three or more parking spaces"
          : null;

  if (verdict === "ELIGIBLE" && env) {
    return (
      <div>
        <p className="text-xl sm:text-2xl font-bold text-graphite">
          Yes — a streatery fits here.
        </p>
        <p className="mt-2 text-sm sm:text-base text-graphite-soft max-w-2xl">
          About {Math.round(env.lengthFt)} feet of curb in front of this
          address clears every siting rule — enough for{" "}
          {templateInWords ?? "a streatery"}
          {env.approximateParkingSpaces > 0 &&
            ` (about ${env.approximateParkingSpaces} parking space${env.approximateParkingSpaces === 1 ? "" : "s"})`}
          .
        </p>
      </div>
    );
  }

  if (verdict === "ELIGIBLE_WITH_CAVEATS" && env) {
    return (
      <div>
        <p className="text-xl sm:text-2xl font-bold text-graphite">
          Possibly — but it would take extra steps.
        </p>
        <p className="mt-2 text-sm sm:text-base text-graphite-soft max-w-2xl">
          Only about {Math.round(env.lengthFt)} feet of curb clears every
          rule, and a standard one-space design needs 20 feet. The realistic
          paths: a custom, shorter design — or written consent from the
          neighboring property to extend past the storefront.
        </p>
      </div>
    );
  }

  // INELIGIBLE — explain why in the blockers' own words. The engine's
  // disqualifier strings are already written for humans.
  const blockers = [
    ...earlyDisqualifiers,
    ...(eligibility?.hardDisqualifiers ?? []),
  ];
  return (
    <div>
      <p className="text-xl sm:text-2xl font-bold text-graphite">
        No — a streatery can't be built here under current rules.
      </p>
      {blockers.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm sm:text-base text-graphite-soft max-w-2xl">
          {blockers.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-signal shrink-0">
                ·
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm sm:text-base text-graphite-soft max-w-2xl">
          Less than 12 feet of curb clears the required safety clearances —
          no realistic streatery design fits in that space.
        </p>
      )}
    </div>
  );
}

// ---------- Shared section label ----------

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint">
      {children}
    </h3>
  );
}

// ---------- Copy link ----------

/**
 * Copies the current page URL (which carries ?address=...) so the
 * recipient gets this same result auto-loaded. Brief "copied" feedback,
 * then reset.
 */
function CopyLinkButton(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can reject (permission denied, insecure context).
      // Fall back to a prompt the user can copy from manually.
      window.prompt("Copy this link:", window.location.href);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-3.5 py-2 text-sm font-medium text-graphite bg-vellum border border-rule rounded-xs hover:bg-wash transition-colors duration-150"
    >
      {copied ? "Link copied ✓" : "Copy shareable link"}
    </button>
  );
}

// ---------- Document downloads ----------

/**
 * Submission starter package — opens the printable view in a new tab
 * (lazy-loads the print module + marked on first click).
 */
function PrintPackageButton({
  result,
}: {
  result: PrescreenResult;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const handlePrint = async (): Promise<void> => {
    setBusy(true);
    try {
      const { openPrintableSubmissionPackage } = await import(
        "../submissionPackagePrint.js"
      );
      openPrintableSubmissionPackage(result);
    } catch (err) {
      console.error("Failed to open print view:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={busy}
      className="px-3.5 py-2 text-sm font-semibold text-vellum bg-brick rounded-xs hover:bg-brick-deep disabled:bg-graphite-faint disabled:cursor-not-allowed transition-colors duration-150"
    >
      {busy ? "Opening..." : "Starter package (PDF)"}
    </button>
  );
}

/**
 * Draft drawing set — renders the schematic sheets (plan + elevations,
 * outline + dimensions only) client-side and opens the printable view.
 * Slower than the package (it fetches more site data), so the busy
 * label says what's happening; errors surface inline. The full packet
 * is still available from the CLI (`npm run drawings -- ... --pdf`).
 */
function PrintDrawingSetButton({
  result,
}: {
  result: PrescreenResult;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { openPrintableDrawingSet } = await import(
        "../drawingSetPrint.js"
      );
      await openPrintableDrawingSet(result);
    } catch (err) {
      console.error("Failed to generate drawing set:", err);
      setError(
        err instanceof Error ? err.message : "Drawing generation failed",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handlePrint}
        disabled={busy}
        className="px-3.5 py-2 text-sm font-medium text-graphite bg-vellum border border-rule rounded-xs hover:bg-wash disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
      >
        {busy ? "Drawing the sheets..." : "Draft drawings (PDF)"}
      </button>
      {error && <span className="text-xs text-signal">{error}</span>}
    </span>
  );
}

// ---------- Map placeholder ----------

function MapPlaceholder(): React.ReactElement {
  return (
    <div className="w-full h-80 border border-hairline bg-wash rounded-xs flex items-center justify-center text-xs text-graphite-faint">
      Loading map...
    </div>
  );
}

// ---------- Technical detail ----------

/**
 * The operator-grade facts, translated where translation helps and left
 * precise where precision is the point.
 */
function TechnicalGrid({
  result,
}: {
  result: PrescreenResult;
}): React.ReactElement {
  const { geocoded } = result;
  const speedOk = (geocoded.block.speedLimitMph ?? 99) <= 30;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
      <TechItem label="Address (city record)" value={geocoded.mar.fullAddress} mono />
      <TechItem label="Block" value={geocoded.block.blockName} mono />
      <TechItem
        label="Bounded by"
        value={`${geocoded.block.fromStreet} ↔ ${geocoded.block.toStreet}`}
      />
      <TechItem
        label="Side of street"
        value={`${geocoded.side} (building #${geocoded.mar.streetNumber})`}
      />
      <TechItem
        label="Speed limit"
        value={`${geocoded.block.speedLimitMph ?? "?"} mph — ${speedOk ? "under" : "OVER"} the 30 mph program limit`}
      />
      <TechItem
        label="Street classification"
        value={`FHWA ${geocoded.block.functionalClassFhwa ?? "?"} · DC ${geocoded.block.functionalClassDc ?? "?"}`}
      />
      <TechItem
        label="Parking lane width"
        value={`${geocoded.block.parkingLaneWidthPerSideFt?.toFixed(0) ?? "?"} ft per side`}
      />
      <TechItem
        label="Ward / ANC"
        value={`Ward ${geocoded.block.wardId ?? "?"} · ANC ${geocoded.block.ancId ?? "?"}`}
      />
    </dl>
  );
}

function TechItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-xs text-graphite-faint">{label}</dt>
      <dd
        className={`text-graphite ${mono ? "font-mono text-xs break-words" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function CurbFeatureCounts({
  curbFeatures,
}: {
  curbFeatures: PrescreenResult["curbFeatures"];
}): React.ReactElement {
  const onBlockface = [
    ["Parking meters", curbFeatures.parkingMeters.length],
    ["Fire hydrants", curbFeatures.fireHydrants.length],
    ["Bus stops", curbFeatures.busStops.length],
    ["Bicycle lanes", curbFeatures.bicycleLanes.length],
  ] as const;
  const nearby = [
    ["Loading zones", curbFeatures.loadingZones.length],
    ["Street trees", curbFeatures.streetTrees.length],
    ["ADA curb ramps", curbFeatures.adaCurbRamps.length],
    ["Driveway curb cuts", curbFeatures.driveways.length],
    ["Crosswalks", curbFeatures.crosswalks.length],
  ] as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      <div>
        <h4 className="text-xs text-graphite-faint mb-1.5">
          Features on this side of the block
        </h4>
        <dl className="space-y-1">
          {onBlockface.map(([label, count]) => (
            <div key={label} className="flex justify-between text-sm">
              <dt className="text-graphite-soft">{label}</dt>
              <dd className="font-mono tabular-nums text-graphite">{count}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h4 className="text-xs text-graphite-faint mb-1.5">
          Features within ~200 ft (both sides)
        </h4>
        <dl className="space-y-1">
          {nearby.map(([label, count]) => (
            <div key={label} className="flex justify-between text-sm">
              <dt className="text-graphite-soft">{label}</dt>
              <dd className="font-mono tabular-nums text-graphite">{count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ---------- Small helpers ----------

/** "3110 MOUNT PLEASANT STREET NW" → "3110 Mount Pleasant Street NW".
    The MAR returns SCREAMING CASE; a public document shouldn't shout,
    but the quadrant stays uppercase — it's an initialism. */
function titleCaseAddress(screaming: string): string {
  return screaming
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, (q) => q.toUpperCase());
}
