/**
 * Bounding-box helpers for Tier 4 spatial queries.
 *
 * Several DC Open Data layers (street trees, ADA curb ramps, crosswalks,
 * loading zone signs) have no join keys, so we have to ask "give me every
 * feature inside this rectangle." That rectangle is a bbox: {xmin, ymin,
 * xmax, ymax} in WGS84 lat/lon.
 *
 * The arithmetic here is a flat-earth approximation — it ignores the fact
 * that the earth is curved. Over a few hundred feet at DC's latitude the
 * error is well under an inch, which is more than fine for "is this hydrant
 * within 10 ft of the parking lane?"
 */

/**
 * One degree of latitude is ~364,000 ft anywhere on Earth (lines of latitude
 * are parallel circles). This is a constant we can hard-code.
 */
const FEET_PER_DEGREE_LATITUDE = 364_000;

/**
 * One degree of longitude varies with latitude — the lines converge at the
 * poles. At DC (latitude ~38.9°), one degree of longitude is
 * cos(38.9°) × 364,000 ≈ 283,500 ft. We compute this from the actual
 * latitude passed in, so this code works anywhere in the DC area.
 *
 * Math.cos expects radians, not degrees, so we multiply by π/180.
 */
function feetPerDegreeLongitudeAt(latitudeDegrees: number): number {
  const latitudeRadians = latitudeDegrees * (Math.PI / 180);
  return Math.cos(latitudeRadians) * FEET_PER_DEGREE_LATITUDE;
}

export interface BBox {
  xmin: number; // western longitude
  ymin: number; // southern latitude
  xmax: number; // eastern longitude
  ymax: number; // northern latitude
}

/**
 * Build a bbox by expanding a single point outward by `radiusFt` in every
 * direction. Returns lat/lon corners suitable for an ArcGIS spatial query.
 */
export function bboxAroundPoint(
  latitude: number,
  longitude: number,
  radiusFt: number,
): BBox {
  const dLat = radiusFt / FEET_PER_DEGREE_LATITUDE;
  const dLon = radiusFt / feetPerDegreeLongitudeAt(latitude);
  return {
    xmin: longitude - dLon,
    ymin: latitude - dLat,
    xmax: longitude + dLon,
    ymax: latitude + dLat,
  };
}

/**
 * ArcGIS REST APIs accept a bbox as a comma-separated string in the
 * `geometry` parameter when `geometryType=esriGeometryEnvelope`. This
 * helper formats it.
 */
export function bboxToArcgisGeometry(bbox: BBox): string {
  return `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`;
}
