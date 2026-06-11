/**
 * The note registry — every conditional note the drawing set can carry,
 * in one place, each with its condition and its regs citation.
 *
 * Sources, in the order the roadmap prescribed (build AFTER two real
 * sheets so the keys come from observed needs):
 *   - "layout" blocks: what layoutStreatery() derived inline in M1-M3
 *     (texts preserved verbatim — the validated sheets keep reading
 *     the same).
 *   - "site-plan" blocks: what the Site Plan renderer appended in M3.
 *   - "general" blocks: the Queen's English G1.01 conditional
 *     boilerplate identified in the teardown — pedestal feet, floor
 *     plating, drainage access, APWA markings, §4.7 signage, §4.3 roof
 *     rules, the bike-lane-toggled concrete-block detail, propane.
 *     These feed the M5 G1.01 sheet wholesale.
 *
 * Array order within a scope = print order on the sheet.
 */

import {
  DRAINAGE_CHANNEL_FT,
  ENCLOSURE_MAX_MEMBER_GAP_IN,
  ENCLOSURE_TOP_IN,
  MIN_ROOF_RUN_FT,
  PLATFORM_MAX_RISE_IN,
  ROOF_MAX_HEIGHT_FT,
  ROOF_MIN_HEIGHT_FT,
  SAFETY_GAP_EVERY_FT,
  SEATING_SETBACK_FT,
  SIGNAGE_HEIGHT_IN,
  SIGNAGE_WIDTH_IN,
  TRAVEL_SIDE_BUFFER_FT,
} from "../templateConstants.js";
import { ftIn } from "../renderers/shared.js";
import type { SiteContext } from "../siteContext.js";
import type { NoteBlock, NoteContext } from "./types.js";

// ---------- Small shared derivations ----------

/** Structure extent in blockface stations (what the Site Plan draws). */
function structureExtent(ctx: NoteContext): { startFt: number; endFt: number } {
  const startFt = ctx.design.anchor.structureStartStationFt;
  return { startFt, endFt: startFt + ctx.design.platform.lengthFt };
}

/**
 * The sidewalk-band depth the Site Plan draws: measured curb-to-façade
 * when the footprint gave us one, else DDOT's parsed string, else a
 * loud 10 ft assumption. Mirrors the renderer's derivation — both call
 * this so they can't drift.
 */
export function sidewalkDepthFt(row: SiteContext["rightOfWay"]): number {
  return (
    row.facadeOffsetFt ??
    row.sidewalkInboundFt ??
    row.sidewalkOutboundFt ??
    10
  );
}

// ---------- The registry ----------

