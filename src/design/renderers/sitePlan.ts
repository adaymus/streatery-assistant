/**
 * Site Plan renderer: StreateryDesign + SiteContext → SVG.
 *
 * The §5.2 item-1 sheet — the one Martha Dear's approved set was
 * strongest on (A100). Plan view of the block around the structure:
 * building façade with address, sidewalk, parking lane, travel lane,
 * every curb feature (meters BY NUMBER with removal flags — the thing
 * DDOT explicitly wants — hydrants, trees + tree boxes, driveways,
 * crosswalks), the proposed platform with dimensions, and setbacks to
 * both cross streets.
 *
 * Coordinate system: x = BLOCKFACE station (feet along the curb from
 * the low-measure cross street — the frame design.anchor points into),
 * y = signed offset from the curb face, SVG-down = into the street.
 * So the building reads at the top of the sheet, the travel lane at the
 * bottom, and the curb is the heavy line at y = 0. 1 SVG unit = 1 foot,
 * same as every other sheet in the set.
 *
 * The drawing WINDOWS the block to the structure ± context rather than
 * rendering all ~450 ft of a Mt Pleasant block — same move the approved
 * sets make. Setback dimensions carry the true distances to the
 * intersections even when the cross street itself is off-sheet.
 *
 * Replaces src/sitePlanMockup.ts in the v3 drawing pipeline (the
 * mockup renders from raw prescreen data and predates the design
 * model; it stays for the v1 web app until this renderer is wired in
 * everywhere).
 */

import {
  DRAINAGE_CHANNEL_FT,
  JERSEY_BARRIER_LABEL,
  POST_ACTUAL_IN,
  TRAVEL_SIDE_BUFFER_FT,
} from "../templateConstants.js";
import { evaluateNotes, sidewalkDepthFt } from "../notes/index.js";
import { sheetTitleForView } from "../sheetIndex.js";
import type { SiteContext, TreeOnPlan } from "../siteContext.js";
import type { RenderOptions, StreateryDesign } from "../types.js";
import { escapeXml, ftIn, horizontalDim, leaderLabel, verticalDim } from "./shared.js";
import { composeSheet } from "./sheetChrome.js";

// ---------- Sheet layout constants (drawing units = feet) ----------

/** Context shown on each side of the structure/frontage extent. */
const CONTEXT_FT = 40;
/** How much building depth to show beyond the façade before clipping. */
const BUILDING_DEPTH_SHOWN_FT = 22;
/** Fallback travel-lane width when the Roadway Block field is empty. */
const TRAVEL_LANE_FALLBACK_FT = 11;
/** Drawn bike-lane band height; DDOT width fields aren't surfaced yet. */
const BIKE_LANE_SHOWN_FT = 5;
/** Left margin holds the ROW dimension stack; right holds labels. */
const MARGIN_LEFT_FT = 14;
const MARGIN_RIGHT_FT = 14;

