/**
 * Parametric Site Plan mockup generator (strawman for v2 architect work).
 *
 * Renders a PrescreenResult into an SVG showing the curb line, building,
 * buildable envelope, all nearby curb features, dimensions, cross-street
 * labels, and a STRAWMAN watermark.
 *
 * This is INTENTIONALLY rough. The point is to give the architect
 * something concrete to react to — clear enough that conversation
 * focuses on what's wrong / missing / better, rough enough that nobody
 * mistakes it for finished work. Real architectural site plans will
 * come out of the v2 design process.
 *
 * Coordinate system: lat/lon → local feet via flat-earth projection
 * (good to inches at this scale). Origin = first vertex of the
 * blockface polyline, X = east, Y = north. SVG y-axis is flipped to
 * match map convention (north up).
 */

import type { PrescreenResult } from "./prescreen.js";

const FT_PER_DEG_LAT = 364_000;

// SVG layout constants — chosen so the output renders well on letter
// paper in landscape orientation when printed via the same print path
// used for the submission package.
const SVG_PADDING_FT = 40; // outside the bbox of all elements
const SIDEWALK_WIDTH_FT_ASSUMED = 8; // typical Mt Pleasant; replaced by data once we surface it
const BUILDING_DEPTH_FT_ASSUMED = 60; // can't get this from MAR alone; placeholder
const BUILDING_WIDTH_FT_ASSUMED = 35; // typical Mt Pleasant restaurant frontage
const TITLE_BLOCK_HEIGHT_FT = 70;
const TITLE_BLOCK_WIDTH_FT = 180;

interface LocalPoint {
  x: number; // feet east of origin
  y: number; // feet north of origin
}

