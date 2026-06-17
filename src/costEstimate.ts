/**
 * Ballpark cost estimator.
 *
 * The pre-screener answers "can a streatery be built here, and how big?".
 * This module answers the very next question every operator asks: "and what
 * will it cost me?". It is deliberately a ballpark — the construction figure
 * alone swings 5x depending on design — so the goal is an honest order of
 * magnitude, not a quote.
 *
 * Design notes for future-me:
 *  - This module returns NUMBERS ONLY. All currency formatting ("$5,000")
 *    happens in the UI. Keeping the data layer free of presentation means
 *    the same numbers can feed a PDF, a CSV export, or a test assertion
 *    without re-parsing strings.
 *  - Every dollar figure traces to the Fees table in CLAUDE.md (DDOT
 *    Streatery Guidelines, Dec 2024) or the project's coordinated-cohort
 *    context. The source is named in a comment next to each constant so the
 *    numbers can be re-verified when the draft rulemaking is finalized.
 */

import type { BuildableEnvelope } from "./envelope.js";

// ---------- Fee constants (all USD) ----------
// Each is annotated with where the number comes from. When DDOT finalizes
// the rulemaking, these are the only lines that need to change.

/** Public space rental, charged on the occupied footprint, every year.
 *  CLAUDE.md: "~$20/sq ft annually — per draft rulemaking; pending final
 *  adoption." This is the one fee that scales with the streatery's size. */
const PUBLIC_SPACE_RENT_PER_SQFT_USD = 20;

/** Streatery Design Permit — DDOT, one-time. Same fee as a sidewalk cafe. */
const DESIGN_PERMIT_USD = 260;

/** Building Permit — DOB, one-time. CLAUDE.md gives a $200–$500+ range. */
const BUILDING_PERMIT_LOW_USD = 200;
const BUILDING_PERMIT_HIGH_USD = 500;

/** Architect / design fee — one-time. NOT a permit fee, and the single most
 *  forgotten line because people fold it into "construction". The low end is
 *  the District Bridges coordinated-cohort rate (~$5K); the high end is going
 *  it alone (~$10K). Source: project context in CLAUDE.md. */
const DESIGN_FEE_COHORT_USD = 5_000;
const DESIGN_FEE_SOLO_USD = 10_000;

/** Construction — one-time, operator-borne. Platform, barriers, decking,
 *  drainage, electrical. CLAUDE.md gives $10K–$50K+; it varies enormously
 *  with the design, so we carry the full range rather than pretend precision. */
const CONSTRUCTION_LOW_USD = 10_000;
const CONSTRUCTION_HIGH_USD = 50_000;

/** Streatery Endorsement (alcohol) — ABCA, annual. Only applies if the
 *  restaurant serves alcohol, so it's a conditional line, never in the total. */
const ALCOHOL_ENDORSEMENT_ANNUAL_USD = 100;

// ---------- Types ----------

/**
 * One line in the cost breakdown.
 *
 * `lowUsd`/`highUsd` are null when we deliberately decline to put a number on
 * an item (e.g. insurance — DC's Office of Risk Management doesn't publish the
 * required amounts). A null-priced line still appears in the breakdown as a
 * "plan for this" reminder, it just shows "—" instead of a figure.
 */
export interface CostLineItem {
  label: string;
  lowUsd: number | null;
  highUsd: number | null;
  /** Short clarifying note shown under the label in the UI. */
  note?: string;
  /**
   * True for lines we list but exclude from the totals — either because they
   * are conditional (alcohol endorsement) or because we can't price them
   * (insurance, upkeep). Keeps the headline total honest while still warning
   * the operator the item exists.
   */
  excludedFromTotal?: boolean;
}

export interface CostEstimate {
  /** The occupied footprint the annual rent is charged on, in square feet.
   *  This is the full length x width the streatery occupies — NOT the usable
   *  seating area, which is smaller after deducting barriers and tree pits.
   *  DDOT charges for the public space you take, not what you can seat. */
  footprintSqFt: number;
  oneTime: CostLineItem[];
  annual: CostLineItem[];
  // Totals are the sum of the priced, non-excluded lines in each group.
  oneTimeTotalLowUsd: number;
  oneTimeTotalHighUsd: number;
  annualTotalLowUsd: number;
  annualTotalHighUsd: number;
}

// ---------- Estimator ----------

/**
 * Build a ballpark cost estimate for a streatery occupying the given envelope.
 *
 * The only size-dependent figure is the annual public-space rent (footprint x
 * $/sq ft); everything else is a flat fee or a design-dependent range that the
 * pre-screener can't narrow further without an actual design.
 */