export function buildSitePlanSvg(
  design: StreateryDesign,
  site: SiteContext,
  opts?: RenderOptions,
): string {
  // Schematic: the proposed structure (footprint + dimensions) against
  // a bare curb/parking-lane reference and the building outline — none
  // of the existing curb features, ROW band fills, or context furniture
  // the full plan carries (see RenderOptions).
  const schematic = opts?.schematic ?? false;

  // ---------- Frame: where everything sits ----------

  const structStartFt = design.anchor.structureStartStationFt;
  const structEndFt = structStartFt + design.platform.lengthFt;
  const W = design.platform.widthFt;
  const blockLenFt = site.blockfaceLengthFt;

  // Structure-local station (what design stores) → blockface station (plan x).
  const bf = (structureLocalFt: number): number =>
    structStartFt + structureLocalFt;

  // The window: structure + frontage extent, padded with context, clamped
  // to the block. Cross streets render as edge lines when inside, and as
  // break lines + true-distance setback dims when outside.
  const winLow = Math.max(
    0,
    Math.min(structStartFt, site.frontage.startFt) - CONTEXT_FT,
  );
  const winHigh = Math.min(
    blockLenFt,
    Math.max(structEndFt, site.frontage.endFt) + CONTEXT_FT,
  );
  const lowIsIntersection = winLow <= 0.5;
  const highIsIntersection = winHigh >= blockLenFt - 0.5;

  // Vertical bands. Sidewalk depth prefers the MEASURED curb-to-façade
  // distance (what A100 dimensions) over DDOT's string field — the
  // derivation is shared with the notes library so the drawn band and
  // the provenance note can never disagree.
  const row = site.rightOfWay;
  const sidewalkBandFt = sidewalkDepthFt(row);
  const parkingFt = row.parkingLaneWidthFt;
  const bikeFt = row.hasBikeLane ? BIKE_LANE_SHOWN_FT : 0;
  const travelFt = row.travelLaneWidthEachFt ?? TRAVEL_LANE_FALLBACK_FT;
  const yFacade = -sidewalkBandFt;
  const yBikeTop = parkingFt;
  const yTravelTop = parkingFt + bikeFt;
  const yStreetBottom = yTravelTop + travelFt;
  const yBuildingTop = yFacade - BUILDING_DEPTH_SHOWN_FT;

  const sheetMinX = winLow - MARGIN_LEFT_FT;
  const sheetMaxX = winHigh + MARGIN_RIGHT_FT;
  const sheetMinY = yBuildingTop - 4;

  // Features outside the window don't render (their effect on the layout
  // already happened in the envelope/roof math).
  const inWindow = (stationFt: number): boolean =>
    stationFt >= winLow - 2 && stationFt <= winHigh + 2;

  const el: string[] = [];

  // ---------- 1. Right-of-way bands ----------

  const band = (
    yTop: number,
    height: number,
    fill: string,
  ): string =>
    `<rect x="${winLow}" y="${yTop}" width="${winHigh - winLow}" height="${height}" fill="${fill}" />`;

  el.push(`<g id="row-bands">`);
  if (!schematic) {
    el.push(band(yFacade, sidewalkBandFt, "#f5f5f4")); // sidewalk
    el.push(band(0, parkingFt, "#fefdfb")); // parking lane
    if (bikeFt > 0) el.push(band(yBikeTop, bikeFt, "#f5f5f4"));
    el.push(band(yTravelTop, travelFt, "#fafaf9")); // travel lane
  }
  // Curb: the heaviest line on the sheet, like both approved sets.
  // Kept in schematic — it's the reference the structure sits against.
  el.push(
    `<line x1="${winLow}" y1="0" x2="${winHigh}" y2="0" stroke="#1c1917" stroke-width="0.28" />`,
  );
  // Parking-lane outer edge (dashed). Schematic keeps just this one so
  // the lane the structure occupies still reads; the full set adds the
  // bike/travel lane lines too.
  el.push(
    `<line x1="${winLow}" y1="${yBikeTop}" x2="${winHigh}" y2="${yBikeTop}" stroke="#78716c" stroke-width="0.08" stroke-dasharray="2,1.5" />`,
  );
  if (!schematic) {
    if (bikeFt > 0) {
      el.push(
        `<line x1="${winLow}" y1="${yTravelTop}" x2="${winHigh}" y2="${yTravelTop}" stroke="#78716c" stroke-width="0.08" stroke-dasharray="2,1.5" />`,
      );
    }
    el.push(
      `<line x1="${winLow}" y1="${yStreetBottom}" x2="${winHigh}" y2="${yStreetBottom}" stroke="#a8a29e" stroke-width="0.06" stroke-dasharray="1,1" />`,
    );
  }
  el.push(`</g>`);

  // Band labels + traffic arrow are existing-context furniture, not
  // streatery dimensions — schematic omits both.
  if (!schematic) {
    // Band labels hug the right edge of the window, clear of the structure.
    const bandLabel = (y: number, text: string): string =>
      `<text x="${winHigh - 1}" y="${y}" font-size="1.0" font-family="sans-serif" text-anchor="end" fill="#57534e">${escapeXml(text)}</text>`;
    // The top band is curb-to-façade: on blocks with front yards (Mt
    // Pleasant's west side) it's wider than the paved sidewalk, so the
    // label says what was measured rather than claiming "sidewalk".
    el.push(`<g id="band-labels">`);
    el.push(
      bandLabel(
        yFacade + 1.6,
        row.facadeOffsetFt != null ? "EX. SIDEWALK / FRONTAGE ZONE" : "EX. SIDEWALK",
      ),
    );
    el.push(
      bandLabel(parkingFt - 0.6, `EX. ${ftIn(parkingFt)} PARKING LANE`),
    );
    if (bikeFt > 0) {
      el.push(bandLabel(yBikeTop + 1.6, "EX. BIKE LANE (WIDTH — VERIFY)"));
    }
    el.push(
      bandLabel(
        yTravelTop + 1.6,
        `EX. ${ftIn(travelFt)} TRAVEL LANE` +
          (row.travelLaneCount != null && row.travelLaneCount > 1
            ? ` (1 OF ${row.travelLaneCount})`
            : ""),
      ),
    );
    el.push(`</g>`);

    // Traffic direction arrow in the travel lane. The approach end is a
    // heuristic — design.notes already carries the site-walk confirm.
    const arrowY = yTravelTop + travelFt / 2;
    const arrowDir = design.anchor.vehicularApproachEnd === "low" ? 1 : -1;
    const arrowCx = (winLow + winHigh) / 2;
    el.push(
      `<g id="traffic-arrow">`,
      `<line x1="${arrowCx - arrowDir * 5}" y1="${arrowY}" x2="${arrowCx + arrowDir * 5}" y2="${arrowY}" stroke="#a8a29e" stroke-width="0.15" />`,
      `<polygon points="${arrowCx + arrowDir * 6.5},${arrowY} ${arrowCx + arrowDir * 5},${arrowY - 0.7} ${arrowCx + arrowDir * 5},${arrowY + 0.7}" fill="#a8a29e" />`,
      `<text x="${arrowCx}" y="${arrowY - 1}" font-size="0.9" font-family="sans-serif" text-anchor="middle" fill="#a8a29e">TRAFFIC (VERIFY)</text>`,
      `</g>`,
    );
  }

  // ---------- 2. Cross streets / break lines at the window edges ----------

  const crossStreetEdge = (x: number, name: string, anchorSide: 1 | -1): string =>
    [
      `<line x1="${x}" y1="${yBuildingTop}" x2="${x}" y2="${yStreetBottom}" stroke="#1c1917" stroke-width="0.14" />`,
      `<text x="${x + anchorSide * 1.4}" y="${(yBuildingTop + yStreetBottom) / 2}" font-size="1.2" font-family="sans-serif" font-weight="600" text-anchor="middle" fill="#1c1917" transform="rotate(-90 ${x + anchorSide * 1.4} ${(yBuildingTop + yStreetBottom) / 2})">${escapeXml(name)}</text>`,
    ].join("\n");

  // Standard drafting break symbol: a zigzag through the band stack,
  // saying "the street continues but the sheet stops here".
  const breakLine = (x: number): string => {
    const segments: string[] = [];
    const step = 3;
    for (let y = yBuildingTop; y < yStreetBottom; y += step) {
      const yMid = Math.min(y + step / 2, yStreetBottom);
      const yEnd = Math.min(y + step, yStreetBottom);
      segments.push(
        `<polyline points="${x},${y} ${x + 0.7},${yMid} ${x - 0.7},${(yMid + yEnd) / 2} ${x},${yEnd}" fill="none" stroke="#78716c" stroke-width="0.1" />`,
      );
    }
    return segments.join("\n");
  };

  // Schematic keeps the cross-street EDGE lines (they orient the block
  // and the setback dimensions name them) but drops the break-line
  // zigzags, which are pure drafting convention.
  el.push(`<g id="window-edges">`);
  if (lowIsIntersection) {
    el.push(crossStreetEdge(winLow, site.fromStreet, -1));
  } else if (!schematic) {
    el.push(breakLine(winLow));
  }
  if (highIsIntersection) {
    el.push(crossStreetEdge(winHigh, site.toStreet, 1));
  } else if (!schematic) {
    el.push(breakLine(winHigh));
  }
  el.push(`</g>`);

  // ---------- 3. Building footprint (clipped to its band) ----------
  // Real DC polygon when available; an explicit ASSUMED dashed box when
  // not. Clipped so a deep rowhouse doesn't double the sheet height —
  // the dashed top edge of the clip region reads "building continues".

  el.push(
    `<clipPath id="building-clip"><rect x="${winLow}" y="${yBuildingTop}" width="${winHigh - winLow}" height="${-yBuildingTop - 0.3}" /></clipPath>`,
  );
  el.push(`<g id="building" clip-path="url(#building-clip)">`);
  if (site.building.ring) {
    const points = site.building.ring
      .map((v) => `${v.stationFt.toFixed(2)},${v.offsetFt.toFixed(2)}`)
      .join(" ");
    el.push(
      `<polygon points="${points}" fill="${schematic ? "none" : "#e7e5e4"}" stroke="#44403c" stroke-width="0.14" />`,
    );
  } else {
    el.push(
      `<rect x="${site.frontage.startFt}" y="${yBuildingTop}" width="${site.frontage.endFt - site.frontage.startFt}" height="${BUILDING_DEPTH_SHOWN_FT}" fill="#e7e5e4" fill-opacity="0.5" stroke="#78716c" stroke-width="0.1" stroke-dasharray="1,0.7" />`,
    );
  }
  el.push(`</g>`);
  // Dashed line where the clip cuts the building: drafting "continues" cue.
  el.push(
    `<line x1="${winLow}" y1="${yBuildingTop}" x2="${winHigh}" y2="${yBuildingTop}" stroke="#a8a29e" stroke-width="0.06" stroke-dasharray="1.2,0.8" />`,
  );

  const buildingLabelX = (site.frontage.startFt + site.frontage.endFt) / 2;
  const buildingLabelY = yFacade - 4;
  el.push(
    `<text x="${buildingLabelX}" y="${buildingLabelY}" font-size="1.3" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">${escapeXml(design.businessName.toUpperCase())}</text>`,
    `<text x="${buildingLabelX}" y="${buildingLabelY + 1.6}" font-size="1.0" font-family="sans-serif" text-anchor="middle" fill="#44403c">${escapeXml(site.building.addressLabel)}</text>`,
  );
  // The footprint-provenance bracket is data-source detail; schematic drops it.
  if (!schematic) {
    el.push(
      `<text x="${buildingLabelX}" y="${buildingLabelY + 3.0}" font-size="0.8" font-family="sans-serif" font-style="italic" text-anchor="middle" fill="#78716c">${escapeXml(
        site.building.assumed
          ? "[FOOTPRINT ASSUMED — CONFIRM STOREFRONT]"
          : `[DC BUILDING FOOTPRINTS${site.building.captureLabel ? ", " + site.building.captureLabel : ""}]`,
      )}</text>`,
    );
  }

  // ---------- 4. Frontage window ----------
  // The legal extent the envelope was confined to. Ticks at both ends
  // plus a dimension string above the façade. An operator_override
  // frontage means a §4.1 consent extension — labeled as such.

  const frontageLabel =
    site.frontage.source === "building_footprint"
      ? `OWN FRONTAGE ${ftIn(site.frontage.endFt - site.frontage.startFt)}`
      : site.frontage.source === "operator_override"
        ? `FRONTAGE ${ftIn(site.frontage.endFt - site.frontage.startFt)} (§4.1 CONSENT EXT.)`
        : `FRONTAGE ${ftIn(site.frontage.endFt - site.frontage.startFt)} (ASSUMED)`;
  el.push(`<g id="frontage">`);
  for (const x of [site.frontage.startFt, site.frontage.endFt]) {
    el.push(
      `<line x1="${x}" y1="${yFacade}" x2="${x}" y2="0" stroke="#78716c" stroke-width="0.07" stroke-dasharray="0.8,0.5" />`,
    );
  }
  // The dim string sits IN the sidewalk band (between façade and curb)
  // — above the façade is building interior.
  el.push(
    horizontalDim(
      site.frontage.startFt,
      site.frontage.endFt,
      yFacade + 3,
      yFacade,
      frontageLabel,
    ),
  );
  el.push(`</g>`);

  // ---------- 5. The proposed structure ----------

  el.push(`<g id="structure">`);
  // Platform: the heavy proposed-work outline against light existing context.
  el.push(
    `<rect x="${structStartFt}" y="0" width="${design.platform.lengthFt}" height="${W}" fill="#ffffff" stroke="#1c1917" stroke-width="0.22" />`,
  );
  // Jersey barrier first, so the labels below can avoid its run. Drawn
  // rotated 45° since §4.2 wants it angled 45-60° inward at the
  // vehicular approach end; the center sits far enough inboard that the
  // rotated footprint stays on the platform. The elevation sheets carry
  // the exact treatment; the plan shows position + angle intent.
  const jb = design.jerseyBarrier;
  const jbLen = jb.segment.endFt - jb.segment.startFt;
  // Rotated half-extents at 45°: (L/2 + 1) / √2 ≈ 2.83 for the 6×2 barrier.
  const jbInset = (jbLen / 2 + 1) / Math.SQRT2 + 0.4;
  const jbCx =
    jb.atEnd === "low" ? structStartFt + jbInset : structEndFt - jbInset;
  const jbCy = W / 2;
  const angleDeg = jb.angledInward ? (jb.atEnd === "low" ? 45 : -45) : 0;
  el.push(
    `<g transform="rotate(${angleDeg} ${jbCx} ${jbCy})">`,
    `<rect x="${jbCx - jbLen / 2}" y="${jbCy - 1}" width="${jbLen}" height="2" fill="${schematic ? "none" : "#d6d3d1"}" stroke="#1c1917" stroke-width="0.14" />`,
    // Diagonal hatch — the concrete convention (full set only).
    ...(schematic
      ? []
      : Array.from({ length: 5 }, (_, i) => {
          const hx = jbCx - jbLen / 2 + (i + 0.5) * (jbLen / 5);
          return `<line x1="${hx - 0.7}" y1="${jbCy + 1}" x2="${hx + 0.7}" y2="${jbCy - 1}" stroke="#78716c" stroke-width="0.06" />`;
        })),
    `</g>`,
  );

  // Platform title: centered on the ENCLOSURE run (not the platform
  // midpoint) so the barrier never sits on the text.
  const enclosure = design.enclosureSegments[0];
  const titleCx = enclosure
    ? bf((enclosure.startFt + enclosure.endFt) / 2)
    : (structStartFt + structEndFt) / 2;
  el.push(
    `<text x="${titleCx}" y="${W / 2 + 0.4}" font-size="1.1" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">PROPOSED STREATERY ${ftIn(design.platform.lengthFt)} × ${ftIn(W)}</text>`,
  );

  // Drainage channel is a construction detail — full set only.
  if (!schematic) {
    // §4.6's 1 ft clear channel at the curb, below deck. Labeled in
    // place — a leader from outside would have to cross the structure.
    el.push(
      `<line x1="${structStartFt}" y1="${DRAINAGE_CHANNEL_FT}" x2="${structEndFt}" y2="${DRAINAGE_CHANNEL_FT}" stroke="#57534e" stroke-width="0.06" stroke-dasharray="0.6,0.4" />`,
      `<text x="${titleCx}" y="${DRAINAGE_CHANNEL_FT + 0.85}" font-size="0.7" font-family="sans-serif" text-anchor="middle" fill="#57534e">${ftIn(DRAINAGE_CHANNEL_FT)} DRAINAGE CHANNEL BELOW DECK (§4.6)</text>`,
    );
  }

  // Posts: pairs at both long edges (street + sidewalk), the layout the
  // elevations imply (same stations on both faces). Structure, not
  // finish — drawn in both modes so the plan agrees with the elevations
  // now that those show posts. Schematic uses open squares; the full set
  // fills them (and half-fills posts the solver shifted off a tree).
  const postFt = POST_ACTUAL_IN / 12;
  for (const post of design.posts) {
    const x = bf(post.stationFt);
    for (const yEdge of [postFt / 2 + 0.1, W - postFt / 2 - 0.1]) {
      const style = schematic
        ? 'fill="none" stroke="#1c1917" stroke-width="0.1"'
        : `fill="#1c1917"${post.shifted ? ' stroke="#1c1917" stroke-width="0.12" fill-opacity="0.5"' : ""}`;
      el.push(
        `<rect x="${x - postFt / 2}" y="${yEdge - postFt / 2}" width="${postFt}" height="${postFt}" ${style} />`,
      );
    }
  }

  // Entry: a real gap in the sidewalk edge with an access arrow. Kept in
  // schematic — it's a real opening and carries its clear-width dim.
  const entryX = bf(design.entry.stationFt);
  const entryHalf = design.entry.widthFt / 2;
  el.push(
    `<line x1="${entryX - entryHalf}" y1="0" x2="${entryX + entryHalf}" y2="0" stroke="#ffffff" stroke-width="0.3" />`,
    `<line x1="${entryX}" y1="-1.8" x2="${entryX}" y2="1.2" stroke="#1c1917" stroke-width="0.1" />`,
    `<polygon points="${entryX},1.9 ${entryX - 0.6},0.9 ${entryX + 0.6},0.9" fill="#1c1917" />`,
    `<text x="${entryX}" y="-2.4" font-size="0.9" font-family="sans-serif" text-anchor="middle" fill="#1c1917">${ftIn(design.entry.widthFt)} CLR ENTRY</text>`,
  );

  // Signage placards and the dashed roof-above outline are descriptive
  // overlays, not footprint dimensions — schematic omits both.
  if (!schematic) {
    // §4.7 signage placards on the sidewalk-facing edge.
    for (const stationFt of design.signageStationsFt) {
      el.push(
        `<rect x="${bf(stationFt) - 0.35}" y="-0.5" width="0.7" height="0.5" fill="#1c1917" />`,
      );
    }

    // Roof extent above, dashed (hidden-above convention).
    for (const seg of design.roofSegments) {
      el.push(
        `<rect x="${bf(seg.startFt)}" y="0" width="${seg.endFt - seg.startFt}" height="${W}" fill="none" stroke="#57534e" stroke-width="0.1" stroke-dasharray="1,0.6" />`,
        `<text x="${bf((seg.startFt + seg.endFt) / 2)}" y="${W - 0.5}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#57534e">ROOF ABOVE (DASHED)</text>`,
      );
    }
  }

  // Tree clearance cutouts in the platform (12" clear per UFD). Kept —
  // they're real shape in the footprint.
  for (const tree of design.trees) {
    const x = bf(tree.stationFt);
    el.push(
      `<circle cx="${x}" cy="0" r="${tree.clearanceRadiusFt}" fill="#f5f5f4" stroke="#1c1917" stroke-width="0.1" />`,
    );
  }
  el.push(`</g>`);

  // The §4.2 travel-side buffer between platform and lane edge.
  el.push(
    verticalDim(
      W,
      parkingFt,
      structEndFt + 3,
      structEndFt,
      `${ftIn(TRAVEL_SIDE_BUFFER_FT)} CLR`,
    ),
  );

  // ---------- 6. Existing curb features ----------
  // Meters, hydrants, trees, driveways, ramps, bus stops, loading
  // zones, crosswalks — all EXISTING context, not the streatery's
  // dimensions. Schematic drops the entire section. (Their effect on
  // the envelope already happened upstream in the buffer math.)

  if (!schematic) {
  el.push(`<g id="features">`);

  // Parking meters: the A100 signature item. Symbol + vertical ID label;
  // poles inside the structure run get the removal treatment. (The
  // removal test lives here, not in siteContext, because only the
  // resolved design knows the final structure extent.)
  const meterRemoved = (stationFt: number): boolean =>
    stationFt >= structStartFt && stationFt <= structEndFt;
  for (const meter of site.meters) {
    if (!inWindow(meter.stationFt)) continue;
    const removed = meterRemoved(meter.stationFt);
    const x = meter.stationFt;
    // Meters live on the sidewalk just behind the curb; clamp the drawn
    // offset so a noisy GPS point doesn't push the symbol into the façade.
    const y = Math.max(-sidewalkBandFt + 1, Math.min(meter.offsetFt, -0.6));
    el.push(
      `<circle cx="${x}" cy="${y}" r="0.55" fill="#ffffff" stroke="#1c1917" stroke-width="0.1" />`,
      `<text x="${x}" y="${y + 0.32}" font-size="0.8" font-family="sans-serif" text-anchor="middle" fill="#1c1917">M</text>`,
    );
    if (removed) {
      el.push(
        `<line x1="${x - 0.7}" y1="${y - 0.7}" x2="${x + 0.7}" y2="${y + 0.7}" stroke="#1c1917" stroke-width="0.12" />`,
        `<line x1="${x - 0.7}" y1="${y + 0.7}" x2="${x + 0.7}" y2="${y - 0.7}" stroke="#1c1917" stroke-width="0.12" />`,
      );
    }
    const idLabel = `${meter.meterId ?? "METER"}${removed ? " — REMOVE" : ""}`;
    el.push(
      `<text x="${x + 0.3}" y="${y - 1}" font-size="0.8" font-family="sans-serif" fill="#1c1917" transform="rotate(-90 ${x + 0.3} ${y - 1})">${escapeXml(idLabel)}</text>`,
    );
  }

  // Fire hydrants: square symbol — the 10 ft buffer already shaped the
  // envelope, so any hydrant here is necessarily outside the structure.
  for (const hyd of site.hydrants) {
    if (!inWindow(hyd.stationFt)) continue;
    const y = Math.max(-sidewalkBandFt + 1, Math.min(hyd.offsetFt, -0.6));
    el.push(
      `<rect x="${hyd.stationFt - 0.6}" y="${y - 0.6}" width="1.2" height="1.2" fill="#ffffff" stroke="#1c1917" stroke-width="0.12" />`,
      `<text x="${hyd.stationFt + 1}" y="${y - 1}" font-size="0.8" font-family="sans-serif" fill="#1c1917" transform="rotate(-90 ${hyd.stationFt + 1} ${y - 1})">EX. HYDRANT${hyd.assetNum ? " " + escapeXml(hyd.assetNum) : ""}</text>`,
    );
  }

  // Street trees: trunk + dashed canopy + tree box. §5.2 wants tree pits
  // shown (with photos — that's a note, not a drawing).
  for (const tree of site.trees) {
    if (!inWindow(tree.stationFt)) continue;
    el.push(treeSymbol(tree, sidewalkBandFt));
  }

  // Driveways and ADA ramps: triangles at the curb.
  const triangle = (x: number, y: number): string =>
    `<polygon points="${x},${y - 0.7} ${x - 0.7},${y + 0.5} ${x + 0.7},${y + 0.5}" fill="#ffffff" stroke="#1c1917" stroke-width="0.1" />`;
  for (const drv of site.driveways) {
    if (!inWindow(drv.stationFt)) continue;
    el.push(
      triangle(drv.stationFt, -1),
      `<text x="${drv.stationFt + 1}" y="-2" font-size="0.8" font-family="sans-serif" fill="#1c1917" transform="rotate(-90 ${drv.stationFt + 1} -2)">EX. DRIVEWAY / CURB CUT</text>`,
    );
  }
  for (const ramp of site.adaRamps) {
    if (!inWindow(ramp.stationFt)) continue;
    el.push(
      triangle(ramp.stationFt, -1),
      `<text x="${ramp.stationFt + 1}" y="-2" font-size="0.8" font-family="sans-serif" fill="#1c1917" transform="rotate(-90 ${ramp.stationFt + 1} -2)">EX. ADA RAMP</text>`,
    );
  }

  // Bus stops and loading zones: labeled squares at the curb.
  for (const stop of site.busStops) {
    if (!inWindow(stop.stationFt)) continue;
    el.push(
      `<rect x="${stop.stationFt - 0.8}" y="-1.8" width="1.6" height="1.6" fill="#ffffff" stroke="#1c1917" stroke-width="0.12" />`,
      `<text x="${stop.stationFt}" y="-0.65" font-size="0.6" font-family="sans-serif" text-anchor="middle" fill="#1c1917">BUS</text>`,
    );
  }
  for (const lz of site.loadingZones) {
    if (!inWindow(lz.stationFt)) continue;
    el.push(
      `<rect x="${lz.stationFt - 0.8}" y="-1.8" width="1.6" height="1.6" fill="#ffffff" stroke="#1c1917" stroke-width="0.12" />`,
      `<text x="${lz.stationFt}" y="-0.65" font-size="0.6" font-family="sans-serif" text-anchor="middle" fill="#1c1917">${escapeXml(lz.label)}</text>`,
    );
  }

  // Crosswalks: striped band across the roadway (the §3.4 10 ft ground
  // buffer and §4.3 25 ft roof buffer were already applied upstream).
  for (const xw of site.crosswalks) {
    if (!inWindow(xw.stationFt)) continue;
    const x0 = xw.stationFt - 3;
    el.push(`<g id="crosswalk-${Math.round(xw.stationFt)}">`);
    for (let i = 0; i < 6; i++) {
      el.push(
        `<rect x="${x0 + i}" y="0" width="0.55" height="${yStreetBottom}" fill="#d6d3d1" />`,
      );
    }
    el.push(
      `<text x="${xw.stationFt}" y="${yStreetBottom - 1}" font-size="0.85" font-family="sans-serif" text-anchor="middle" fill="#57534e">EX. CROSSWALK</text>`,
      `</g>`,
    );
  }
  el.push(`</g>`);
  } // end if (!schematic) — section 6

  // ---------- 7. Dimension strings ----------

  const dimRow1 = yStreetBottom + 2.5; // structure + setbacks
  el.push(`<g id="dimensions">`);

  // Structure length — the headline dimension.
  el.push(
    horizontalDim(
      structStartFt,
      structEndFt,
      dimRow1,
      W,
      ftIn(design.platform.lengthFt),
    ),
  );

  // Setbacks to the bounding intersections. The dimension label always
  // carries the TRUE distance to the cross street, even when the street
  // itself is beyond the window break.
  if (structStartFt > 0.5) {
    el.push(
      horizontalDim(
        winLow,
        structStartFt,
        dimRow1,
        W,
        `${ftIn(structStartFt)} TO ${site.fromStreet.toUpperCase()}${lowIsIntersection ? "" : " (OFF SHEET)"}`,
      ),
    );
  }
  if (structEndFt < blockLenFt - 0.5) {
    el.push(
      horizontalDim(
        structEndFt,
        winHigh,
        dimRow1,
        W,
        `${ftIn(blockLenFt - structEndFt)} TO ${site.toStreet.toUpperCase()}${highIsIntersection ? "" : " (OFF SHEET)"}`,
      ),
    );
  }

  // The ROW cross-section stack at the left edge — A100's signature
  // sidewalk/park/travel dimensions, here as a vertical string. Schematic
  // keeps only the PARKING-lane dim (the lane the structure occupies);
  // the sidewalk/bike/travel dims describe the street, not the streatery.
  const rowDimX = winLow - 3;
  if (!schematic) {
    el.push(
      verticalDim(
        yFacade,
        0,
        rowDimX,
        winLow,
        `${ftIn(sidewalkBandFt)} ${row.facadeOffsetFt != null ? "CURB-FAÇADE" : "SIDEWALK"}`,
      ),
    );
  }
  el.push(verticalDim(0, parkingFt, rowDimX, winLow, `${ftIn(parkingFt)} PARK`));
  if (!schematic) {
    if (bikeFt > 0) {
      el.push(verticalDim(yBikeTop, yTravelTop, rowDimX, winLow, `BIKE`));
    }
    el.push(
      verticalDim(yTravelTop, yStreetBottom, rowDimX, winLow, `${ftIn(travelFt)} TRAVEL`),
    );
  }

  // Platform width on the structure's high end.
  el.push(verticalDim(0, W, structEndFt + 1.4, structEndFt, ftIn(W)));
  el.push(`</g>`);

  // Jersey barrier callout + north arrow are annotation/orientation
  // furniture — schematic omits both.
  if (!schematic) {
    // Jersey barrier callout. The text sits beyond the approach end so
    // the leader crosses the buffer/travel bands, never the structure.
    const jbLabelX = jb.atEnd === "low" ? structStartFt - 26 : structEndFt + 4;
    el.push(
      leaderLabel(
        jbLabelX,
        yStreetBottom + 5.5,
        jbCx,
        jbCy + 1,
        `${JERSEY_BARRIER_LABEL} (DDOT) — ANGLED 45-60° (§4.2)`,
      ),
    );

    // ---------- 8. North arrow (true bearing, rotated into plan frame) ----------

    const naX = winHigh + 6;
    const naY = yBuildingTop + 4;
    el.push(
      `<g id="north-arrow" transform="translate(${naX}, ${naY})">`,
      `<circle cx="0" cy="0" r="3" fill="#ffffff" stroke="#1c1917" stroke-width="0.1" />`,
      `<g transform="rotate(${site.northAngleDeg.toFixed(1)})">`,
      `<polygon points="0,-2.4 -0.8,1.6 0,0.9 0.8,1.6" fill="#1c1917" />`,
      `</g>`,
      `<text x="0" y="4.4" font-size="1.0" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">N</text>`,
      `</g>`,
    );
  }

  // ---------- 9. Site-plan-specific notes + compose ----------
  // composeSheet prints design.notes; the notes library appends the
  // "site-plan" scope — the §5.2 items that are data gaps rather than
  // geometry (entrances, utilities, meter schedule, provenance). Each
  // block carries its own condition predicate, so nothing prints that
  // doesn't apply to THIS site. Schematic has no notes band, so it skips
  // the evaluation and passes the design through unchanged.

  const siteNotes: string[] = schematic
    ? design.notes
    : [...design.notes, ...evaluateNotes("site-plan", { design, site })];

  return composeSheet(
    {
      viewTitle: sheetTitleForView("site-plan"),
      design: { ...design, notes: siteNotes },
      schematic,
      sheetMinX,
      sheetMaxX,
      sheetMinY,
      contentBottomY: yStreetBottom + 8,
      watermarkCenter: {
        x: (winLow + winHigh) / 2,
        y: (yBuildingTop + yStreetBottom) / 2,
      },
    },
    el,
  );
}

