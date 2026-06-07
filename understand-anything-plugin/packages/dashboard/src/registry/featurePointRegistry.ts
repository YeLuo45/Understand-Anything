/**
 * UI Learn — Feature Point registry builders (V1/15 minimal implementation)
 *
 * These helpers are pure functions over `FeaturePoint[]` and produce a
 * `FeaturePointRegistry` with index + filter/search methods. No I/O.
 */

import type {
  FeaturePoint,
  FeaturePointRegistry,
} from "../types/featurePoints";

export function buildFeaturePointRegistry(
  features: readonly FeaturePoint[],
): FeaturePointRegistry {
  const byId: Record<string, FeaturePoint> = {};
  for (const f of features) byId[f.id] = f;

  return {
    features,
    byId,
    filterByTag(tag) {
      return features.filter((f) => f.tags.includes(tag));
    },
    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return features;
      return features.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      );
    },
  };
}

/** Empty registry for fallback / loading states. */
export const EMPTY_FEATURE_POINT_REGISTRY: FeaturePointRegistry =
  buildFeaturePointRegistry([]);
