/**
 * MapView — MapLibre map showing the address, the blockface curb line,
 * the buildable envelope, and binding-constraint markers.
 *
 * MapLibre is a fork of Mapbox GL JS that's open-source and doesn't
 * require an API key. We pull tiles from OpenStreetMap's standard server
 * — fine for a low-volume internal tool, but would need a real tile
 * provider (Mapbox, MapTiler, Stadia) for production deployment.
 */
import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type LngLatBoundsLike } from "maplibre-gl";

import type { PrescreenResult } from "../prescreen.js";
import type { CurbFeature } from "../curbFeatures.js";

interface MapViewProps {
  result: PrescreenResult;
}

export function MapView({ result }: MapViewProps): React.ReactElement {
  // useRef gives us a mutable reference that survives re-renders without
  // triggering them. The container ref points to the <div> we mount the
  // map onto; the map ref holds the MapLibre instance so we can update it
  // when props change.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // First effect: create the map once on mount, destroy on unmount. The
  // empty dep array means this runs only on mount/unmount, never on
  // re-render. Map creation is expensive; we don't want to redo it just
  // because props changed.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      // Inline minimal style — one raster tile source pulled from OSM.
      // Avoids a network round-trip to fetch a separate style.json.
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution:
              "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-77.038, 38.93], // Mt Pleasant center as the boot location
      zoom: 17,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Second effect: re-render the result-specific layers whenever the
  // result changes. We wait for the style to load before adding sources
  // (MapLibre throws if you add a layer before the style is ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = (): void => {
      drawResult(map, result);
    };
    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once("load", draw);
    }
  }, [result]);

  return (
    <div
      ref={containerRef}
      className="w-full h-80 min-h-72 rounded-xs border border-hairline overflow-hidden"
    />
  );
}

// ---------- Map drawing logic ----------

/**
 * Idempotent re-draw of the result-specific overlays. Removes any layers
 * from a previous result before adding the new ones, so consecutive
 * pre-screens don't leave stale geometry on the map.
 */
function drawResult(map: MapLibreMap, result: PrescreenResult): void {
  // Remove anything from a previous result. Layers must be removed before
  // their sources, or MapLibre complains about dangling references.
  const layersToRemove = [
    "envelope-line",
    "envelope-casing",
    "blockface-line",
    "constraints-circles",
    "address-dot",
    "address-ring",
  ];
  for (const id of layersToRemove) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  const sourcesToRemove = [
    "envelope",
    "blockface",
    "constraints",
    "address",
  ];
  for (const id of sourcesToRemove) {
    if (map.getSource(id)) map.removeSource(id);
  }

  const { geocoded, eligibility, curbFeatures } = result;
  const addressLngLat: [number, number] = [
    geocoded.mar.longitude,
    geocoded.mar.latitude,
  ];

  // 1) Address marker — small filled circle with a white ring for
  //    contrast against any tile background.
  map.addSource("address", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "Point", coordinates: addressLngLat },
      properties: {},
    },
  });
  map.addLayer({
    id: "address-ring",
    type: "circle",
    source: "address",
    paint: {
      "circle-radius": 9,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#1c1917",
    },
  });
  map.addLayer({
    id: "address-dot",
    type: "circle",
    source: "address",
    paint: { "circle-radius": 4, "circle-color": "#1c1917" },
  });

  // 2) Blockface curb line — thin gray, as the "context" along which the
  //    envelope sits.
  const blockface = geocoded.blockface.geometry as { paths?: number[][][] };
  const blockfacePath = blockface?.paths?.[0];
  if (blockfacePath && blockfacePath.length >= 2) {
    map.addSource("blockface", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: blockfacePath },
        properties: {},
      },
    });
    map.addLayer({
      id: "blockface-line",
      type: "line",
      source: "blockface",
      paint: {
        "line-color": "#a8a29e",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }

  // 3) Buildable envelope — thicker colored line in the same shade as
  //    the verdict palette. Two layers: a casing (white outline) + the
  //    main line, so the envelope reads on top of busy tile content.
  if (eligibility?.envelope.geometry) {
    const verdict = eligibility.verdict;
    const color =
      verdict === "ELIGIBLE"
        ? "#059669" // emerald-600
        : verdict === "ELIGIBLE_WITH_CAVEATS"
          ? "#d97706" // amber-600
          : "#e11d48"; // rose-600
    map.addSource("envelope", {
      type: "geojson",
      data: eligibility.envelope.geometry,
    });
    map.addLayer({
      id: "envelope-casing",
      type: "line",
      source: "envelope",
      paint: { "line-color": "#ffffff", "line-width": 10 },
    });
    map.addLayer({
      id: "envelope-line",
      type: "line",
      source: "envelope",
      paint: { "line-color": color, "line-width": 6 },
    });
  }

  // 4) Constraint markers — every curb feature returned, color-coded by
  //    type. Click handler shows a popup with the feature's description.
  const constraintFeatures = collectConstraintGeoJson(curbFeatures);
  if (constraintFeatures.length > 0) {
    map.addSource("constraints", {
      type: "geojson",
      data: { type: "FeatureCollection", features: constraintFeatures },
    });
    map.addLayer({
      id: "constraints-circles",
      type: "circle",
      source: "constraints",
      paint: {
        "circle-radius": 5,
        // MapLibre data-driven styling — read the `color` property from
        // each feature to color it. Avoids creating one layer per type.
        "circle-color": ["get", "color"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.85,
      },
    });

    // Hover-style popups on click. MapLibre Popups attach via .setLngLat
    // + .setHTML and stay open until the user clicks elsewhere.
    map.on("click", "constraints-circles", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties as { label?: string; type?: string };
      new maplibregl.Popup()
        .setLngLat(event.lngLat)
        .setHTML(
          `<div style="font: 12px system-ui"><strong>${props.type}</strong><br/>${props.label}</div>`,
        )
        .addTo(map);
    });
    map.on("mouseenter", "constraints-circles", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "constraints-circles", () => {
      map.getCanvas().style.cursor = "";
    });
  }

  // 5) Fit the map to show address + blockface + nearby constraints.
  const bounds = computeBounds(addressLngLat, blockfacePath, constraintFeatures);
  if (bounds) {
    map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 19 });
  }
}

