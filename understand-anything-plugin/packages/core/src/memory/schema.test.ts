/**
 * Memory Layer Schema Tests (V1/30 — Direction A R1)
 *
 * 30+ tests covering MemoryEntry creation, lifecycle state machine,
 * fingerprint dedup, confidence validation, terminal states, and
 * effective scoring.
 */

import { describe, it, expect } from "vitest";
import {
  fingerprintId,
  isValidConfidence,
  isValidLifecycle,
  isTerminal,
  canTransition,
  createMemoryEntry,
  touchAccess,
  effectiveScore,
  LIFECYCLE_VALUES,
  type MemoryLifecycle,
  type MemoryEntry,
} from "./schema.js";

const FIXED_NOW = "2026-06-07T00:00:00.000Z";
const now = () => FIXED_NOW;

describe("MemoryLifecycle enum", () => {
  it("exposes 5 lifecycle values in canonical order", () => {
    expect(LIFECYCLE_VALUES).toEqual([
      "active",
      "consolidated",
      "stale",
      "evicted",
      "archived",
    ]);
  });

  it("accepts each lifecycle value as valid", () => {
    for (const v of LIFECYCLE_VALUES) {
      expect(isValidLifecycle(v)).toBe(true);
    }
  });

  it("rejects unknown lifecycle strings", () => {
    expect(isValidLifecycle("paused")).toBe(false);
    expect(isValidLifecycle("")).toBe(false);
    expect(isValidLifecycle("ACTIVE")).toBe(false);
  });
});