// ---------- Helpers ----------

/**
 * Trunk dot + dashed canopy + tree box rectangle. Box dims come from
 * Urban Forestry when real; unknown boxes draw dashed at a typical
 * 4×9 ft so the architect sees SOMETHING to verify rather than nothing.
 */
function treeSymbol(tree: TreeOnPlan, sidewalkBandFt: number): string {
  const x = tree.stationFt;
  const y = Math.max(-sidewalkBandFt + 1, Math.min(tree.offsetFt, -0.8));
  const boxL = tree.boxLengthFt ?? 9;
  const boxW = tree.boxWidthFt ?? 4;
  const dash = tree.boxIsUnknown ? ' stroke-dasharray="0.7,0.5"' : "";
  const name = (tree.commonName ?? "STREET TREE").toUpperCase();
  return [
    `<g id="tree-${Math.round(x)}">`,
    // Tree box (pit) hugging the curb on the sidewalk side.
    `<rect x="${x - boxL / 2}" y="${-boxW - 0.2}" width="${boxL}" height="${boxW}" fill="none" stroke="#57534e" stroke-width="0.09"${dash} />`,
    // Trunk + dashed canopy.
    `<circle cx="${x}" cy="${y}" r="0.5" fill="#57534e" />`,
    `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#78716c" stroke-width="0.07" stroke-dasharray="0.6,0.45" />`,
    `<text x="${x + 0.3}" y="${y - 4.6}" font-size="0.8" font-family="sans-serif" fill="#1c1917" transform="rotate(-90 ${x + 0.3} ${y - 4.6})">EX. ${escapeXml(name)}${tree.boxIsUnknown ? " (PIT — VERIFY)" : ""}</text>`,
    `</g>`,
  ].join("\n");
}
