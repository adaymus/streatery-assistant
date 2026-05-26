/**
 * Renders the full pre-screen result: verdict, envelope, constraints,
 * curb features, site-walk caveats, and the map.
 */
import { lazy, Suspense, useState } from "react";

import type { PrescreenResult } from "../prescreen.js";
import type { Verdict } from "../envelope.js";

// Lazy-load the map. MapLibre GL is ~400KB minified and only matters once
// we have a result to render — there's no reason to ship it in the
// initial bundle for someone who's still typing in an address.
// React.lazy needs a default export, but MapView is a named export, so
// we map it inline.
const MapView = lazy(() =>
  import("./MapView.js").then((m) => ({ default: m.MapView })),
);

interface ResultPanelProps {
  result: PrescreenResult;
}

export function ResultPanel({
  result,
}: ResultPanelProps): React.ReactElement {
  const { geocoded, eligibility, curbFeatures, earlyDisqualifiers, siteWalkCaveats } =
    result;

  // If we short-circuited on an early disqualifier (speed / arterial /
  // bus lane), there's no envelope to show — surface that prominently.
  const verdict: Verdict =
    earlyDisqualifiers.length > 0
      ? "INELIGIBLE"
      : (eligibility?.verdict ?? "INELIGIBLE");

  return (
    <div className="space-y-4">
      {/* On mobile: verdict full-width on top, map below it. The verdict is
          the headline answer Mitra needs at a glance; map is context. */}
      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <VerdictCard
          verdict={verdict}
          envelopeLengthFt={eligibility?.envelope.lengthFt ?? 0}
          template={eligibility?.envelope.recommendedTemplate ?? "none"}
          spaces={eligibility?.envelope.approximateParkingSpaces ?? 0}
          earlyDisqualifiers={earlyDisqualifiers.map((d) => d.detail)}
          hardDisqualifiers={eligibility?.hardDisqualifiers ?? []}
        />
        {/* Placeholder matches the eventual map's height + border so the
            layout doesn't shift when the lazy chunk finishes loading. */}
        <Suspense fallback={<MapPlaceholder />}>
          <MapView result={result} />
        </Suspense>
      </div>

      <LocationCard result={result} />

      {eligibility &&
        eligibility.extensionOpportunity.couldHelp && (
          <ExtensionOpportunityCard
            ownEnvelopeFt={eligibility.envelope.lengthFt}
            extendedEnvelopeFt={
              eligibility.extensionOpportunity.extendedEnvelopeLengthFt
            }
            extendedFrontageFt={
              eligibility.extensionOpportunity.extendedFrontageFt
            }
          />
        )}

      {eligibility && eligibility.bindingConstraints.length > 0 && (
        <BindingConstraintsCard
          constraints={eligibility.bindingConstraints.map((c) => ({
            description: c.description,
            bufferFt: c.bufferFt,
            limits: c.limits,
          }))}
        />
      )}

      <CurbFeaturesCard curbFeatures={curbFeatures} />

      <SiteWalkCaveatsCard caveats={siteWalkCaveats} />

      <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-stone-400">
        <div className="flex gap-4">
          <CopyLinkButton />
          <PrintPackageButton result={result} />
        </div>
        <span className="text-right">
          Fetched at {new Date(result.fetchedAt).toLocaleString()} ·
          geocoded with {geocoded.mar.confidenceScore}/100 confidence
        </span>
      </div>
    </div>
  );
}

// ---------- Copy link button (URL-based share) ----------

/**
 * Copies the current page URL to the clipboard. The URL already includes
 * the `?address=...` param (App writes it on every pre-screen), so the
 * recipient pasting it gets the same result auto-loaded.
 *
 * Shows "Copied!" feedback for 2 seconds, then resets — gives the user
 * confirmation without needing a toast/notification system.
 */
function CopyLinkButton(): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      // Reset the feedback after 2 seconds so subsequent clicks still
      // give visual confirmation.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can reject (permission denied, insecure context).
      // Fall back to a prompt the user can copy from manually — rare,
      // but better than a silent failure.
      window.prompt("Copy this link:", window.location.href);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-stone-600 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition-colors"
    >
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}