/**
 * Convert every curb feature into a GeoJSON point with `color`, `type`,
 * and `label` properties — keeps the styling and popup data adjacent to
 * the geometry so MapLibre can use them in expressions.
 */
function collectConstraintGeoJson(
  cb: PrescreenResult["curbFeatures"],
): Array<{
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { color: string; type: string; label: string };
}> {
  const all: CurbFeature[] = [
    ...cb.fireHydrants,
    ...cb.crosswalks,
    ...cb.busStops,
    ...cb.loadingZones,
    ...cb.driveways,
    ...cb.adaCurbRamps,
    ...cb.streetTrees,
    ...cb.parkingMeters,
  ];

  const colorByType: Record<string, string> = {
    fire_hydrant: "#dc2626", // red
    crosswalk: "#7c3aed", // violet
    bus_stop: "#2563eb", // blue
    loading_zone: "#ea580c", // orange
    ada_curb_ramp: "#0891b2", // cyan (covers driveways via subtype too)
    street_tree: "#16a34a", // green
    parking_meter: "#737373", // gray
  };

  const labelByType: Record<string, string> = {
    fire_hydrant: "Fire hydrant",
    crosswalk: "Crosswalk",
    bus_stop: "Bus stop",
    loading_zone: "Loading zone",
    ada_curb_ramp: "ADA ramp",
    street_tree: "Street tree",
    parking_meter: "Parking meter",
  };

  return all.map((f) => {
    const isDriveway =
      f.type === "ada_curb_ramp" && f.metadata.subtype === "driveway";
    const typeLabel = isDriveway ? "Driveway curb cut" : labelByType[f.type] ?? f.type;
    return {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [f.location.longitude, f.location.latitude] as [number, number],
      },
      properties: {
        color: colorByType[f.type] ?? "#737373",
        type: typeLabel,
        label: describeForPopup(f),
      },
    };
  });
}

function describeForPopup(f: CurbFeature): string {
  const m = f.metadata;
  switch (f.type) {
    case "fire_hydrant":
      return `${m.assetNum ?? ""} · ${m.bandColor ?? "?"} band · ${m.flowGpm ?? "?"} gpm`;
    case "crosswalk":
      return `${m.detail ?? "marked"} crosswalk`;
    case "bus_stop":
      return `Stop ${m.regionalId ?? ""} on ${m.onStreet ?? "?"} at ${m.atStreet ?? "?"}`;
    case "loading_zone":
      return `LZ ${m.lzId ?? ""} · ${m.nearbyAddress ?? "?"}`;
    case "ada_curb_ramp":
      return m.subtype === "driveway"
        ? `Driveway ${m.gisId ?? ""} (${m.condition ?? "?"})`
        : `Ramp ${m.gisId ?? ""} (${m.condition ?? "?"})`;
    case "street_tree":
      return `${m.commonName ?? "?"} · DBH ${m.dbhInches ?? "?"}"`;
    case "parking_meter":
      return `Meter ${m.meterId ?? ""} · ${m.spaces ?? "?"} spaces`;
    default:
      return JSON.stringify(m);
  }
}

/**
 * Compute a bbox tight enough to show the address + blockface + nearby
 * constraints. Returns null when we have nothing to fit to (shouldn't
 * happen in practice but the type system wants the fallback).
 */
function computeBounds(
  addressLngLat: [number, number],
  blockfacePath: number[][] | undefined,
  constraints: Array<{ geometry: { coordinates: [number, number] } }>,
): LngLatBoundsLike | null {
  let minLng = addressLngLat[0];
  let minLat = addressLngLat[1];
  let maxLng = addressLngLat[0];
  let maxLat = addressLngLat[1];

  const include = (lng: number, lat: number): void => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };

  if (blockfacePath) {
    for (const pt of blockfacePath) {
      if (pt.length >= 2) include(pt[0]!, pt[1]!);
    }
  }
  for (const c of constraints) {
    include(c.geometry.coordinates[0], c.geometry.coordinates[1]);
  }

  if (minLng === maxLng && minLat === maxLat) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
