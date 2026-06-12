/**
 * Address input with example chips.
 *
 * General-audience redesign: the old version organized quick picks by
 * District Bridges cohort ("Initial cohort", "Second wave") — insider
 * framing that meant nothing to a citizen or journalist. Examples are
 * now a single row of neighborhood restaurant chips: still one-click
 * for returning operators, but they read as "try it" invitations.
 */
import { useState } from "react";

interface ExamplePick {
  label: string;
  address: string;
}

// Mt. Pleasant restaurants, ordered by street number so the row reads
// geographically along the corridor. The Lamont St entry exercises the
// cross-street (E-W) code path and shows users it's not just one street.
const EXAMPLES: ExamplePick[] = [
  { label: "Suns Cinema", address: "3107 Mount Pleasant Street NW" },
  { label: "Martha Dear", address: "3110 Mount Pleasant Street NW" },
  { label: "Purple Patch", address: "3155 Mount Pleasant Street NW" },
  { label: "Beau Thai", address: "3162 Mount Pleasant Street NW" },
  { label: "Marx Cafe", address: "3203 Mount Pleasant Street NW" },
  { label: "La Tejana", address: "3211 Mount Pleasant Street NW" },
  { label: "Joia Burger", address: "3213 Mount Pleasant Street NW" },
  { label: "Ellē", address: "3221 Mount Pleasant Street NW" },
  { label: "1620 Lamont St", address: "1620 Lamont Street NW" },
];

interface AddressFormProps {
  onSubmit: (address: string) => void;
  isSubmitting: boolean;
  /** Show the example chips (landing only — once a result is up, the
      compact search row is enough). */
  showExamples: boolean;
}

export function AddressForm({
  onSubmit,
  isSubmitting,
  showExamples,
}: AddressFormProps): React.ReactElement {
  const [value, setValue] = useState("");

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  const handleExample = (address: string): void => {
    setValue(address);
    onSubmit(address);
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="sm:flex sm:gap-2 space-y-2 sm:space-y-0">
        <label htmlFor="address-input" className="sr-only">
          Mt. Pleasant address
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
          className="w-full sm:flex-1 px-3.5 py-3 text-base sm:text-sm bg-vellum border border-rule rounded-xs placeholder:text-graphite-faint focus:outline-none focus:ring-2 focus:ring-brick/40 focus:border-brick disabled:bg-wash disabled:text-graphite-faint"
        />
        <button
          type="submit"
          disabled={isSubmitting || value.trim().length === 0}
          // py-3 keeps the touch target above ~44px on mobile — Apple's
          // recommended minimum for finger taps.
          className="w-full sm:w-auto px-5 py-3 text-sm font-semibold text-vellum bg-brick rounded-xs hover:bg-brick-deep disabled:bg-graphite-faint disabled:cursor-not-allowed transition-colors duration-150"
        >
          {isSubmitting ? "Checking..." : "Check this address"}
        </button>
      </form>

      {showExamples && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-faint mb-2">
            Or try a neighborhood restaurant
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((pick) => (
              <li key={pick.address}>
                <button
                  type="button"
                  onClick={() => handleExample(pick.address)}
                  disabled={isSubmitting}
                  title={pick.address}
                  className="px-3 py-1.5 text-sm text-graphite bg-vellum border border-hairline rounded-xs hover:border-rule hover:bg-wash active:bg-wash disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {pick.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
