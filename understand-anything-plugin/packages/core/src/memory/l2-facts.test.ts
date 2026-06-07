/**
 * L2 Global Facts Tests (V9/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GlobalFactsStore } from "./l2-facts.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("GlobalFactsStore — set / get", () => {
  let s: GlobalFactsStore;
  beforeEach(() => {
    s = new GlobalFactsStore(now);
  });

  it("sets a new fact", () => {
    const f = s.set({ key: "lang", value: "zh-CN" });
    expect(f.key).toBe("lang");
    expect(f.value).toBe("zh-CN");
    expect(f.version).toBe(1);
    expect(s.size()).toBe(1);
  });

  it("get returns fact by id", () => {
    const f = s.set({ key: "k", value: 1 });
    expect(s.get(f.id)?.value).toBe(1);
  });

  it("getByKey returns fact by key", () => {
    s.set({ key: "k", value: 1 });
    expect(s.getByKey("k")?.value).toBe(1);
  });

  it("getByKey returns undefined for missing key", () => {
    expect(s.getByKey("nope")).toBeUndefined();
  });

  it("defaults category to config", () => {
    const f = s.set({ key: "k", value: 1 });
    expect(f.category).toBe("config");
  });

  it("uses provided category", () => {
    const f = s.set({ key: "k", value: 1, category: "preference" });
    expect(f.category).toBe("preference");
  });
});

describe("GlobalFactsStore — update (idempotent set)", () => {
  let s: GlobalFactsStore;
  beforeEach(() => {
    s = new GlobalFactsStore(now);
  });

  it("set on existing key increments version", () => {
    s.set({ key: "k", value: 1 });
    const f2 = s.set({ key: "k", value: 2 });
    expect(f2.version).toBe(2);
    expect(s.size()).toBe(1);
  });

  it("update preserves category when not provided", () => {
    s.set({ key: "k", value: 1, category: "preference" });
    const f2 = s.set({ key: "k", value: 2 });
    expect(f2.category).toBe("preference");
  });

  it("update allows category change", () => {
    s.set({ key: "k", value: 1, category: "preference" });
    const f2 = s.set({ key: "k", value: 2, category: "config" });
    expect(f2.category).toBe("config");
  });

  it("update preserves source when not provided", () => {
    s.set({ key: "k", value: 1, source: "user" });
    const f2 = s.set({ key: "k", value: 2 });
    expect(f2.source).toBe("user");
  });
});

describe("GlobalFactsStore — delete", () => {
  let s: GlobalFactsStore;
  beforeEach(() => {
    s = new GlobalFactsStore(now);
  });

  it("delete by id", () => {
    const f = s.set({ key: "k", value: 1 });
    expect(s.delete(f.id)).toBe(true);
    expect(s.size()).toBe(0);
  });

  it("delete by key", () => {
    s.set({ key: "k", value: 1 });
    expect(s.delete("k")).toBe(true);
  });

  it("delete returns false for missing", () => {
    expect(s.delete("nope")).toBe(false);
  });
});

describe("GlobalFactsStore — list", () => {
  let s: GlobalFactsStore;
  beforeEach(() => {
    s = new GlobalFactsStore(now);
    s.set({ key: "a", value: 1, category: "preference" });
    s.set({ key: "b", value: 2, category: "config" });
    s.set({ key: "c", value: 3, category: "preference" });
  });

  it("list returns all when no filter", () => {
    expect(s.list().length).toBe(3);
  });

  it("list filters by category", () => {
    expect(s.list({ category: "preference" }).length).toBe(2);
    expect(s.list({ category: "config" }).length).toBe(1);
  });

  it("clear empties the store", () => {
    s.clear();
    expect(s.size()).toBe(0);
  });
});