// ---------- Print submission package as PDF ----------

/**
 * Renders the submission package as a printable HTML view in a new
 * tab and auto-triggers the browser print dialog. The user picks
 * "Save as PDF" to complete the export.
 *
 * The print module — including its `marked` dependency for Markdown
 * conversion — is lazy-loaded with dynamic import on first click.
 * Users who never request a PDF don't pay the ~40 KB cost.
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
      // Lazy import or render failure — surface to the console for
      // debugging without crashing the whole result panel.
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
      className="text-stone-600 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition-colors disabled:opacity-50"
    >
      {busy ? "Opening..." : "Save submission package as PDF"}
    </button>
  );
}

// ---------- Map placeholder (shown while the MapView chunk loads) ----------

function MapPlaceholder(): React.ReactElement {
  return (
    <div className="w-full h-80 md:h-full min-h-72 rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center text-xs text-stone-400">
      Loading map...
    </div>
  );
}

// ---------- Verdict ----------

function VerdictCard({
  verdict,
  envelopeLengthFt,
  template,
  spaces,
  earlyDisqualifiers,
  hardDisqualifiers,
}: {
  verdict: Verdict;
  envelopeLengthFt: number;
  template: string;
  spaces: number;
  earlyDisqualifiers: string[];
  hardDisqualifiers: string[];
}): React.ReactElement {
  const palette =
    verdict === "ELIGIBLE"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : verdict === "ELIGIBLE_WITH_CAVEATS"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-rose-50 border-rose-200 text-rose-900";

  const pillPalette =
    verdict === "ELIGIBLE"
      ? "bg-emerald-600 text-white"
      : verdict === "ELIGIBLE_WITH_CAVEATS"
        ? "bg-amber-600 text-white"
        : "bg-rose-600 text-white";

  const allBlockers = [...earlyDisqualifiers, ...hardDisqualifiers];

  return (
    <div className={`rounded-lg border p-4 sm:p-5 ${palette}`}>
      <div
        className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide ${pillPalette}`}
      >
        {verdict.replace(/_/g, " ")}
      </div>
      {envelopeLengthFt > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-3xl font-bold tabular-nums">
            {envelopeLengthFt.toFixed(0)} ft
          </div>
          <div className="text-sm">
            Buildable envelope, ~{spaces} parking space{spaces === 1 ? "" : "s"}{" "}
            ·{" "}
            <span className="font-mono text-xs px-1.5 py-0.5 bg-white/60 rounded">
              {template}
            </span>{" "}
            template
          </div>
        </div>
      )}
      {allBlockers.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {allBlockers.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Location ----------

function LocationCard({
  result,
}: {
  result: PrescreenResult;
}): React.ReactElement {
  const { geocoded } = result;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Location
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 sm:gap-y-2 text-sm">
        <DlItem label="Address" value={geocoded.mar.fullAddress} mono />
        <DlItem label="Block" value={geocoded.block.blockName} mono />
        <DlItem
          label="Bounded by"
          value={`${geocoded.block.fromStreet} ↔ ${geocoded.block.toStreet}`}
        />
        <DlItem
          label="Side"
          value={`${geocoded.side} (building #${geocoded.mar.streetNumber})`}
        />
        <DlItem
          label="Speed limit"
          value={`${geocoded.block.speedLimitMph ?? "?"} mph`}
        />
        <DlItem
          label="Functional class"
          value={`FHWA ${geocoded.block.functionalClassFhwa ?? "?"} · DC ${geocoded.block.functionalClassDc ?? "?"}`}
        />
        <DlItem
          label="Parking lane width"
          value={`${geocoded.block.parkingLaneWidthPerSideFt?.toFixed(0) ?? "?"} ft per side`}
        />
        <DlItem
          label="Ward / ANC"
          value={`Ward ${geocoded.block.wardId ?? "?"} · ANC ${geocoded.block.ancId ?? "?"}`}
        />
      </dl>
    </div>
  );
}

function DlItem({
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
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd
        className={`text-stone-800 ${mono ? "font-mono text-xs break-words" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------- Extension opportunity ----------

function ExtensionOpportunityCard({
  ownEnvelopeFt,
  extendedEnvelopeFt,
  extendedFrontageFt,
}: {
  ownEnvelopeFt: number;
  extendedEnvelopeFt: number;
  extendedFrontageFt: number;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 sm:p-5">
      <h3 className="text-blue-900 font-semibold mb-2">
        Extension opportunity
      </h3>
      <p className="text-sm text-blue-800">
        With a letter of consent from the adjacent property owner AND
        ground-floor tenant, extending the streatery into the neighbor's
        frontage (to {extendedFrontageFt} ft total) would yield a{" "}
        <strong>{extendedEnvelopeFt.toFixed(0)} ft envelope</strong> vs the{" "}
        {ownEnvelopeFt.toFixed(0)} ft available on the operator's own
        frontage alone.
      </p>
    </div>
  );
}

// ---------- Binding constraints ----------

function BindingConstraintsCard({
  constraints,
}: {
  constraints: Array<{
    description: string;
    bufferFt: number;
    limits: string;
  }>;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Binding constraints
      </h3>
      <p className="text-xs text-stone-500 mb-3">
        These features touch the envelope's edge. Each is what's actually
        limiting the buildable size — not just nearby clutter.
      </p>
      <ul className="space-y-2 text-sm">
        {constraints.map((c, i) => (
          <li
            key={i}
            className="flex items-start gap-3 pb-2 border-b border-stone-100 last:border-0 last:pb-0"
          >
            <span className="font-mono text-xs px-1.5 py-0.5 bg-stone-100 rounded text-stone-600 shrink-0 mt-0.5">
              {c.bufferFt} ft
            </span>
            <div>
              <div className="text-stone-800">{c.description}</div>
              <div className="text-xs text-stone-500">
                Limits {c.limits}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Curb features ----------

function CurbFeaturesCard({
  curbFeatures,
}: {
  curbFeatures: PrescreenResult["curbFeatures"];
}): React.ReactElement {
  const blockfaceCounts = [
    ["Parking meters", curbFeatures.parkingMeters.length],
    ["Fire hydrants", curbFeatures.fireHydrants.length],
    ["Bus stops", curbFeatures.busStops.length],
    ["Bicycle lanes", curbFeatures.bicycleLanes.length],
  ] as const;
  const spatialCounts = [
    ["Loading zones", curbFeatures.loadingZones.length],
    ["Street trees", curbFeatures.streetTrees.length],
    ["ADA curb ramps", curbFeatures.adaCurbRamps.length],
    ["Driveway curb cuts", curbFeatures.driveways.length],
    ["Crosswalks", curbFeatures.crosswalks.length],
  ] as const;

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Curb features
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <h4 className="text-xs font-medium text-stone-600 mb-2">
            On this blockface
          </h4>
          <dl className="space-y-1.5">
            {blockfaceCounts.map(([label, count]) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-stone-600">{label}</dt>
                <dd className="font-mono tabular-nums text-stone-800">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4 className="text-xs font-medium text-stone-600 mb-2">
            Within 150-200 ft (both sides)
          </h4>
          <dl className="space-y-1.5">
            {spatialCounts.map(([label, count]) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-stone-600">{label}</dt>
                <dd className="font-mono tabular-nums text-stone-800">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

// ---------- Site walk caveats ----------

function SiteWalkCaveatsCard({
  caveats,
}: {
  caveats: string[];
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 sm:p-5">
      <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">
        Site walk required
      </h3>
      <p className="text-xs text-stone-600 mb-3">
        These checks can't be done from data — verify on site even when the
        verdict is ELIGIBLE.
      </p>
      <ul className="space-y-1.5 text-sm text-stone-700">
        {caveats.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-stone-400 shrink-0">□</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