export const NOTE_BLOCKS: NoteBlock[] = [
  // ========== layout scope (design.notes — every sheet) ==========

  {
    key: "approach-end-heuristic",
    scope: "layout",
    category: "site-walk",
    citation: "§4.2",
    appliesWhen: () => true,
    text: (ctx) =>
      `Vehicular approach assumed from the ${
        ctx.design.jerseyBarrier.atEnd === "low" ? "low" : "high"
      }-station end ` +
      `(derived from side-of-street + route direction). SITE-WALK CONFIRM: verify ` +
      `traffic direction in the adjacent lane; one-way streets can flip this.`,
  },
  {
    key: "type1-not-templated",
    scope: "layout",
    category: "architect",
    citation: "§4.2",
    appliesWhen: (ctx) => ctx.inputs?.barrierType === "type1",
    text: () =>
      "TYPE 1 STREET: §4.2 requires Jersey barriers on ALL THREE street-facing " +
      "sides, pinned/linked, 12\" off the travel lane. This drawing shows the " +
      "Type 2 layout — the Type 1 variant is not yet templated. ARCHITECT REQUIRED.",
  },
  {
    // extractInputs words this one (it knows WHY the type was ambiguous);
    // the library just carries it through under a stable key.
    key: "barrier-type-context",
    scope: "layout",
    category: "architect",
    citation: "§4.2",
    appliesWhen: (ctx) => ctx.inputs?.barrierTypeNote != null,
    text: (ctx) => ctx.inputs!.barrierTypeNote!,
  },
  {
    key: "frontage-provenance",
    scope: "layout",
    category: "data-provenance",
    citation: "§4.1",
    appliesWhen: (ctx) => ctx.inputs?.frontageNote != null,
    text: (ctx) => ctx.inputs!.frontageNote!,
  },
  {
    key: "safety-gaps",
    scope: "layout",
    category: "architect",
    citation: "§4.2",
    appliesWhen: (ctx) => ctx.design.platform.lengthFt >= SAFETY_GAP_EVERY_FT,
    text: () =>
      `Structure exceeds ${SAFETY_GAP_EVERY_FT} ft — §4.2 requires 3 ft safety gaps ` +
      `every 60-100 ft and at Fire Department Connections. ARCHITECT: place gaps.`,
  },
  {
    key: "trees-in-structure",
    scope: "layout",
    category: "architect",
    citation: "UFD",
    appliesWhen: (ctx) => ctx.design.trees.length > 0,
    text: (ctx) =>
      `${ctx.design.trees.length} street tree(s) within the structure run. Maintain 12" clear ` +
      `to trunk per UFD direction; platform framing opens around each tree ` +
      `(Martha Dear / Queen's English precedent). ARBORIST evaluation recommended ` +
      `(Queen's English used one).`,
  },
  {
    key: "roof-exception-a",
    scope: "layout",
    category: "regulatory",
    citation: "§4.3 Exc. A",
    appliesWhen: (ctx) => ctx.design.trees.length > 0,
    text: () =>
      "§4.3 Exception A: where a street tree is located, the roof shall not " +
      "extend beyond/overhang the vertical face of the curb.",
  },
  {
    key: "roof-none",
    scope: "layout",
    category: "regulatory",
    citation: "§4.3",
    appliesWhen: (ctx) => ctx.design.roofSegments.length === 0,
    text: (ctx) =>
      `No roof: after §4.3 exclusions (5 ft from tree trunks, 25 ft from ` +
      `crosswalks, 40 ft from bare intersections) the longest permitted run is ` +
      `${ctx.design.roof.permittedRunFt.toFixed(1)} ft — under the ${MIN_ROOF_RUN_FT} ft minimum. ` +
      `Open-air enclosure only.`,
  },
  {
    key: "roof-partial",
    scope: "layout",
    category: "regulatory",
    citation: "§4.3",
    appliesWhen: (ctx) => {
      const seg = ctx.design.roofSegments[0];
      if (!seg) return false;
      return seg.endFt - seg.startFt < ctx.design.platform.lengthFt - 0.5;
    },
    text: (ctx) => {
      const seg = ctx.design.roofSegments[0]!;
      return (
        `Roof covers ${(seg.endFt - seg.startFt).toFixed(1)} ft of the ` +
        `${ctx.design.platform.lengthFt.toFixed(1)} ft structure — ` +
        `§4.3 exclusions hold it back from the remainder (both approved reference ` +
        `sets show the same partial-roof condition).`
      );
    },
  },
  {
    key: "fdc-site-walk",
    scope: "layout",
    category: "site-walk",
    citation: "§4.2",
    appliesWhen: () => true,
    text: () =>
      "Fire Department Connection locations are building-mounted and not in any " +
      "DC dataset — SITE-WALK: confirm FDC position; enclosure needs a 3 ft gap at it.",
  },

  // ========== site-plan scope (Site Plan sheet extras) ==========

  {
    key: "curb-reference-unavailable",
    scope: "site-plan",
    category: "data-provenance",
    citation: null,
    appliesWhen: (ctx) => ctx.site?.curbReference.source === "unavailable",
    text: () =>
      "CURB REFERENCE UNAVAILABLE: the DC Planimetrics curb layer returned " +
      "nothing here, so cross-street offsets are measured from the roadway " +
      "centerline-ish blockface line and may be shifted 15-25 ft. DO NOT " +
      "scale offsets from this sheet; field-verify all curb-relative positions.",
  },
  {
    key: "building-entrances",
    scope: "site-plan",
    category: "site-walk",
    citation: "§5.2",
    appliesWhen: () => true,
    text: () =>
      "Building entrance locations are not in DC Open Data — SITE-WALK: mark " +
      "building entrance(s) on this plan before submission (§5.2 site plan checklist).",
  },
  {
    key: "sidewalk-provenance",
    scope: "site-plan",
    category: "data-provenance",
    citation: null,
    appliesWhen: (ctx) => ctx.site != null,
    text: (ctx) => {
      const row = ctx.site!.rightOfWay;
      const depthFt = sidewalkDepthFt(row);
      const ddotRaw =
        row.sidewalkInboundRaw || row.sidewalkOutboundRaw
          ? ` DDOT Roadway Block reports ${row.sidewalkInboundRaw ?? "n/a"} (IB) / ${row.sidewalkOutboundRaw ?? "n/a"} (OB) — includes planting zone; IB/OB side mapping unverified.`
          : "";
      const basis =
        row.facadeOffsetFt != null
          ? `Sidewalk width ${ftIn(depthFt)} measured curb-to-façade from DC Building Footprints.`
          : row.sidewalkInboundFt != null || row.sidewalkOutboundFt != null
            ? `Sidewalk width ${ftIn(depthFt)} from DDOT Roadway Block (no footprint to measure against).`
            : `Sidewalk width ASSUMED at ${ftIn(depthFt)} — no footprint and no DDOT value.`;
      return (
        basis +
        ddotRaw +
        " FIELD-VERIFY clear ADA path of travel (5 ft min) on site walk."
      );
    },
  },
  {
    key: "utilities-unknown",
    scope: "site-plan",
    category: "site-walk",
    citation: "§5.2 item 5",
    appliesWhen: () => true,
    text: () =>
      "Existing utilities in/under/adjacent to the streatery are not in DC Open " +
      "Data — the Utility Access Plan (§5.2 item 5) requires field locating + " +
      "APWA color-code markings before install.",
  },
  {
    key: "tree-pit-photos",
    scope: "site-plan",
    category: "site-walk",
    citation: "§5.2",
    appliesWhen: (ctx) => (ctx.site?.trees.length ?? 0) > 0,
    text: () =>
      "§5.2 requires PHOTOS of existing street trees + tree pits with the site " +
      "plan. Tree box dimensions from Urban Forestry where reported; dashed " +
      "boxes are unreported (sentinel/missing) — measure on site walk.",
  },
  {
    key: "meter-schedule",
    scope: "site-plan",
    category: "regulatory",
    citation: "§5.2",
    appliesWhen: (ctx) => (ctx.site?.meters.length ?? 0) > 0,
    text: (ctx) => {
      const { startFt, endFt } = structureExtent(ctx);
      const entries = ctx.site!.meters.map((m) => {
        const id = m.meterId ?? "unknown";
        if (m.stationFt >= startFt && m.stationFt <= endFt) {
          return `${id} (AT STRUCTURE — REMOVE)`;
        }
        const distanceFt =
          m.stationFt < startFt ? startFt - m.stationFt : m.stationFt - endFt;
        const spaces = m.spaces != null ? `, governs ${m.spaces} spaces` : "";
        return `${id} (${ftIn(distanceFt)} from structure${spaces})`;
      });
      return (
        `METER SCHEDULE — meters on this side of the block (some may sit beyond ` +
        `the drawn window): ${entries.join("; ")}. ` +
        `Multi-space pay stations govern spaces beyond their pole — CONFIRM which ` +
        `meters/spaces are removed or reprogrammed with DDOT at permit review.`
      );
    },
  },
  {
    key: "meters-none",
    scope: "site-plan",
    category: "site-walk",
    citation: "§5.2",
    appliesWhen: (ctx) => ctx.site != null && ctx.site.meters.length === 0,
    text: () =>
      "No parking meters found on this side of the block (DDOT meter dataset) — " +
      "verify on site walk; §5.2 requires meter numbers when present.",
  },
  {
    key: "curbside-regulation",
    scope: "site-plan",
    category: "site-walk",
    citation: "§5.2",
    appliesWhen: (ctx) => ctx.site?.meters.some((m) => m.policy) === true,
    text: (ctx) =>
      `Existing curbside regulation (DDOT meter data): ${
        ctx.site!.meters.find((m) => m.policy)!.policy
      } — verify posted signage on site walk.`,
  },
  {
    key: "seating-layout",
    scope: "site-plan",
    category: "regulatory",
    citation: "§4.8",
    appliesWhen: () => true,
    text: (ctx) =>
      `Seating layout: capacity ${ctx.design.seating.capacity} per §4.8 ` +
      `(${ctx.design.seating.areaSf} usable SF / 15); ` +
      `all seating ${SEATING_SETBACK_FT} ft clear of barriers/enclosure. ` +
      `Layout drawn on the G2.00 life-safety sheet (M5).`,
  },

  // ========== general scope (G1.01 — the QE conditional boilerplate) ==========

  {
    key: "platform-pedestals",
    scope: "general",
    category: "regulatory",
    citation: "§4.4",
    appliesWhen: () => true,
    text: () =>
      "Platform rides on adjustable pedestals / leveling feet for positive " +
      "drainage; deck is NOT bolted or anchored into the roadway (§4.4). " +
      "Composite decking on PT 2x4 sleepers — the assembly both approved sets use.",
  },
  {
    key: "curb-transition-plate",
    scope: "general",
    category: "regulatory",
    citation: "§4.4",
    appliesWhen: () => true,
    text: () =>
      `Entry flush with the sidewalk: removable 3/8" steel transition plate at ` +
      `the curb, max ${PLATFORM_MAX_RISE_IN * 8}/8" rise, gap ≤ 1/2" (§4.4; ` +
      `Queen's English self-imposed 3/8" max).`,
  },
  {
    key: "drainage-access",
    scope: "general",
    category: "regulatory",
    citation: "§4.6 + §5.2 item 4",
    appliesWhen: () => true,
    text: () =>
      `Maintain ${ftIn(DRAINAGE_CHANNEL_FT)} clear stormwater channel along the curb ` +
      `under the deck, with open ends (§4.6). Construction Details must show ` +
      `positive drainage flow AND how the channel is accessed/cleared if blocked ` +
      `(§5.2 item 4).`,
  },
  {
    key: "apwa-markings",
    scope: "general",
    category: "regulatory",
    citation: "§5.2 item 5, Appendix 5",
    appliesWhen: () => true,
    text: () =>
      "Mark all utilities in/under/adjacent to the streatery per APWA color code " +
      "before installation; show proposed markings on the platform/barriers in " +
      "the Utility Access Plan (§5.2 item 5; operator contact table in Appendix 5).",
  },
  {
    key: "utility-access-panels",
    scope: "general",
    category: "site-walk",
    citation: "§5.2 item 5",
    appliesWhen: () => true,
    text: () =>
      "Provide access panels / removable planks over any manhole, vault lid, or " +
      "utility cover within the footprint (§5.2 item 5). SITE-WALK: locate covers " +
      "— utility vault coverage in DC Open Data is incomplete.",
  },
  {
    key: "signage-spec",
    scope: "general",
    category: "regulatory",
    citation: "§4.7, Appendix 1",
    appliesWhen: () => true,
    text: () =>
      `Two ${SIGNAGE_WIDTH_IN}"×${SIGNAGE_HEIGHT_IN}" signs, one near each end of the ` +
      `sidewalk-facing edge: business name, seating hours, seating capacity, ` +
      `emergency contact (§4.7, Appendix 1 format). No other signage, logos, ` +
      `advertising, or branding permitted.`,
  },
  {
    key: "enclosure-spec",
    scope: "general",
    category: "regulatory",
    citation: "§4.2",
    appliesWhen: () => true,
    text: () =>
      `Enclosure tops out 32-42" above the roadway (${ENCLOSURE_TOP_IN}" cap rail, ` +
      `both approved sets); gaps between intermediate members ≤ ${ENCLOSURE_MAX_MEMBER_GAP_IN}" (§4.2).`,
  },
  {
    key: "roof-rules",
    scope: "general",
    category: "regulatory",
    citation: "§4.3",
    appliesWhen: (ctx) => ctx.design.roofSegments.length > 0,
    text: (ctx) =>
      `Overhead structure ${ROOF_MIN_HEIGHT_FT}-${ROOF_MAX_HEIGHT_FT} ft above platform; ` +
      `translucent, minimal-profile roof sloped ${ctx.design.roof.slopeLabel}; ` +
      `NO enclosure above barrier height at any time; vertical members above 42" ` +
      `max 6" wide (§4.3).`,
  },
  {
    key: "concrete-blocks-required",
    scope: "general",
    category: "regulatory",
    citation: "§4.2",
    appliesWhen: (ctx) => ctx.site != null && !ctx.site.rightOfWay.hasBikeLane,
    text: () =>
      `Concrete blocks required in the ${TRAVEL_SIDE_BUFFER_FT} ft travel-side buffer ` +
      `(§4.2). DDOT standard detail to appear on the details sheet (A2.01 equivalent, M5).`,
  },
  {
    key: "concrete-blocks-waived",
    scope: "general",
    category: "architect",
    citation: "§4.2",
    appliesWhen: (ctx) => ctx.site?.rightOfWay.hasBikeLane === true,
    text: () =>
      "Bike lane present: DDOT stamped Queen's English's concrete-block detail " +
      "\"NOT REQUIRED DUE TO PRESENCE OF BIKE LANES\" (approved set precedent; " +
      "§4.2 allows buffer reduction at PROTECTED bike lanes). ARCHITECT: confirm " +
      "the same treatment with DDOT for this site.",
  },
  {
    key: "jersey-reflectors",
    scope: "general",
    category: "regulatory",
    citation: "Appendix 3",
    appliesWhen: () => true,
    text: () =>
      "DDOT-provided Jersey barrier carries reflectors per the Appendix 3 " +
      "standard detail (signed by DDOT's chief engineer) — embed on the details " +
      "sheet rather than redrawing.",
  },
  {
    key: "ada-table",
    scope: "general",
    category: "regulatory",
    citation: "§4.8",
    appliesWhen: () => true,
    text: () =>
      `≥ 1 ADA-accessible table: 28-34" surface height, 27" knee clearance, ` +
      `30"×48" clear floor space, on an accessible route (§4.8). All seating ` +
      `${SEATING_SETBACK_FT} ft back from barriers/enclosure.`,
  },
  {
    key: "propane-fems",
    scope: "general",
    category: "operator",
    citation: "FEMS",
    appliesWhen: () => true,
    text: () =>
      'IF portable propane heaters are planned: "Propane Use: Heating — Portable ' +
      'Outdoor" permit from FEMS (fems.dc.gov, ~5 calendar days). Where a roof is ' +
      "present, confirm heater clearances with FEMS before purchase.",
  },
];
