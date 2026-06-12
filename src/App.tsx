/**
 * Top-level app — a civic lookup, not a dashboard.
 *
 * Layout philosophy (general-audience redesign): the page reads like a
 * well-made public document. One centered column; the address question
 * leads; orientation copy below it for cold visitors (citizens,
 * journalists, officials, restaurant owners); the result renders as a
 * "sheet" — same graphic language as the architect's drawings the tool
 * generates. The old operator console (sidebar form + results grid)
 * assumed a briefed user; this assumes none.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { prescreenAddress, type PrescreenResult } from "./prescreen.js";
import { AddressForm } from "./components/AddressForm.js";
import { ResultPanel } from "./components/ResultPanel.js";

// Query-param name we use to persist the current address. Keeping it
// short and obvious so a pasted link is human-readable.
const ADDRESS_PARAM = "address";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; address: string }
  | { kind: "success"; result: PrescreenResult }
  | { kind: "error"; address: string; message: string };

export function App(): React.ReactElement {
  // Tagged-union state: the compiler enforces we're never "loading and
  // success at the same time" — one state at a time, always renderable.
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // useCallback memoizes the function so re-renders don't create new
  // function references — child components receiving it as a prop won't
  // re-render every time the parent does.
  const onSubmit = useCallback(async (address: string) => {
    setStatus({ kind: "loading", address });
    // Reflect the current address in the URL so the page is bookmarkable
    // and shareable. replaceState (vs pushState) avoids piling up
    // browser-history entries per search — back still exits the app.
    const url = new URL(window.location.href);
    url.searchParams.set(ADDRESS_PARAM, address);
    window.history.replaceState({}, "", url.toString());
    try {
      const result = await prescreenAddress(address);
      setStatus({ kind: "success", result });
    } catch (err) {
      // catch gives `unknown`; narrow before reading .message so a
      // non-Error throwable doesn't crash us.
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", address, message });
    }
  }, []);

  // On first mount, if the URL already carries an address (a shared link
  // or bookmark), auto-submit it. useRef guards against double-firing
  // under React StrictMode (which invokes effects twice in dev).
  const hasAutoSubmittedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSubmittedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const initialAddress = params.get(ADDRESS_PARAM)?.trim();
    if (initialAddress && initialAddress.length > 0) {
      hasAutoSubmittedRef.current = true;
      onSubmit(initialAddress);
    }
  }, [onSubmit]);

  const isLanding = status.kind === "idle";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Masthead. The 3px brick bar is the binding tape on a public
          document — the one place the accent appears decoratively. */}
      <header className="border-t-[3px] border-t-brick border-b border-b-hairline bg-vellum">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint">
            Mount Pleasant · Washington, DC
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-graphite">
            Streatery Check
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-graphite-soft max-w-2xl">
            Could outdoor dining work on your block? Enter any Mt. Pleasant
            address and find out in seconds — straight from the city's own
            records.
          </p>
        </div>
      </header>

      <main className="w-full flex-1">
        {/* The search always leads. On landing it sits with examples and
            orientation; once there's a result it stays compact on top so
            checking another address is one glance away. */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
          <AddressForm
            onSubmit={onSubmit}
            isSubmitting={status.kind === "loading"}
            showExamples={isLanding}
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-10">
          {status.kind === "idle" && <Orientation />}
          {status.kind === "loading" && <LoadingState address={status.address} />}
          {status.kind === "error" && (
            <ErrorState address={status.address} message={status.message} />
          )}
          {status.kind === "success" && (
            <div className="mt-6">
              <ResultPanel result={status.result} />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-hairline bg-vellum">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-1.5 text-xs text-graphite-soft">
          <p>
            <span className="font-semibold text-graphite">Advisory only.</span>{" "}
            Every result lists what still needs an on-site check. This tool is
            not a substitute for a site walk, an architect, or DDOT review.
          </p>
          <p>
            Data: DC Open Data and the DC Master Address Repository, fetched
            live per search · Rules: DDOT Streatery Guidelines (adopted
            December 2024) · Built with the District Bridges streatery cohort.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------- Landing orientation (the cold-visitor explainer) ----------

/**
 * What a first-time visitor needs before they care about the tool: what
 * a streatery is, why eligibility is hard, and what this does about it.
 * Shown only while idle — once a result is up, the result is the story.
 */
function Orientation(): React.ReactElement {
  return (
    <div className="mt-8 space-y-8">
      <div className="max-w-2xl space-y-3 text-sm sm:text-[15px] leading-relaxed text-graphite-soft">
        <p>
          A <strong className="text-graphite">streatery</strong> is a small
          dining platform built in a curbside parking space. DC's permanent
          program sets strict siting rules — minimum distances from fire
          hydrants, bus stops, crosswalks, driveways, and street trees — and
          the review queue is slow: citywide, only{" "}
          <strong className="text-graphite">
            5 streateries have been approved, while 76 applications wait
          </strong>
          . Most Mt. Pleasant restaurants tore theirs down rather than
          navigate the process blind.
        </p>
        <p>
          This tool removes the blindness. It reads the city's curbside
          records for any Mt. Pleasant address and answers: can a streatery
          legally go here, how big, and what stands in the way.
        </p>
      </div>

      <HowItWorks />
    </div>
  );
}

/**
 * Three-step method strip. This is here for the trust-driven personas —
 * journalists and officials citing the tool need to see the method, not
 * just the verdict. Numbered like drawing-sheet keynotes.
 */
function HowItWorks(): React.ReactElement {
  const steps: Array<{ title: string; body: string }> = [
    {
      title: "Read the city's records",
      body: "A dozen DC Open Data layers for the block: hydrants, parking meters, bus stops, trees, crosswalks, driveways, the building footprint.",
    },
    {
      title: "Apply DDOT's rulebook",
      body: "The buffer distances and disqualifiers from the 2024 Streatery Guidelines — the same rules the city's reviewers apply.",
    },
    {
      title: "Answer, with the work shown",
      body: "A plain-English verdict, a measured diagram of the buildable space, and downloadable starter documents for a real application.",
    },
  ];
  return (
    <div className="border-t border-hairline pt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint mb-4">
        How it works
      </h2>
      <ol className="grid gap-5 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            {/* Keynote diamond — the numbered-note marker on a drawing
                sheet. A hexagon/diamond outline, not a filled badge. */}
            <span
              aria-hidden
              className="shrink-0 mt-0.5 w-6 h-6 rotate-45 border border-rule flex items-center justify-center"
            >
              <span className="-rotate-45 text-[11px] font-semibold font-mono text-graphite">
                {i + 1}
              </span>
            </span>
            <div>
              <h3 className="text-sm font-semibold text-graphite">
                {step.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-graphite-soft">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Loading ----------

function LoadingState({ address }: { address: string }): React.ReactElement {
  return (
    <div className="mt-6 border border-hairline bg-vellum rounded-xs p-6 sm:p-10 text-center">
      <p className="text-sm text-graphite">
        Checking <span className="font-mono">{address}</span>
      </p>
      <p className="mt-2 text-xs text-graphite-soft">
        Reading the city's curbside records — hydrants, meters, bus stops,
        trees. About two seconds.
      </p>
      {/* A surveyor's dashed line marching across the sheet — the loading
          indicator drawn in the product's own language. */}
      <div className="mt-5 mx-auto max-w-xs overflow-hidden" aria-hidden>
        <div className="h-px border-t-2 border-dashed border-rule animate-pulse" />
      </div>
    </div>
  );
}

// ---------- Error ----------

/**
 * Public-friendly failure: lead with what to try, keep the raw error
 * (which Mitra and we still want for debugging) behind a disclosure.
 */
function ErrorState({
  address,
  message,
}: {
  address: string;
  message: string;
}): React.ReactElement {
  return (
    <div className="mt-6 border border-signal/30 bg-signal-wash rounded-xs p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-signal">
        We couldn't check that address
      </h2>
      <p className="mt-1 text-sm text-graphite-soft font-mono break-all">
        {address}
      </p>
      <ul className="mt-3 space-y-1 text-sm text-graphite-soft list-disc pl-5">
        <li>
          Use the full street name and quadrant — e.g.{" "}
          <span className="font-mono text-xs">
            3110 Mount Pleasant Street NW
          </span>
        </li>
        <li>This version covers the Mt. Pleasant neighborhood only</li>
        <li>
          The city's address service occasionally has outages — trying again
          in a minute often works
        </li>
      </ul>
      <details className="mt-4">
        <summary className="text-xs text-graphite-faint cursor-pointer hover:text-graphite-soft">
          Technical details
        </summary>
        <pre className="mt-2 text-xs text-graphite-soft whitespace-pre-wrap">
          {message}
        </pre>
      </details>
    </div>
  );
}
