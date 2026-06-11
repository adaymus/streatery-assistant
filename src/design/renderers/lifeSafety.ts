/**
 * G2.00 — Life Safety + Accessibility sheet.
 *
 * The Queen's English G2.00 pattern: a seating-layout plan of the
 * platform with the capacity calculation, the §4.8 ADA table called
 * out, and the egress path to the public way. The cluster arrangement
 * comes from the seating solver (seatingLayout.ts) and mirrors DDOT's
 * own §4.2 diagrams (a row of round 4-tops at 1 seat / 15 SF); it's a
 * DRAFT proving the capacity fits — operators will move furniture.
 *
 * Same plan orientation as the site plan: sidewalk at the top (entry
 * arrow up), street at the bottom, structure-local stations on x.
 */

import { computeSeatingLayout } from "../seatingLayout.js";
import { sheetTitleForView } from "../sheetIndex.js";
import {
  JERSEY_BARRIER_LABEL,
  SEATING_SETBACK_FT,
  SEATING_SF_PER_SEAT,
} from "../templateConstants.js";
import type { StreateryDesign } from "../types.js";
import { escapeXml, ftIn, horizontalDim, leaderLabel } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

const TABLE_RADIUS_FT = 1.1;
const CHAIR_RADIUS_FT = 0.55;