export function estimateCost(envelope: BuildableEnvelope): CostEstimate {
  // Footprint = the strip the streatery physically occupies. Round to a whole
  // square foot — sub-foot precision is false precision on a ballpark.
  const footprintSqFt = Math.round(envelope.lengthFt * envelope.widthFt);

  // Annual rent is a point estimate (low === high): the rate is a single
  // number, only the footprint varies, and we already know the footprint.
  const annualRentUsd = Math.round(footprintSqFt * PUBLIC_SPACE_RENT_PER_SQFT_USD);

  // --- One-time costs (to get built) ---
  const oneTime: CostLineItem[] = [
    {
      label: "Streatery Design Permit",
      lowUsd: DESIGN_PERMIT_USD,
      highUsd: DESIGN_PERMIT_USD,
      note: "DDOT — one-time filing fee (same as a sidewalk cafe)",
    },
    {
      label: "Building Permit",
      lowUsd: BUILDING_PERMIT_LOW_USD,
      highUsd: BUILDING_PERMIT_HIGH_USD,
      note: "DOB — varies with the structure",
    },
    {
      label: "Architect & design fee",
      lowUsd: DESIGN_FEE_COHORT_USD,
      highUsd: DESIGN_FEE_SOLO_USD,
      note: "~$5K in the District Bridges coordinated cohort; ~$10K going it alone",
    },
    {
      label: "Construction",
      lowUsd: CONSTRUCTION_LOW_USD,
      highUsd: CONSTRUCTION_HIGH_USD,
      note: "Platform, barriers, decking, drainage — swings widely with the design",
    },
  ];

  // --- Annual costs (to keep operating) ---
  const annual: CostLineItem[] = [
    {
      label: "Public space rent",
      lowUsd: annualRentUsd,
      highUsd: annualRentUsd,
      note: `~$${PUBLIC_SPACE_RENT_PER_SQFT_USD}/sq ft on the ~${footprintSqFt} sq ft footprint (draft rulemaking — pending final adoption)`,
    },
    {
      // Required annually, but DC doesn't publish a set fee — nominal filing.
      label: "Certificate of Use renewal",
      lowUsd: null,
      highUsd: null,
      note: "DOB — required every year; nominal filing fee",
      excludedFromTotal: true,
    },
    {
      // The most-forgotten recurring cost. ORM mandates coverage but the
      // Guidelines don't publish amounts, so we flag it rather than invent one.
      label: "Liability insurance",
      lowUsd: null,
      highUsd: null,
      note: "Required by DC's Office of Risk Management; amount not published — budget a few hundred to low thousands per year",
      excludedFromTotal: true,
    },
    {
      label: "Upkeep & winterization",
      lowUsd: null,
      highUsd: null,
      note: "Cleaning, repairs, snow/ice removal, keeping the curb drainage clear — operator-borne",
      excludedFromTotal: true,
    },
    {
      label: "Propane heater permit",
      lowUsd: null,
      highUsd: null,
      note: "FEMS — only if you use heaters; nominal",
      excludedFromTotal: true,
    },
    {
      label: "Alcohol endorsement",
      lowUsd: ALCOHOL_ENDORSEMENT_ANNUAL_USD,
      highUsd: ALCOHOL_ENDORSEMENT_ANNUAL_USD,
      note: "ABCA — only if you serve alcohol outdoors",
      excludedFromTotal: true,
    },
  ];

  return {
    footprintSqFt,
    oneTime,
    annual,
    oneTimeTotalLowUsd: sumLow(oneTime),
    oneTimeTotalHighUsd: sumHigh(oneTime),
    annualTotalLowUsd: sumLow(annual),
    annualTotalHighUsd: sumHigh(annual),
  };
}

// ---------- Total helpers ----------
// Sum only the priced lines that count toward the total. The same
// filter/reduce pattern you'll see throughout this codebase: drop the rows
// that don't qualify, then add up the rest.

function sumLow(items: CostLineItem[]): number {
  return items
    .filter((item) => item.lowUsd != null && !item.excludedFromTotal)
    .reduce((total, item) => total + (item.lowUsd ?? 0), 0);
}

function sumHigh(items: CostLineItem[]): number {
  return items
    .filter((item) => item.highUsd != null && !item.excludedFromTotal)
    .reduce((total, item) => total + (item.highUsd ?? 0), 0);
}
