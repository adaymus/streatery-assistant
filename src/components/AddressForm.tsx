/**
 * Address input with quick-pick buttons for the cohort restaurants the
 * tool was built for. Quick picks let Mitra and other testers click
 * through known-good addresses without typing.
 */
import { useState } from "react";

interface QuickPick {
  label: string;
  address: string;
  note?: string;
}

// Initial cohort + cross-street test from the project context. Expand as
// more restaurants join the rollout.
const QUICK_PICKS: QuickPick[] = [
  {
    label: "Martha Dear",
    address: "3110 Mount Pleasant Street NW",
    note: "Initial cohort",
  },
  {
    label: "Purple Patch",
    address: "3155 Mount Pleasant Street NW",
    note: "Initial cohort",
  },
  {
    label: "1620 Lamont St NW",
    address: "1620 Lamont Street NW",
    note: "Cross-street test",
  },
];

interface AddressFormProps {
  onSubmit: (address: string) => void;
  isSubmitting: boolean;
}

export function AddressForm({
  onSubmit,
  isSubmitting,
}: AddressFormProps): React.ReactElement {
  const [value, setValue] = useState("");

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  const handleQuickPick = (address: string): void => {
    setValue(address);
    onSubmit(address);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-2">
        <label
          htmlFor="address-input"
          className="block text-sm font-medium text-stone-700"
        >
          Address
        </label>
        <input
          id="address-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="3110 Mount Pleasant Street NW"
          disabled={isSubmitting}
          autoComplete="street-address"
          autoCapitalize="words"
          // text-base (16px) on mobile prevents iOS Safari from zooming on
          // focus. text-sm is fine on desktop where there's no zoom behavior.
          className="w-full px-3 py-2.5 text-base sm:text-sm border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400 disabled:bg-stone-100"
        />
        <button
          type="submit"
          disabled={isSubmitting || value.trim().length === 0}
          // py-3 on mobile bumps the touch target above ~44px — Apple's
          // recommended minimum for finger taps. Stays compact on desktop
          // where pointer precision is higher.
          className="w-full px-4 py-3 sm:py-2 text-sm font-medium text-white bg-stone-800 rounded-md hover:bg-stone-900 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Checking..." : "Pre-screen"}
        </button>
      </form>

      <div>
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
          Quick picks
        </h3>
        <ul className="space-y-1">
          {QUICK_PICKS.map((pick) => (
            <li key={pick.address}>
              <button
                type="button"
                onClick={() => handleQuickPick(pick.address)}
                disabled={isSubmitting}
                className="w-full text-left px-3 py-3 sm:py-2 text-sm rounded-md hover:bg-stone-100 active:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <div className="font-medium text-stone-800">{pick.label}</div>
                <div className="text-xs text-stone-500 font-mono">
                  {pick.address}
                </div>
                {pick.note && (
                  <div className="text-xs text-stone-400 mt-0.5">
                    {pick.note}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