describe("fingerprintId", () => {
  it("returns 16-char hex string", () => {
    const fp = fingerprintId("hello");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for identical content", () => {
    expect(fingerprintId("foo bar")).toBe(fingerprintId("foo bar"));
  });

  it("produces different hashes for different content", () => {
    expect(fingerprintId("a")).not.toBe(fingerprintId("b"));
    expect(fingerprintId("hello")).not.toBe(fingerprintId("Hello"));
    expect(fingerprintId("foo bar")).not.toBe(fingerprintId("foo  bar"));
  });

  it("handles empty string", () => {
    const fp = fingerprintId("");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles unicode content", () => {
    const fp = fingerprintId("中文测试 🎉");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprintId("中文测试 🎉")).toBe(fp);
  });

  it("handles long content (10k chars)", () => {
    const long = "x".repeat(10_000);
    const fp = fingerprintId(long);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("isValidConfidence", () => {
  it("accepts boundary values 0 and 1", () => {
    expect(isValidConfidence(0)).toBe(true);
    expect(isValidConfidence(1)).toBe(true);
  });

  it("accepts fractional values", () => {
    expect(isValidConfidence(0.5)).toBe(true);
    expect(isValidConfidence(0.123456)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidConfidence(-0.01)).toBe(false);
    expect(isValidConfidence(1.01)).toBe(false);
    expect(isValidConfidence(2)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(isValidConfidence(NaN)).toBe(false);
    expect(isValidConfidence(Infinity)).toBe(false);
    expect(isValidConfidence(-Infinity)).toBe(false);
  });
});

describe("isTerminal", () => {
  it("identifies evicted/archived as terminal", () => {
    expect(isTerminal("evicted")).toBe(true);
    expect(isTerminal("archived")).toBe(true);
  });

  it("treats active/consolidated/stale as non-terminal", () => {
    expect(isTerminal("active")).toBe(false);
    expect(isTerminal("consolidated")).toBe(false);
    expect(isTerminal("stale")).toBe(false);
  });
});

describe("canTransition (lifecycle state machine)", () => {
  it("allows active → consolidated/stale/evicted/archived", () => {
    expect(canTransition("active", "consolidated")).toBe(true);
    expect(canTransition("active", "stale")).toBe(true);
    expect(canTransition("active", "evicted")).toBe(true);
    expect(canTransition("active", "archived")).toBe(true);
  });

  it("rejects active → active (no-op is not a transition)", () => {
    expect(canTransition("active", "active")).toBe(false);
  });

  it("allows stale → active (recovery) and stale → evicted/archived", () => {
    expect(canTransition("stale", "active")).toBe(true);
    expect(canTransition("stale", "evicted")).toBe(true);
    expect(canTransition("stale", "archived")).toBe(true);
  });

  it("rejects stale → consolidated (must re-activate first)", () => {
    expect(canTransition("stale", "consolidated")).toBe(false);
  });

  it("allows archived → evicted only", () => {
    expect(canTransition("archived", "evicted")).toBe(true);
    expect(canTransition("archived", "active")).toBe(false);
    expect(canTransition("archived", "consolidated")).toBe(false);
  });

  it("allows evicted → archived only", () => {
    expect(canTransition("evicted", "archived")).toBe(true);
    expect(canTransition("evicted", "active")).toBe(false);
  });
});

describe("createMemoryEntry", () => {
  it("creates entry with default values", () => {
    const e = createMemoryEntry("m1", { content: "hello" }, now);
    expect(e.id).toBe("m1");
    expect(e.content).toBe("hello");
    expect(e.confidence).toBe(0.5);
    expect(e.lifecycle).toBe("active");
    expect(e.tags).toEqual([]);
    expect(e.scope).toBe("default");
    expect(e.accessCount).toBe(0);
    expect(e.relatedIds).toEqual([]);
    expect(e.createdAt).toBe(FIXED_NOW);
    expect(e.lastAccessedAt).toBe(FIXED_NOW);
  });

  it("uses provided confidence / tags / scope / metadata", () => {
    const e = createMemoryEntry("m1", {
      content: "x",
      confidence: 0.9,
      tags: ["a", "b"],
      scope: "project-A",
      metadata: { foo: 1 },
      summary: "sum",
      source: "hook-x",
    }, now);
    expect(e.confidence).toBe(0.9);
    expect(e.tags).toEqual(["a", "b"]);
    expect(e.scope).toBe("project-A");
    expect(e.metadata).toEqual({ foo: 1 });
    expect(e.summary).toBe("sum");
    expect(e.source).toBe("hook-x");
  });

  it("auto-fills fingerprint from content", () => {
    const e = createMemoryEntry("m1", { content: "abc" }, now);
    expect(e.fingerprint).toBe(fingerprintId("abc"));
  });

  it("throws on empty content", () => {
    expect(() => createMemoryEntry("m1", { content: "" }, now)).toThrow();
  });

  it("throws on out-of-range confidence", () => {
    expect(() => createMemoryEntry("m1", { content: "x", confidence: 1.5 }, now))
      .toThrow();
  });

  it("preserves expiresAt when provided", () => {
    const e = createMemoryEntry("m1", {
      content: "x",
      expiresAt: "2027-01-01T00:00:00.000Z",
    }, now);
    expect(e.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("touchAccess", () => {
  it("increments accessCount and updates lastAccessedAt", () => {
    const e = createMemoryEntry("m1", { content: "x" }, now);
    const t1 = touchAccess(e, now);
    expect(t1.accessCount).toBe(1);
    expect(t1.lastAccessedAt).toBe(FIXED_NOW);

    const later = "2026-06-08T00:00:00.000Z";
    const t2 = touchAccess(t1, () => later);
    expect(t2.accessCount).toBe(2);
    expect(t2.lastAccessedAt).toBe(later);
  });

  it("returns a new object (immutability)", () => {
    const e = createMemoryEntry("m1", { content: "x" }, now);
    const t = touchAccess(e, now);
    expect(t).not.toBe(e);
    expect(e.accessCount).toBe(0);  // original unchanged
  });
});

describe("effectiveScore", () => {
  it("returns 0 for terminal entries", () => {
    const e: MemoryEntry = {
      ...createMemoryEntry("m1", { content: "x" }, now),
      lifecycle: "evicted",
    };
    expect(effectiveScore(e, now)).toBe(0);
  });

  it("returns confidence × freshness for active entries", () => {
    const e = createMemoryEntry("m1", { content: "x", confidence: 1.0 }, now);
    // 0 days old → freshness = 1 / (1 + 0) = 1
    expect(effectiveScore(e, now)).toBeCloseTo(1.0, 5);
  });

  it("decays with age (30-day half-life)", () => {
    const e = createMemoryEntry("m1", { content: "x", confidence: 1.0 }, now);
    const thirtyDaysLater = "2026-07-07T00:00:00.000Z";
    // 30 days old → freshness = 1 / (1 + 1) = 0.5
    expect(effectiveScore(e, () => thirtyDaysLater)).toBeCloseTo(0.5, 5);
  });

  it("scales with confidence", () => {
    const e1 = createMemoryEntry("m1", { content: "x", confidence: 0.2 }, now);
    const e2 = createMemoryEntry("m2", { content: "x", confidence: 0.8 }, now);
    expect(effectiveScore(e2, now)).toBeCloseTo(4 * effectiveScore(e1, now), 5);
  });
});
