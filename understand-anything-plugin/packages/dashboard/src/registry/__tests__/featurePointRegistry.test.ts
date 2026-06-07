/**
 * UI Learn — Feature Point registry tests (V1/15)
 *
 * Validates the pure registry builder (no React, no DOM).
 */

import { describe, it, expect } from "vitest";
import type { FeaturePoint } from "../../types/featurePoints";
import {
  buildFeaturePointRegistry,
  EMPTY_FEATURE_POINT_REGISTRY,
} from "../featurePointRegistry";

const sample: FeaturePoint = {
  id: "feature:login",
  title: "User login",
  description: "Sign in via username/password",
  icon: "log-in",
  tags: ["auth", "ui"],
  crud: { create: [], read: [], update: [], delete: [] },
  diagram: {
    kind: "sequence",
    steps: [
      { id: "s1", nodeId: "f:LoginForm", actor: "Form", message: "submit" },
    ],
    edges: [],
  },
  confidence: 0.9,
};

const other: FeaturePoint = {
  ...sample,
  id: "feature:logout",
  title: "User logout",
  description: "End the current session",
  tags: ["auth"],
};

describe("buildFeaturePointRegistry", () => {
  it("indexes features by id", () => {
    const r = buildFeaturePointRegistry([sample, other]);
    expect(r.byId["feature:login"]).toBe(sample);
    expect(r.byId["feature:logout"]).toBe(other);
    expect(r.features).toHaveLength(2);
  });

  it("returns empty registry constant with zero features", () => {
    expect(EMPTY_FEATURE_POINT_REGISTRY.features).toEqual([]);
    expect(EMPTY_FEATURE_POINT_REGISTRY.byId).toEqual({});
  });

  it("filters by tag case-sensitively on the input", () => {
    const r = buildFeaturePointRegistry([sample, other]);
    expect(r.filterByTag("auth")).toHaveLength(2);
    expect(r.filterByTag("ui")).toEqual([sample]);
    expect(r.filterByTag("missing")).toEqual([]);
  });

  it("searches case-insensitive on title/description/tags", () => {
    const r = buildFeaturePointRegistry([sample, other]);
    expect(r.search("LOGIN")).toEqual([sample]);
    expect(r.search("password")).toEqual([sample]); // description match
    expect(r.search("auth")).toHaveLength(2);
    expect(r.search("   ")).toHaveLength(2); // whitespace → all
    expect(r.search("nope")).toEqual([]);
  });
});
