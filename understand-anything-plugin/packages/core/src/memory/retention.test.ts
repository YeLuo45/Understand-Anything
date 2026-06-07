/**
 * RetentionEngine Tests (V22/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { RetentionEngine } from "./retention.js";
import { MemoryKV } from "./kv.js";

const FIXED_MS = Date.parse("2026-06-07T00:00:00.000Z");

describe("RetentionEngine — no policy", () => {
  it("does nothing without policies", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const r = new RetentionEngine().apply(kv);
    expect(r.evicted).toBe(0);
    expect(r.archived).toBe(0);
  });
});

describe("RetentionEngine — maxAgeDays", () => {
  it("evicts entries older than maxAgeDays", () => {
    const kv = new MemoryKV();
    const oldTs = new Date(FIXED_MS - 100 * 86_400_000).toISOString();
    // Pre-populate by mutating through fingerprint trick
    kv.put({ id: "m1", content: "x" });
    // Manually set createdAt via touchAccess is hard; instead use the now() option in KV
    // Simpler: pass now to RetentionEngine and accept that creation time is current
    const eng = new RetentionEngine({
      defaultPolicy: { maxAgeDays: 30 },
      now: () => FIXED_MS,
    });
    // Manually set the entry's createdAt to 100 days ago via KV internals
    const e = kv.get("m1")!;
    (e as { createdAt: string }).createdAt = oldTs;
    const r = eng.apply(kv);
    expect(r.evicted).toBe(1);
  });

  it("keeps entries within age limit", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const eng = new RetentionEngine({
      defaultPolicy: { maxAgeDays: 365 },
      now: () => FIXED_MS,
    });
    const r = eng.apply(kv);
    expect(r.evicted).toBe(0);
  });
});

describe("RetentionEngine — archiveAfterDays", () => {
  it("archives entries older than archiveAfterDays", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const oldTs = new Date(FIXED_MS - 100 * 86_400_000).toISOString();
    (kv.get("m1") as { createdAt: string }).createdAt = oldTs;
    const eng = new RetentionEngine({
      defaultPolicy: { archiveAfterDays: 30 },
      now: () => FIXED_MS,
    });
    const r = eng.apply(kv);
    expect(r.archived).toBe(1);
    expect(kv.get("m1")?.lifecycle).toBe("archived");
  });
});

describe("RetentionEngine — maxEntries per scope", () => {
  it("evicts oldest entries when over cap", () => {
    const kv = new MemoryKV();
    const baseMs = FIXED_MS;
    for (let i = 0; i < 5; i++) {
      const ts = new Date(baseMs + i * 1000).toISOString();
      kv.put({ content: `c${i}`, scope: "test" });
      // Mutate createdAt
      (kv.list({ scope: "test" })[i] as { createdAt: string }).createdAt = ts;
    }
    const eng = new RetentionEngine({
      defaultPolicy: { maxEntries: 3 },
      now: () => FIXED_MS + 10_000,
    });
    const r = eng.apply(kv);
    expect(r.evicted).toBe(2);
    expect(kv.list({ scope: "test" }).length).toBe(3);
  });
});

describe("RetentionEngine — per-scope policy", () => {
  it("applies scope-specific policy", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x", scope: "transient" });
    kv.put({ id: "m2", content: "y", scope: "permanent" });
    const oldTs = new Date(FIXED_MS - 100 * 86_400_000).toISOString();
    (kv.get("m1") as { createdAt: string }).createdAt = oldTs;
    (kv.get("m2") as { createdAt: string }).createdAt = oldTs;
    const eng = new RetentionEngine({
      scopePolicies: {
        transient: { maxAgeDays: 30 },
        permanent: { maxAgeDays: 3650 },
      },
      now: () => FIXED_MS,
    });
    const r = eng.apply(kv);
    expect(r.evicted).toBe(1);
    expect(kv.get("m1")).toBeUndefined();
    expect(kv.get("m2")).toBeDefined();
  });
});

describe("RetentionEngine — custom expire lifecycle", () => {
  it("uses custom lifecycle (archive) instead of evicting", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const oldTs = new Date(FIXED_MS - 100 * 86_400_000).toISOString();
    (kv.get("m1") as { createdAt: string }).createdAt = oldTs;
    const eng = new RetentionEngine({
      defaultPolicy: { maxAgeDays: 30 },
      expireLifecycle: "archived",
      now: () => FIXED_MS,
    });
    eng.apply(kv);
    expect(kv.get("m1")?.lifecycle).toBe("archived");
  });
});