export function buildSitePlanMockupSvg(result: PrescreenResult): string {
  const blockfacePath = (
    result.geocoded.blockface.geometry as { paths?: number[][][] }
  )?.paths?.[0];
  if (!blockfacePath || blockfacePath.length < 2) {
    return errorSvg("Blockface geometry unavailable — cannot render.");
  }

  // ---------- 1. Local coordinate frame ----------

  const origin: [number, number] = [
    blockfacePath[0]![0] ?? 0,
    blockfacePath[0]![1] ?? 0,
  ];
  const lat0 = origin[1];
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const toLocal = (lon: number, lat: number): LocalPoint => ({
    x: (lon - origin[0]) * ftPerDegLon,
    y: (lat - origin[1]) * FT_PER_DEG_LAT,
  });

  const curbLine = blockfacePath.map(([lon, lat]) => toLocal(lon!, lat!));
  const buildingCenter = toLocal(
    result.geocoded.mar.longitude,
    result.geocoded.mar.latitude,
  );

  // ---------- 2. Determine which side of the curb the building is on ----------
  // The perpendicular pointing TOWARD the building is the sidewalk side;
  // the opposite direction is the parking lane / street side. We figure
  // this out by computing the sign of the cross product between the
  // blockface direction and the (building - blockface midpoint) vector.

  const curbStart = curbLine[0]!;
  const curbEnd = curbLine[curbLine.length - 1]!;
  const curbDx = curbEnd.x - curbStart.x;
  const curbDy = curbEnd.y - curbStart.y;
  const curbLen = Math.hypot(curbDx, curbDy);
  const curbUx = curbDx / curbLen; // unit vector along curb
  const curbUy = curbDy / curbLen;
  // Perpendicular unit vector (rotated 90° CCW from curb direction).
  const perpX = -curbUy;
  const perpY = curbUx;
  // Vector from curb midpoint to building.
  const midX = (curbStart.x + curbEnd.x) / 2;
  const midY = (curbStart.y + curbEnd.y) / 2;
  const toBuildingX = buildingCenter.x - midX;
  const toBuildingY = buildingCenter.y - midY;
  // Dot product with perpendicular tells us which side. Sign determines
  // whether the sidewalk side is +perp or -perp.
  const buildingSideSign =
    Math.sign(toBuildingX * perpX + toBuildingY * perpY) || 1;
  const sidewalkPerpX = perpX * buildingSideSign;
  const sidewalkPerpY = perpY * buildingSideSign;
  const streetPerpX = -sidewalkPerpX;
  const streetPerpY = -sidewalkPerpY;

  const parkingLaneWidth =
    result.geocoded.block.parkingLaneWidthPerSideFt ?? 8;

  // ---------- 3. Polygons for sidewalk, parking lane, envelope ----------

  const offsetLine = (
    line: LocalPoint[],
    dx: number,
    dy: number,
  ): LocalPoint[] => line.map((p) => ({ x: p.x + dx, y: p.y + dy }));

  const sidewalkOuter = offsetLine(
    curbLine,
    sidewalkPerpX * SIDEWALK_WIDTH_FT_ASSUMED,
    sidewalkPerpY * SIDEWALK_WIDTH_FT_ASSUMED,
  );
  const parkingLaneOuter = offsetLine(
    curbLine,
    streetPerpX * parkingLaneWidth,
    streetPerpY * parkingLaneWidth,
  );

  // Sidewalk polygon: curb line + reversed offset line.
  const sidewalkPoly = [...curbLine, ...sidewalkOuter.slice().reverse()];
  const parkingLanePoly = [
    ...curbLine,
    ...parkingLaneOuter.slice().reverse(),
  ];

  // Envelope: derive from the eligibility result's geometry, offset to
  // sit inside the parking lane.
  const envelope = result.eligibility?.envelope;
  let envelopePoly: LocalPoint[] | null = null;
  if (
    envelope &&
    envelope.lengthFt > 0 &&
    envelope.geometry &&
    typeof envelope.geometry === "object"
  ) {
    const envCoords = (
      envelope.geometry as { geometry?: { coordinates?: number[][] } }
    )?.geometry?.coordinates;
    if (envCoords && envCoords.length >= 2) {
      const envLocal = envCoords.map(([lon, lat]) => toLocal(lon!, lat!));
      const envOuter = offsetLine(
        envLocal,
        streetPerpX * parkingLaneWidth,
        streetPerpY * parkingLaneWidth,
      );
      envelopePoly = [...envLocal, ...envOuter.slice().reverse()];
    }
  }

  // ---------- 4. Building polygon ----------
  // If DC Building Footprints returned a polygon for this address, use
  // the real shape. Otherwise fall back to a placeholder rectangle
  // centered on the address point, on the sidewalk side, marked as
  // ASSUMED. Real polygons typically have 5-38 vertices and capture
  // corners + recessed entries; the assumed rectangle is a simple
  // 35×60 ft shape rotated to align with the curb.

  const footprintRing = result.geocoded.buildingFootprint?.ring;
  let buildingPoly: LocalPoint[];
  let buildingCenterAdj: LocalPoint;
  let footprintIsAssumed: boolean;

  if (footprintRing && footprintRing.length >= 3) {
    buildingPoly = footprintRing.map(([lon, lat]) => toLocal(lon!, lat!));
    // Centroid of the polygon for label placement.
    buildingCenterAdj = {
      x: buildingPoly.reduce((s, p) => s + p.x, 0) / buildingPoly.length,
      y: buildingPoly.reduce((s, p) => s + p.y, 0) / buildingPoly.length,
    };
    footprintIsAssumed = false;
  } else {
    const buildingOffsetFromCurb =
      SIDEWALK_WIDTH_FT_ASSUMED + BUILDING_DEPTH_FT_ASSUMED / 2;
    const buildingProj = projectOnPolyline(buildingCenter, curbLine);
    buildingCenterAdj = {
      x: buildingProj.x + sidewalkPerpX * buildingOffsetFromCurb,
      y: buildingProj.y + sidewalkPerpY * buildingOffsetFromCurb,
    };
    buildingPoly = rectanglePolygon(
      buildingCenterAdj,
      BUILDING_WIDTH_FT_ASSUMED,
      BUILDING_DEPTH_FT_ASSUMED,
      { ux: curbUx, uy: curbUy },
    );
    footprintIsAssumed = true;
  }

  // ---------- 5. Project all curb features to local frame ----------

  const featuresByType: Array<{
    type: string;
    color: string;
    symbol: "circle" | "square" | "triangle";
    radius: number;
    points: Array<{ p: LocalPoint; label: string }>;
  }> = [
    {
      type: "Fire hydrant",
      color: "#dc2626",
      symbol: "square",
      radius: 3,
      points: result.curbFeatures.fireHydrants.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: String(f.metadata.assetNum ?? "H"),
      })),
    },
    {
      type: "Crosswalk",
      color: "#7c3aed",
      symbol: "square",
      radius: 4,
      points: result.curbFeatures.crosswalks.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "XW",
      })),
    },
    {
      type: "Bus stop",
      color: "#2563eb",
      symbol: "square",
      radius: 4,
      points: result.curbFeatures.busStops.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "BUS",
      })),
    },
    {
      type: "Driveway curb cut",
      color: "#ea580c",
      symbol: "triangle",
      radius: 4,
      points: result.curbFeatures.driveways.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "DRV",
      })),
    },
    {
      type: "ADA ramp",
      color: "#0891b2",
      symbol: "triangle",
      radius: 3,
      points: result.curbFeatures.adaCurbRamps.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "ADA",
      })),
    },
    {
      type: "Loading zone",
      color: "#f97316",
      symbol: "square",
      radius: 4,
      points: result.curbFeatures.loadingZones.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "LZ",
      })),
    },
    {
      type: "Street tree",
      color: "#16a34a",
      symbol: "circle",
      radius: 3.5,
      points: result.curbFeatures.streetTrees.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "",
      })),
    },
    {
      type: "Parking meter",
      color: "#737373",
      symbol: "circle",
      radius: 2,
      points: result.curbFeatures.parkingMeters.map((f) => ({
        p: toLocal(f.location.longitude, f.location.latitude),
        label: "M",
      })),
    },
  ];

  // ---------- 6. Compute bounding box for SVG viewBox ----------

  const allPoints: LocalPoint[] = [
    ...curbLine,
    ...sidewalkOuter,
    ...parkingLaneOuter,
    ...buildingPoly,
    ...(envelopePoly ?? []),
    ...featuresByType.flatMap((f) => f.points.map((p) => p.p)),
  ];
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  let bboxMinX = Math.min(...xs) - SVG_PADDING_FT;
  let bboxMinY = Math.min(...ys) - SVG_PADDING_FT;
  let bboxMaxX = Math.max(...xs) + SVG_PADDING_FT;
  let bboxMaxY = Math.max(...ys) + SVG_PADDING_FT;
  // Reserve room at the bottom for the title block.
  bboxMinY -= TITLE_BLOCK_HEIGHT_FT;

  const bboxWidth = bboxMaxX - bboxMinX;
  const bboxHeight = bboxMaxY - bboxMinY;

  // ---------- 7. SVG construction ----------
  // SVG y-axis points DOWN; we flip via viewBox transform so north is up.

  const polyToSvg = (poly: LocalPoint[]): string =>
    poly.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(" ");

  const elements: string[] = [];

  // Background.
  elements.push(
    `<rect x="${bboxMinX}" y="${-bboxMaxY}" width="${bboxWidth}" height="${bboxHeight}" fill="#fafaf9" />`,
  );

  // Travel-lane area (everything beyond the parking lane) — just a hint.
  // We don't have travel-lane geometry; just label the direction.
  elements.push(`<g id="parking-lane">`);
  elements.push(
    `<polygon points="${polyToSvg(parkingLanePoly)}" fill="#fef3c7" stroke="#d97706" stroke-width="0.4" stroke-dasharray="2,2" />`,
  );
  elements.push(`</g>`);

  // Sidewalk.
  elements.push(`<g id="sidewalk">`);
  elements.push(
    `<polygon points="${polyToSvg(sidewalkPoly)}" fill="#e7e5e4" stroke="#a8a29e" stroke-width="0.3" />`,
  );
  elements.push(`</g>`);

  // Curb line (heavy black).
  elements.push(
    `<polyline points="${polyToSvg(curbLine)}" fill="none" stroke="#1c1917" stroke-width="1.2" />`,
  );

  // Building.
  elements.push(
    `<polygon points="${polyToSvg(buildingPoly)}" fill="#d6d3d1" stroke="#57534e" stroke-width="0.6" />`,
  );
  // Building label — placed at the building center.
  const buildingLabel = result.geocoded.mar.fullAddress;
  elements.push(
    `<text x="${buildingCenterAdj.x.toFixed(2)}" y="${(-buildingCenterAdj.y).toFixed(2)}" font-size="6" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#1c1917">${escapeXml(buildingLabel)}</text>`,
  );
  // Provenance line: confirms whether the polygon is real DC data or
  // assumed. Architect sees this and knows what to trust.
  const footprintNote = footprintIsAssumed
    ? "[building footprint assumed — operator to confirm]"
    : `[DC Building Footprints, ${footprintCaptureLabel(result.geocoded.buildingFootprint?.capturedAt)}]`;
  elements.push(
    `<text x="${buildingCenterAdj.x.toFixed(2)}" y="${(-buildingCenterAdj.y + 7).toFixed(2)}" font-size="4" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#78716c" font-style="italic">${escapeXml(footprintNote)}</text>`,
  );

  // Envelope (most important visual).
  if (envelopePoly && envelope) {
    const verdictColor =
      result.eligibility?.verdict === "ELIGIBLE"
        ? "#059669"
        : result.eligibility?.verdict === "ELIGIBLE_WITH_CAVEATS"
          ? "#d97706"
          : "#e11d48";
    elements.push(`<g id="envelope">`);
    elements.push(
      `<polygon points="${polyToSvg(envelopePoly)}" fill="${verdictColor}" fill-opacity="0.25" stroke="${verdictColor}" stroke-width="1" />`,
    );
    // Center label inside the envelope.
    const envCenterX =
      envelopePoly.reduce((s, p) => s + p.x, 0) / envelopePoly.length;
    const envCenterY =
      envelopePoly.reduce((s, p) => s + p.y, 0) / envelopePoly.length;
    elements.push(
      `<text x="${envCenterX.toFixed(2)}" y="${(-envCenterY).toFixed(2)}" font-size="7" font-family="sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${verdictColor}">STREATERY ENVELOPE</text>`,
    );
    elements.push(
      `<text x="${envCenterX.toFixed(2)}" y="${(-envCenterY + 8).toFixed(2)}" font-size="5" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="${verdictColor}">${envelope.lengthFt.toFixed(1)} ft × ${envelope.widthFt.toFixed(0)} ft  ·  ${envelope.recommendedTemplate}</text>`,
    );
    elements.push(`</g>`);
  }

  // Curb features.
  elements.push(`<g id="features">`);
  for (const cat of featuresByType) {
    for (const f of cat.points) {
      const px = f.p.x;
      const py = -f.p.y;
      if (cat.symbol === "circle") {
        elements.push(
          `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${cat.radius}" fill="${cat.color}" stroke="white" stroke-width="0.5" />`,
        );
      } else if (cat.symbol === "square") {
        const r = cat.radius;
        elements.push(
          `<rect x="${(px - r).toFixed(2)}" y="${(py - r).toFixed(2)}" width="${r * 2}" height="${r * 2}" fill="${cat.color}" stroke="white" stroke-width="0.5" />`,
        );
      } else {
        // triangle
        const r = cat.radius;
        const pts = `${px},${py - r} ${px - r},${py + r} ${px + r},${py + r}`;
        elements.push(
          `<polygon points="${pts}" fill="${cat.color}" stroke="white" stroke-width="0.5" />`,
        );
      }
      if (f.label) {
        elements.push(
          `<text x="${(px + cat.radius + 1).toFixed(2)}" y="${(py + 1).toFixed(2)}" font-size="3" font-family="sans-serif" fill="${cat.color}">${escapeXml(f.label)}</text>`,
        );
      }
    }
  }
  elements.push(`</g>`);

  // Cross-street labels at the two ends of the blockface.
  const fromStreet = result.geocoded.block.fromStreet;
  const toStreet = result.geocoded.block.toStreet;
  if (fromStreet) {
    elements.push(
      `<text x="${(curbStart.x - curbUx * 8).toFixed(2)}" y="${(-curbStart.y + curbUy * 8).toFixed(2)}" font-size="6" font-family="sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#1c1917">${escapeXml(fromStreet)}</text>`,
    );
  }
  if (toStreet) {
    elements.push(
      `<text x="${(curbEnd.x + curbUx * 8).toFixed(2)}" y="${(-curbEnd.y - curbUy * 8).toFixed(2)}" font-size="6" font-family="sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#1c1917">${escapeXml(toStreet)}</text>`,
    );
  }

  // North arrow — top-right corner of the drawing area.
  const naSize = 12;
  const naX = bboxMaxX - naSize - 4;
  const naY = -(bboxMaxY - naSize - 4);
  elements.push(
    `<g id="north-arrow" transform="translate(${naX}, ${naY})">` +
      `<circle cx="0" cy="0" r="${naSize}" fill="white" stroke="#1c1917" stroke-width="0.5" />` +
      `<polygon points="0,${-naSize + 2} -3,${naSize - 4} 0,${naSize - 6} 3,${naSize - 4}" fill="#1c1917" />` +
      `<text x="0" y="${naSize - 1}" font-size="5" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#1c1917">N</text>` +
      `</g>`,
  );

  // Scale bar — top-left corner of the drawing area.
  const sbX = bboxMinX + 8;
  const sbY = -(bboxMaxY - 8);
  elements.push(
    `<g id="scale-bar" transform="translate(${sbX}, ${sbY})">` +
      `<rect x="0" y="0" width="20" height="2" fill="#1c1917" />` +
      `<rect x="20" y="0" width="20" height="2" fill="white" stroke="#1c1917" stroke-width="0.3" />` +
      `<text x="0" y="-1" font-size="3.5" font-family="sans-serif" fill="#1c1917">0</text>` +
      `<text x="20" y="-1" font-size="3.5" font-family="sans-serif" text-anchor="middle" fill="#1c1917">20</text>` +
      `<text x="40" y="-1" font-size="3.5" font-family="sans-serif" text-anchor="middle" fill="#1c1917">40 ft</text>` +
      `</g>`,
  );

  // STRAWMAN watermark — diagonal across the drawing.
  const wmCx = (bboxMinX + bboxMaxX) / 2;
  const wmCy = -((bboxMinY + bboxMaxY) / 2);
  elements.push(
    `<text x="${wmCx.toFixed(2)}" y="${wmCy.toFixed(2)}" font-size="40" font-family="sans-serif" font-weight="900" fill="#1c1917" fill-opacity="0.06" text-anchor="middle" dominant-baseline="middle" transform="rotate(-25 ${wmCx} ${wmCy})">STRAWMAN — FOR MEETING DISCUSSION</text>`,
  );

  // Title block — bottom of drawing area.
  const tbX = bboxMaxX - TITLE_BLOCK_WIDTH_FT - 4;
  const tbY = -(bboxMinY + TITLE_BLOCK_HEIGHT_FT - 4);
  elements.push(titleBlock(tbX, tbY, result));

  // Legend — top-left, just below the scale bar. Each row is 6 ft tall,
  // so 8 categories = 48 ft + margins; place starting ~16 ft from top
  // so it doesn't collide with the scale bar (at top edge + 8 ft down).
  const legendX = bboxMinX + 4;
  const legendY = -(bboxMaxY - 18);
  elements.push(legend(legendX, legendY, featuresByType));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" `,
    `     viewBox="${bboxMinX.toFixed(2)} ${(-bboxMaxY).toFixed(2)} ${bboxWidth.toFixed(2)} ${bboxHeight.toFixed(2)}" `,
    `     preserveAspectRatio="xMidYMid meet">`,
    elements.join("\n"),
    `</svg>`,
  ].join("\n");
}

