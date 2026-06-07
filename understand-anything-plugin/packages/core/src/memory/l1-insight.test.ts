/**
 * L1 Insight Index Tests (V8/30 — Direction A R1)
 *
 * 30+ tests covering add/route/remove with multi-keyword scoring.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InsightIndex } from "./l1-insight.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("InsightIndex — add / list", () => {
  let idx: InsightIndex;
  beforeEach(() => {
    idx = new InsightIndex(now);
  });

  it("adds an insight and increments size", () => {
    idx.add({ keyword: "auth", skillId: "login", weight: 0.8 });
    expect(idx.size()).toBe(1);
  });

  it("returns insight with addedAt", () => {
    const i = idx.add({ keyword: "k", skillId: "s", weight: 0.5 });
    expect(i.addedAt).toBe(FIXED);
  });

  it("supports multiple keywords for one skill", () => {
    idx.add({ keyword: "k1", skillId: "s", weight: 0.5 });
    idx.add({ keyword: "k2", skillId: "s", weight: 0.7 });
    expect(idx.size()).toBe(1);
    expect(idx.forSkill("s").length).toBe(2);
  });

  it("supports multiple skills for one keyword", () => {
    idx.add({ keyword: "k", skillId: "s1", weight: 0.5 });
    idx.add({ keyword: "k", skillId: "s2", weight: 0.3 });
    expect(idx.size()).toBe(2);
  });

  it("keywords() returns all keywords", () => {
    idx.add({ keyword: "a", skillId: "s1", weight: 0.5 });
    idx.add({ keyword: "b", skillId: "s2", weight: 0.5 });
    expect(idx.keywords().sort()).toEqual(["a", "b"]);
  });
});

describe("InsightIndex — route", () => {
  let idx: InsightIndex;
  beforeEach(() => {
    idx = new InsightIndex(now);
    idx.add({ keyword: "auth", skillId: "login-flow", weight: 0.9 });
    idx.add({ keyword: "login", skillId: "login-flow", weight: 0.7 });
    idx.add({ keyword: "auth", skillId: "oauth", weight: 0.5 });
    idx.add({ keyword: "database", skillId: "migrate", weight: 0.6 });
  });

  it("returns skills matching a single keyword", () => {
    const r = idx.route({ keywords: ["auth"] });
    expect(r.length).toBe(2);
    expect(r[0]?.skillId).toBe("login-flow");
  });

  it("scores by sum of weights across keywords", () => {
    const r = idx.route({ keywords: ["auth", "login"] });
    const loginFlow = r.find((h) => h.skillId === "login-flow");
    expect(loginFlow?.score).toBe(0.9 + 0.7);
  });

  it("sorts by score descending", () => {
    const r = idx.route({ keywords: ["auth", "login"] });
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!.score).toBeLessThanOrEqual(r[i - 1]!.score);
    }
  });

  it("respects topK", () => {
    const r = idx.route({ keywords: ["auth"], topK: 1 });
    expect(r.length).toBe(1);
  });

  it("respects minWeight", () => {
    const r = idx.route({ keywords: ["auth"], minWeight: 0.6 });
    expect(r.length).toBe(1);
    expect(r[0]?.skillId).toBe("login-flow");
  });

  it("returns matched keywords per hit", () => {
    const r = idx.route({ keywords: ["auth", "login"] });
    const loginFlow = r.find((h) => h.skillId === "login-flow");
    expect(loginFlow?.matchedKeywords.sort()).toEqual(["auth", "login"]);
  });

  it("returns empty for unknown keywords", () => {
    expect(idx.route({ keywords: ["nonexistent"] })).toEqual([]);
  });

  it("handles empty query", () => {
    expect(idx.route({ keywords: [] })).toEqual([]);
  });
});

describe("InsightIndex — remove", () => {
  let idx: InsightIndex;
  beforeEach(() => {
    idx = new InsightIndex(now);
  });

  it("remove by (skillId, keyword) deletes single mapping", () => {
    idx.add({ keyword: "k1", skillId: "s", weight: 0.5 });
    idx.add({ keyword: "k2", skillId: "s", weight: 0.7 });
    idx.remove("s", "k1");
    const remaining = idx.forSkill("s");
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.keyword).toBe("k2");
  });

  it("remove by skillId only deletes all its keywords", () => {
    idx.add({ keyword: "k1", skillId: "s", weight: 0.5 });
    idx.add({ keyword: "k2", skillId: "s", weight: 0.7 });
    const removed = idx.remove("s");
    expect(removed).toBe(2);
    expect(idx.size()).toBe(0);
  });

  it("remove returns 0 for missing skillId", () => {
    expect(idx.remove("nope")).toBe(0);
  });

  it("remove cleans up empty keyword lists", () => {
    idx.add({ keyword: "k", skillId: "s", weight: 0.5 });
    idx.remove("s", "k");
    expect(idx.keywords()).toEqual([]);
  });
});