export function buildLifeSafetySvg(design: StreateryDesign): string {
  const L = design.platform.lengthFt;
  const W = design.platform.widthFt;
  const seating = computeSeatingLayout(design);
  const el: string[] = [];

  el.push(
    `<text x="0" y="-7" font-size="1.6" font-family="sans-serif" font-weight="700" fill="#1c1917">LIFE SAFETY + ACCESSIBILITY — SEATING PLAN</text>`,
  );

  // ---------- Platform with structure elements (schematic plan) ----------

  el.push(
    // Sidewalk strip above the platform, for the entry arrow to land on.
    `<rect x="-3" y="-4" width="${L + 6}" height="4" fill="#f5f5f4" />`,
    `<text x="${L + 2}" y="-1.6" font-size="0.9" font-family="sans-serif" text-anchor="end" fill="#78716c">SIDEWALK</text>`,
    `<rect x="0" y="0" width="${L}" height="${W}" fill="#ffffff" stroke="#1c1917" stroke-width="0.2" />`,
  );

  // Barrier run, hatched.
  const jb = design.jerseyBarrier.segment;
  el.push(
    `<rect x="${jb.startFt}" y="0" width="${jb.endFt - jb.startFt}" height="${W}" fill="#e7e5e4" stroke="#1c1917" stroke-width="0.12" />`,
  );
  for (let x = jb.startFt + 0.8; x < jb.endFt; x += 1.2) {
    el.push(
      `<line x1="${x}" y1="${W}" x2="${Math.min(x + 1.4, jb.endFt)}" y2="0" stroke="#a8a29e" stroke-width="0.06" />`,
    );
  }

  // Tree openings.
  for (const tree of design.trees) {
    el.push(
      `<circle cx="${tree.stationFt}" cy="0" r="${tree.clearanceRadiusFt}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
  }

  // Entry: gap in the sidewalk edge + arrow OUT (the egress direction).
  const entryX = design.entry.stationFt;
  const entryHalf = design.entry.widthFt / 2;
  el.push(
    `<line x1="${entryX - entryHalf}" y1="0" x2="${entryX + entryHalf}" y2="0" stroke="#ffffff" stroke-width="0.28" />`,
    `<line x1="${entryX}" y1="1" x2="${entryX}" y2="-2.6" stroke="#1c1917" stroke-width="0.12" />`,
    `<polygon points="${entryX},-3.4 ${entryX - 0.7},-2.2 ${entryX + 0.7},-2.2" fill="#1c1917" />`,
    `<text x="${entryX + 1}" y="-2.6" font-size="0.85" font-family="sans-serif" fill="#1c1917">${ftIn(design.entry.widthFt)} CLR EXIT TO PUBLIC WAY</text>`,
  );

  // ---------- Seating clusters ----------

  el.push(`<g id="seating">`);
  const cy = W / 2;
  for (const cluster of seating.clusters) {
    const cx = cluster.stationFt;
    if (cluster.isAda) {
      // ADA table drawn square (it's a different table) + the §4.8
      // 30"×48" clear floor space on the aisle side, dashed.
      el.push(
        `<rect x="${cx - 1.1}" y="${cy - 1.1}" width="2.2" height="2.2" fill="#ffffff" stroke="#1c1917" stroke-width="0.12" />`,
        `<text x="${cx}" y="${cy + 0.35}" font-size="0.8" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">ADA</text>`,
        `<rect x="${cx - 1.25}" y="${cy - 1.1 - 2.5}" width="2.5" height="2.5" fill="none" stroke="#1c1917" stroke-width="0.08" stroke-dasharray="0.5,0.35" />`,
      );
    } else {
      el.push(
        `<circle cx="${cx}" cy="${cy}" r="${TABLE_RADIUS_FT}" fill="#ffffff" stroke="#1c1917" stroke-width="0.12" />`,
      );
    }
    // Chairs around the table — as many as the cluster seats.
    const chairAngles = [225, 315, 135, 45]; // fill street side first
    for (let i = 0; i < cluster.seats; i++) {
      const rad = (chairAngles[i]! * Math.PI) / 180;
      const r = TABLE_RADIUS_FT + CHAIR_RADIUS_FT + 0.25;
      el.push(
        `<circle cx="${cx + r * Math.cos(rad)}" cy="${cy + r * Math.sin(rad)}" r="${CHAIR_RADIUS_FT}" fill="#f5f5f4" stroke="#57534e" stroke-width="0.08" />`,
      );
    }
  }
  el.push(`</g>`);

  // ---------- Egress path (dashed, farthest seat → entry → out) ----------

  if (seating.egress) {
    const fromX = seating.egress.fromStationFt;
    el.push(
      `<polyline points="${fromX},${cy} ${entryX},${cy} ${entryX},-1.5" fill="none" stroke="#1c1917" stroke-width="0.1" stroke-dasharray="0.9,0.6" />`,
      `<circle cx="${fromX}" cy="${cy}" r="0.25" fill="#1c1917" />`,
      `<text x="${(fromX + entryX) / 2}" y="${cy - 1.7}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#1c1917">EGRESS ≈ ${ftIn(seating.egress.travelFt)}</text>`,
    );
  }

  // ---------- Dimensions + callouts ----------

  el.push(horizontalDim(0, L, W + 2.5, W, ftIn(L)));
  el.push(
    leaderLabel(
      L + 3,
      W / 2,
      jb.startFt + (jb.endFt - jb.startFt) / 2,
      W / 2 - 1,
      JERSEY_BARRIER_LABEL,
    ),
  );

  // ---------- Occupant load table ----------

  const tableX = 0;
  let tableY = W + 6;
  const occupantRows: Array<[string, string]> = [
    ["PLATFORM AREA", `${Math.round(L * W)} SF (${ftIn(L)} × ${ftIn(W)})`],
    ["USABLE AREA (structures deducted)", `${design.seating.areaSf} SF`],
    ["OCCUPANCY FACTOR (§4.8)", `1 SEAT / ${SEATING_SF_PER_SEAT} SF`],
    ["MAXIMUM SEATING CAPACITY", `${design.seating.capacity}`],
    ["SEATS SHOWN THIS PLAN", `${seating.seatsShown}`],
    ["ADA TABLES (§4.8)", seating.clusters.some((c) => c.isAda) ? "1" : "0 — NO TABLE FITS; ARCHITECT REVIEW"],
  ];
  el.push(
    `<text x="${tableX}" y="${tableY}" font-size="1.15" font-family="sans-serif" font-weight="700" fill="#1c1917">OCCUPANT LOAD</text>`,
  );
  tableY += 1.7;
  for (const [label, value] of occupantRows) {
    el.push(
      `<text x="${tableX}" y="${tableY}" font-size="0.95" font-family="sans-serif" fill="#44403c">${escapeXml(label)}</text>`,
      `<text x="${tableX + 34}" y="${tableY}" font-size="0.95" font-family="sans-serif" font-weight="700" fill="#1c1917">${escapeXml(value)}</text>`,
    );
    tableY += 1.45;
  }

  // §4.8 accessibility callouts — the requirements the drawn layout
  // must satisfy, stated where the inspector will look for them.
  tableY += 1.2;
  const callouts = [
    `ADA TABLE: 28"-34" surface height, 27" knee clearance, 30"×48" clear floor space (dashed), on an accessible route (§4.8).`,
    `All seating ${SEATING_SETBACK_FT} ft clear of barriers and enclosure (§4.8). Seating layout is a draft capacity proof — final furniture by operator.`,
    `Entry ≥ 36" clear, no vertical protrusions; platform flush with sidewalk, max 1/2" gap (§4.4).`,
  ];
  el.push(
    `<text x="${tableX}" y="${tableY}" font-size="1.15" font-family="sans-serif" font-weight="700" fill="#1c1917">ACCESSIBILITY</text>`,
  );
  tableY += 1.7;
  for (const callout of callouts) {
    el.push(
      `<text x="${tableX}" y="${tableY}" font-size="0.9" font-family="sans-serif" fill="#44403c">${escapeXml(callout)}</text>`,
    );
    tableY += 1.4;
  }

  return composeSheet(
    {
      viewTitle: sheetTitleForView("life-safety"),
      design,
      sheetMinX: -4,
      sheetMaxX: Math.max(L + 8, 78),
      sheetMinY: -14,
      contentBottomY: tableY + 1,
      watermarkCenter: { x: L / 2, y: W / 2 },
      hideNotesBand: true,
    },
    el,
  );
}
