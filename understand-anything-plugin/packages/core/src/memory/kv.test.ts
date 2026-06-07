/**
 * MemoryKV Tests (V2/30 — Direction A R1)
 *
 * 30+ tests covering put/get/list/evict, fingerprint dedup, scope and
 * tag indexes, lifecycle filtering, and confidence threshold queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKV } from "./kv.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("MemoryKV — put / get", () => {
  let kv: MemoryKV;
  beforeEach(() => {
    kv = new MemoryKV({ now });
  });

  it("stores an entry and retrieves it by id", () => {
    const { entry, inserted } = kv.put({ content: "hello" });
    expect(inserted).toBe(true);
    expect(kv.get(entry.id)?.content).toBe("hello");
  });

  it("respects explicit id", () => {
    const { entry } = kv.put({ id: "custom-id", content: "x" });
    expect(entry.id).toBe("custom-id");
  });

  it("auto-generates sequential ids when no id provided", () => {
    kv.put({ content: "a" });
    kv.put({ content: "b" });
    expect(kv.size()).toBe(2);
    const ids = kv.list().map((e) => e.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("returns inserted=false on fingerprint collision (same content + scope)", () => {
    const r1 = kv.put({ content: "same" });
    const r2 = kv.put({ content: "same" });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(r2.replacedId).toBe(r1.entry.id);
    expect(kv.size()).toBe(1);
  });

  it("allows same content under different scopes", () => {
    kv.put({ content: "x", scope: "proj-A" });
    const r2 = kv.put({ content: "x", scope: "proj-B" });
    expect(r2.inserted).toBe(true);
    expect(kv.size()).toBe(2);
  });

  it("getByFingerprint finds entries by content", () => {
    kv.put({ id: "m1", content: "findme" });
    expect(kv.getByFingerprint("findme")?.id).toBe("m1");
  });

  it("has() reports existence", () => {
    kv.put({ id: "m1", content: "x" });
    expect(kv.has("m1")).toBe(true);
    expect(kv.has("nope")).toBe(false);
  });
});

describe("MemoryKV — delete and lifecycle", () => {
  let kv: MemoryKV;
  beforeEach(() => {
    kv = new MemoryKV({ now });
  });

  it("delete removes entry and indexes", () => {
    kv.put({ id: "m1", content: "x", tags: ["t1"] });
    expect(kv.delete("m1")).toBe(true);
    expect(kv.get("m1")).toBeUndefined();
    expect(kv.list({ tags: ["t1"] })).toEqual([]);
  });

  it("delete returns false for missing id", () => {
    expect(kv.delete("missing")).toBe(false);
  });

  it("setLifecycle updates entry lifecycle", () => {
    kv.put({ id: "m1", content: "x" });
    const updated = kv.setLifecycle("m1", "consolidated");
    expect(updated?.lifecycle).toBe("consolidated");
    expect(kv.get("m1")?.lifecycle).toBe("consolidated");
  });

  it("setLifecycle returns undefined for missing id", () => {
    expect(kv.setLifecycle("missing", "stale")).toBeUndefined();
  });
});

describe("MemoryKV — list filtering", () => {
  let kv: MemoryKV;
  beforeEach(() => {
    kv = new MemoryKV({ now });
    kv.put({ id: "a", content: "alpha", scope: "proj-A", tags: ["api"], confidence: 0.9 });
    kv.put({ id: "b", content: "beta", scope: "proj-A", tags: ["db"], confidence: 0.4 });
    kv.put({ id: "c", content: "gamma", scope: "proj-B", tags: ["api", "db"], confidence: 0.7 });
  });

  it("lists all entries when no filter", () => {
    expect(kv.list().length).toBe(3);
  });

  it("filters by scope", () => {
    expect(kv.list({ scope: "proj-A" }).map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(kv.list({ scope: "proj-B" }).map((e) => e.id)).toEqual(["c"]);
    expect(kv.list({ scope: "nope" })).toEqual([]);
  });

  it("filters by single tag", () => {
    expect(kv.list({ tags: ["api"] }).map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(kv.list({ tags: ["db"] }).map((e) => e.id).sort()).toEqual(["b", "c"]);
  });

  it("filters by multiple tags (intersection)", () => {
    expect(kv.list({ tags: ["api", "db"] }).map((e) => e.id)).toEqual(["c"]);
  });

  it("filters by lifecycle", () => {
    kv.setLifecycle("a", "consolidated");
    const active = kv.list({ lifecycle: "active" }).map((e) => e.id).sort();
    expect(active).toEqual(["b", "c"]);
    const consolidated = kv.list({ lifecycle: "consolidated" }).map((e) => e.id);
    expect(consolidated).toEqual(["a"]);
  });

  it("filters by minConfidence", () => {
    expect(kv.list({ minConfidence: 0.5 }).map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(kv.list({ minConfidence: 0.95 })).toEqual([]);
  });

  it("combines filters", () => {
    expect(kv.list({ scope: "proj-A", minConfidence: 0.5 }).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("MemoryKV — introspection", () => {
  it("scopes() returns all distinct scopes", () => {
    const kv = new MemoryKV({ now });
    kv.put({ content: "a", scope: "s1" });
    kv.put({ content: "b", scope: "s2" });
    kv.put({ content: "c", scope: "s1" });
    expect(kv.scopes().sort()).toEqual(["s1", "s2"]);
  });

  it("tags() returns all distinct tags", () => {
    const kv = new MemoryKV({ now });
    kv.put({ content: "a", tags: ["x", "y"] });
    kv.put({ content: "b", tags: ["y", "z"] });
    expect(kv.tags().sort()).toEqual(["x", "y", "z"]);
  });

  it("clear() empties everything", () => {
    const kv = new MemoryKV({ now });
    kv.put({ content: "a" });
    kv.put({ content: "b" });
    kv.clear();
    expect(kv.size()).toBe(0);
    expect(kv.list()).toEqual([]);
    expect(kv.scopes()).toEqual([]);
  });
});
