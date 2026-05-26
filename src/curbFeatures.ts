/**
 * Uniform shape every curbside-data fetcher returns.
 *
 * The spec promises all four data-layer tiers converge at a common shape
 * so the buffer-checking logic stays clean regardless of source. This is
 * that shape.
 *
 * `distanceToEnvelopeFt` is left undefined by fetchers — the eligibility
 * engine fills it in once the buildable envelope has been computed.
 */

export type CurbFeatureType =
  | "loading_zone"
  | "parking_meter"
  | "fire_hydrant"
  | "bicycle_lane"
  | "bus_stop"
  | "street_tree"
  | "ada_curb_ramp"
  | "crosswalk";

export interface CurbFeature {
  type: CurbFeatureType;
  location: {
    latitude: number;
    longitude: number;
  };
  // Dataset-specific extras: meter ID, LZ_ID, tree species, hydrant flow,
  // etc. Keyed loosely so each fetcher decides what's worth surfacing.
  metadata: Record<string, unknown>;
  // Distance from this feature to the buildable envelope, in feet. Set by
  // the eligibility engine downstream, not by the fetcher.
  distanceToEnvelopeFt?: number;
}
