/**
 * Top-level app. Owns the form-submit / result state and renders the
 * left-side controls and the right-side result panel.
 */
import { useCallback, useState } from "react";

import { prescreenAddress, type PrescreenResult } from "./prescreen.js";
import { AddressForm } from "./components/AddressForm.js";
import { ResultPanel } from "./components/ResultPanel.js";

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-xl font-semibold text-stone-900">
            Mt. Pleasant Streatery Pre-Screener
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Check if a DC address can support a parking-lane streatery under
            the permanent program (DDOT, December 2024).
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-6 py-6 flex-1 grid gap-6 md:grid-cols-[20rem_1fr]">
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
        <div className="max-w-6xl mx-auto px-6 py-3 text-xs text-stone-500">
          Advisory only. Not a substitute for a site walk, an architect, or PE
          review.
        </div>
      </footer>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="h-full flex items-center justify-center text-stone-500 text-sm border-2 border-dashed border-stone-200 rounded-lg p-12">
      Enter a Mt. Pleasant address to start.
    </div>
  );
}

function LoadingState({ address }: { address: string }): React.ReactElement {
  return (
    <div className="h-full flex flex-col items-center justify-center text-stone-600 text-sm rounded-lg border border-stone-200 bg-white p-12 gap-3">
      <div className="animate-pulse text-stone-400">Checking...</div>
      <div className="font-mono text-xs">{address}</div>
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
