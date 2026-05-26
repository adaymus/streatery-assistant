/**
 * Top-level app. Owns the form-submit / result state and renders the
 * left-side controls and the right-side result panel.
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
  // useState returns [currentValue, setterFunction]. Tagged-union states
  // (the Status type above) make it impossible to be e.g. "loading and
  // success at the same time" — the compiler enforces one state at a time.
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // useCallback memoizes the function so re-renders don't create new
  // function references. Important for child components that use it as a
  // prop — without this they'd re-render every time the parent does.
  const onSubmit = useCallback(async (address: string) => {
    setStatus({ kind: "loading", address });
    // Reflect the current address in the URL so the page is bookmarkable
    // and shareable. replaceState (vs pushState) avoids piling up
    // browser-history entries every time the user pre-screens a new
    // address — back button still works to leave the app.
    const url = new URL(window.location.href);
    url.searchParams.set(ADDRESS_PARAM, address);
    window.history.replaceState({}, "", url.toString());
    try {
      const result = await prescreenAddress(address);
      setStatus({ kind: "success", result });
    } catch (err) {
      // err is `unknown` in TypeScript (the catch parameter). Narrow it
      // before reading .message so a non-Error throwable doesn't crash us.
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", address, message });
    }
  }, []);

  // On first mount, if the URL already carries an address (someone opened
  // a shared link or returned to a bookmark), auto-submit it. useRef +
  // the flag inside the effect guards against double-firing under React
  // StrictMode (which intentionally invokes effects twice in dev).
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <h1 className="text-lg sm:text-xl font-semibold text-stone-900">
            Mt. Pleasant Streatery Pre-Screener
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Check if a DC address can support a parking-lane streatery under
            the permanent program (DDOT, December 2024).
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 flex-1 grid gap-4 sm:gap-6 md:grid-cols-[20rem_1fr]">
        <aside>
          <AddressForm
            onSubmit={onSubmit}
            isSubmitting={status.kind === "loading"}
          />
        </aside>

        <section>
          {status.kind === "idle" && <EmptyState />}
          {status.kind === "loading" && <LoadingState address={status.address} />}
          {status.kind === "error" && (
            <ErrorState address={status.address} message={status.message} />
          )}
          {status.kind === "success" && <ResultPanel result={status.result} />}
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-xs text-stone-500">
          Advisory only. Not a substitute for a site walk, an architect, or PE
          review.
        </div>
      </footer>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="h-full min-h-48 flex items-center justify-center text-stone-500 text-sm border-2 border-dashed border-stone-200 rounded-lg p-6 sm:p-12 text-center">
      Enter a Mt. Pleasant address to start.
    </div>
  );
}

function LoadingState({ address }: { address: string }): React.ReactElement {
  return (
    <div className="h-full min-h-48 flex flex-col items-center justify-center text-stone-600 text-sm rounded-lg border border-stone-200 bg-white p-6 sm:p-12 gap-3 text-center">
      <div className="animate-pulse text-stone-400">Checking...</div>
      <div className="font-mono text-xs break-all">{address}</div>
      <div className="text-xs text-stone-500 mt-2">
        Geocoding + 9 parallel curbside fetches (~2 seconds)
      </div>
    </div>
  );
}

function ErrorState({
  address,
  message,
}: {
  address: string;
  message: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-red-800 font-semibold mb-2">
        Couldn't pre-screen that address
      </h2>
      <p className="text-sm text-red-700 mb-4 font-mono">{address}</p>
      <pre className="text-xs text-red-700 whitespace-pre-wrap">{message}</pre>
    </div>
  );
}