// ---------- Title block ----------

function titleBlock(
  x: number,
  y: number,
  result: PrescreenResult,
): string {
  const verdictText =
    result.eligibility?.verdict.replace(/_/g, " ") ?? "INELIGIBLE";
  const envLen = result.eligibility?.envelope.lengthFt ?? 0;
  const template =
    result.eligibility?.envelope.recommendedTemplate ?? "n/a";
  return [
    `<g id="title-block" transform="translate(${x}, ${y})">`,
    `<rect x="0" y="0" width="${TITLE_BLOCK_WIDTH_FT}" height="${TITLE_BLOCK_HEIGHT_FT - 8}" fill="white" stroke="#1c1917" stroke-width="0.6" />`,
    `<text x="4" y="8" font-size="6" font-family="sans-serif" font-weight="700" fill="#1c1917">DRAWING 1 OF 5: SITE PLAN (STRAWMAN)</text>`,
    `<text x="4" y="16" font-size="5" font-family="sans-serif" fill="#44403c">${escapeXml(result.geocoded.mar.fullAddress)}</text>`,
    `<text x="4" y="22" font-size="4" font-family="sans-serif" fill="#78716c">${escapeXml(result.geocoded.block.blockName)}</text>`,
    `<text x="4" y="32" font-size="4" font-family="sans-serif" fill="#44403c">Verdict: <tspan font-weight="700">${escapeXml(verdictText)}</tspan></text>`,
    `<text x="4" y="38" font-size="4" font-family="sans-serif" fill="#44403c">Envelope: ${envLen.toFixed(1)} ft (${escapeXml(template)})</text>`,
    `<text x="4" y="44" font-size="4" font-family="sans-serif" fill="#44403c">Generated: ${new Date(result.fetchedAt).toLocaleDateString()}</text>`,
    `<text x="4" y="52" font-size="3.5" font-family="sans-serif" font-style="italic" fill="#a8a29e">Strawman generated by streatery-prescreener — not architectural drawing</text>`,
    `<text x="4" y="57" font-size="3.5" font-family="sans-serif" font-style="italic" fill="#a8a29e">For meeting discussion; architect refinement + seal required before submission</text>`,
    `</g>`,
  ].join("\n");
}

