/**
 * Seating layout solver for the G2.00 life-safety sheet.
 *
 * Follows DDOT's OWN seating depiction: the §4.2 plan diagrams show a
 * single row of round 4-seat table clusters at 1 seat / 15 SF. We place
 * the same clusters along the platform, skipping everything a chair
 * can't occupy (barrier run, entry clear zone, tree openings, the §4.8
 * 1 ft setback from barriers/enclosure), and cap total seats at the
 * §4.8 capacity the layout solver already computed.
 *
 * Pure geometry, like layout.ts — no fetching, no SVG — so it's
 * unit-testable with hand-built designs. The drawn layout is a DRAFT
 * arrangement proving capacity fits; the operator/architect will move
 * furniture.
 */

import { SEATING_SETBACK_FT } from "./templateConstants.js";
import type { StreateryDesign } from "./types.js";

/** Round table + 4 chairs needs about this much platform length. */
export const CLUSTER_FT = 4;
/** Clear space between adjacent clusters. */
export const CLUSTER_GAP_FT = 1;

export interface SeatingCluster {
  /** Structure-local station of the table center, feet. */
  stationFt: number;
  /** Seats at this table (4, except a possibly-smaller last table). */
  seats: number;
  /** The §4.8 ADA table — the cluster closest to the entry. */
  isAda: boolean;
}

export interface SeatingLayoutResult {
  clusters: SeatingCluster[];
  seatsShown: number;
  /**
   * Egress: from the farthest cluster to the entry, then out. Length
   * approximates the worst-case travel distance to the public way.
   */
  egress: { fromStationFt: number; travelFt: number } | null;
}

export function computeSeatingLayout(
  design: StreateryDesign,
): SeatingLayoutResult {
  const L = design.platform.lengthFt;
  const capacity = design.seating.capacity;

  // ---------- 1. Where a table CAN'T go (structure-local intervals) ----------

  const forbidden: Array<[number, number]> = [
    // §4.8 setback from the end enclosures.
    [0, SEATING_SETBACK_FT],
    [L - SEATING_SETBACK_FT, L],
    // The barrier run plus setback.
    [
      design.jerseyBarrier.segment.startFt - SEATING_SETBACK_FT,
      design.jerseyBarrier.segment.endFt + SEATING_SETBACK_FT,
    ],
    // Keep the entry's clear width truly clear (§4.4).
    [
      design.entry.stationFt - design.entry.widthFt / 2 - 0.5,
      design.entry.stationFt + design.entry.widthFt / 2 + 0.5,
    ],
    // Tree openings plus a little working room.
    ...design.trees.map(
      (t): [number, number] => [
        t.stationFt - t.clearanceRadiusFt - 0.75,
        t.stationFt + t.clearanceRadiusFt + 0.75,
      ],
    ),
  ];

  // Merge overlaps so the walk below sees clean gaps.
  forbidden.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of forbidden) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  // ---------- 2. Greedy cluster placement in each clear interval ----------

  const clusters: SeatingCluster[] = [];
  let cursor = 0;
  const intervals: Array<[number, number]> = [];
  for (const [start, end] of merged) {
    if (start > cursor) intervals.push([cursor, Math.min(start, L)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < L) intervals.push([cursor, L]);

  let seatsLeft = capacity;
  for (const [start, end] of intervals) {
    let x = start;
    while (x + CLUSTER_FT <= end && seatsLeft > 0) {
      const seats = Math.min(4, seatsLeft);
      clusters.push({ stationFt: x + CLUSTER_FT / 2, seats, isAda: false });
      seatsLeft -= seats;
      x += CLUSTER_FT + CLUSTER_GAP_FT;
    }
  }

  // ---------- 3. ADA table = the cluster nearest the entry (§4.8) ----------

  if (clusters.length > 0) {
    let nearest = clusters[0]!;
    for (const c of clusters) {
      if (
        Math.abs(c.stationFt - design.entry.stationFt) <
        Math.abs(nearest.stationFt - design.entry.stationFt)
      ) {
        nearest = c;
      }
    }
    nearest.isAda = true;
  }

  // ---------- 4. Worst-case egress travel ----------

  let egress: SeatingLayoutResult["egress"] = null;
  if (clusters.length > 0) {
    let farthest = clusters[0]!;
    for (const c of clusters) {
      if (
        Math.abs(c.stationFt - design.entry.stationFt) >
        Math.abs(farthest.stationFt - design.entry.stationFt)
      ) {
        farthest = c;
      }
    }
    egress = {
      fromStationFt: farthest.stationFt,
      // Along the platform to the entry, then across the deck to the
      // sidewalk — a straight-line approximation, generous vs reality.
      travelFt:
        Math.abs(farthest.stationFt - design.entry.stationFt) +
        design.platform.widthFt,
    };
  }

  return {
    clusters,
    seatsShown: clusters.reduce((sum, c) => sum + c.seats, 0),
    egress,
  };
}
