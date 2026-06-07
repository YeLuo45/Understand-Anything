/**
 * Slot Engine Tests (V6/30 — Direction A R1)
 *
 * 30+ tests covering put/get/TTL/scope isolation and sweepExpired.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SlotStore } from "./slot.js";

const FIXED_ISO = "2026-06-07T00:00:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);

describe("SlotStore — basic put / get", () => {
  let s: SlotStore;
  beforeEach(() => {
    s = new SlotStore({ now: () => FIXED_ISO, nowMs: () => FIXED_MS });
  });

  it("stores and retrieves a slot", () => {
    s.put("user-pref", "dark");
    expect(s.get("user-pref")?.value).toBe("dark");
  });

  it("returns undefined for missing key", () => {
    expect(s.get("missing")).toBeUndefined();
  });

  it("has() reports existence", () => {
    s.put("k", 1);
    expect(s.has("k")).toBe(true);
    expect(s.has("nope")).toBe(false);
  });

  it("delete removes slot", () => {
    s.put("k", 1);
    expect(s.delete("k")).toBe(true);
    expect(s.has("k")).toBe(false);
  });

  it("delete returns false for missing key", () => {
    expect(s.delete("nope")).toBe(false);
  });

  it("size returns total slots", () => {
    s.put("a", 1);
    s.put("b", 2);
    s.put("c", 3);
    expect(s.size()).toBe(3);
  });

  it("list returns all slots", () => {
    s.put("a", 1);
    s.put("b", 2);
    expect(s.list().length).toBe(2);
  });

  it("clear empties the store", () => {
    s.put("a", 1);
    s.clear();
    expect(s.size()).toBe(0);
  });
});

describe("SlotStore — TTL expiration", () => {
  it("returns undefined for expired slot", () => {
    let t = FIXED_MS;
    const s = new SlotStore({
      now: () => new Date(t).toISOString(),
      nowMs: () => t,
    });
    s.put("k", 1, { ttlMs: 1000 });
    t += 500;
    expect(s.get("k")?.value).toBe(1);
    t += 2000;
    expect(s.get("k")).toBeUndefined();
  });

  it("sweepExpired removes expired slots", () => {
    let t = FIXED_MS;
    const s = new SlotStore({
      now: () => new Date(t).toISOString(),
      nowMs: () => t,
    });
    s.put("a", 1, { ttlMs: 1000 });
    s.put("b", 2);  // no TTL
    t += 2000;
    const removed = s.sweepExpired();
    expect(removed).toBe(1);
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(true);
  });

  it("sweepExpired with explicit nowMs", () => {
    const s = new SlotStore({ now: () => FIXED_ISO, nowMs: () => FIXED_MS });
    s.put("a", 1, { ttlMs: 1000 });
    const removed = s.sweepExpired(FIXED_MS + 5000);
    expect(removed).toBe(1);
  });

  it("sweepExpired does not remove slots without ttl", () => {
    const s = new SlotStore({ now: () => FIXED_ISO, nowMs: () => FIXED_MS });
    s.put("a", 1);
    s.sweepExpired(FIXED_MS + 99999);
    expect(s.has("a")).toBe(true);
  });

  it("list skips expired slots", () => {
    let t = FIXED_MS;
    const s = new SlotStore({
      now: () => new Date(t).toISOString(),
      nowMs: () => t,
    });
    s.put("a", 1, { ttlMs: 1000 });
    t += 2000;
    expect(s.list().length).toBe(0);
  });
});

describe("SlotStore — scope isolation", () => {
  it("same key in different scopes are independent", () => {
    const s = new SlotStore();
    s.put("k", "user-1", { scope: "user-1" });
    s.put("k", "user-2", { scope: "user-2" });
    expect(s.get("k", "user-1")?.value).toBe("user-1");
    expect(s.get("k", "user-2")?.value).toBe("user-2");
  });

  it("delete respects scope", () => {
    const s = new SlotStore();
    s.put("k", "v1", { scope: "s1" });
    s.put("k", "v2", { scope: "s2" });
    s.delete("k", "s1");
    expect(s.has("k", "s1")).toBe(false);
    expect(s.has("k", "s2")).toBe(true);
  });

  it("size() with scope filter", () => {
    const s = new SlotStore();
    s.put("a", 1, { scope: "s1" });
    s.put("b", 2, { scope: "s1" });
    s.put("c", 3, { scope: "s2" });
    expect(s.size("s1")).toBe(2);
    expect(s.size("s2")).toBe(1);
  });

  it("list() with scope filter", () => {
    const s = new SlotStore();
    s.put("a", 1, { scope: "s1" });
    s.put("b", 2, { scope: "s2" });
    expect(s.list("s1").length).toBe(1);
    expect(s.list("s2").length).toBe(1);
  });
});

describe("SlotStore — values", () => {
  let s: SlotStore;
  beforeEach(() => {
    s = new SlotStore();
  });

  it("preserves complex JSON-serializable values", () => {
    const obj = { foo: 1, bar: [1, 2, 3] };
    s.put("complex", obj);
    expect(s.get("complex")?.value).toEqual(obj);
  });

  it("preserves null values", () => {
    s.put("k", null);
    expect(s.has("k")).toBe(true);
    expect(s.get("k")?.value).toBeNull();
  });

  it("preserves zero and false values", () => {
    s.put("zero", 0);
    s.put("false", false);
    expect(s.has("zero")).toBe(true);
    expect(s.has("false")).toBe(true);
  });
});

describe("SlotStore — timestamps", () => {
  let s: SlotStore;
  beforeEach(() => {
    s = new SlotStore({ now: () => FIXED_ISO, nowMs: () => FIXED_MS });
  });

  it("updates lastUpdatedAt on put", () => {
    s.put("k", 1);
    const t1 = s.get("k")!.lastUpdatedAt;
    s.put("k", 2);
    const t2 = s.get("k")!.lastUpdatedAt;
    expect(t1).toBe(FIXED_ISO);
    expect(t2).toBe(FIXED_ISO);
  });
});