// ---------- Legend ----------

function legend(
  x: number,
  y: number,
  features: Array<{ type: string; color: string }>,
): string {
  const rowHeight = 6;
  const present = features.filter(
    (_) => true, // include all categories; absent ones still help architect understand symbology
  );
  const lines: string[] = [
    `<g id="legend" transform="translate(${x}, ${y})">`,
    `<rect x="0" y="0" width="55" height="${4 + present.length * rowHeight + 4}" fill="white" stroke="#1c1917" stroke-width="0.4" />`,
    `<text x="3" y="6" font-size="4.5" font-family="sans-serif" font-weight="700" fill="#1c1917">LEGEND</text>`,
  ];
  present.forEach((f, i) => {
    const rowY = 10 + i * rowHeight;
    lines.push(
      `<rect x="3" y="${rowY - 2.5}" width="3" height="3" fill="${f.color}" />`,
      `<text x="8" y="${rowY}" font-size="3.5" font-family="sans-serif" fill="#44403c">${escapeXml(f.type)}</text>`,
    );
  });
  lines.push(`</g>`);
  return lines.join("\n");
}

// ---------- Helpers ----------

/** Closest point on a polyline to a given point. Brute-force per-segment. */
function projectOnPolyline(
  p: LocalPoint,
  line: LocalPoint[],
): LocalPoint {
  let best: LocalPoint = line[0]!;
  let bestDistSq = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
    );
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const distSq = (p.x - projX) ** 2 + (p.y - projY) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = { x: projX, y: projY };
    }
  }
  return best;
}

/** Axis-aligned rectangle rotated to follow a direction vector. */
function rectanglePolygon(
  center: LocalPoint,
  alongLength: number,
  perpLength: number,
  alongUnit: { ux: number; uy: number },
): LocalPoint[] {
  const halfAlong = alongLength / 2;
  const halfPerp = perpLength / 2;
  const perpUx = -alongUnit.uy;
  const perpUy = alongUnit.ux;
  const corners: Array<[number, number]> = [
    [-halfAlong, -halfPerp],
    [halfAlong, -halfPerp],
    [halfAlong, halfPerp],
    [-halfAlong, halfPerp],
  ];
  return corners.map(([a, b]) => ({
    x: center.x + a * alongUnit.ux + b * perpUx,
    y: center.y + a * alongUnit.uy + b * perpUy,
  }));
}

function footprintCaptureLabel(capturedAtMs: number | null | undefined): string {
  if (!capturedAtMs) return "capture date unknown";
  const d = new Date(capturedAtMs);
  return `captured ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function errorSvg(message: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">`,
    `<rect width="400" height="100" fill="#fef2f2" stroke="#dc2626" />`,
    `<text x="200" y="55" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#dc2626">${escapeXml(message)}</text>`,
    `</svg>`,
  ].join("\n");
}
