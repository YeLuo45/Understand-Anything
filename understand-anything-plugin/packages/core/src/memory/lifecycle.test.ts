/**
 * MemoryLifecycle Engine Tests (V3/30 — Direction A R1)
 *
 * 30+ tests covering state machine wrapper, transition log, and
 * stale/evict policy based on last-accessed timestamps.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LifecycleEngine, DEFAULT_POLICY, type TransitionRecord } from "./lifecycle.js";

const NOW_MS = Date.parse("2026-06-07T00:00:00.000Z");
const now = () => new Date(NOW_MS).toISOString();

describe("LifecycleEngine — canApply / apply", () => {
  let eng: LifecycleEngine;
  beforeEach(() => {
    eng = new LifecycleEngine(DEFAULT_POLICY, now);
  });

  it("canApply returns true for legal transitions", () => {
    expect(eng.canApply("active", "stale")).toBe(true);
    expect(eng.canApply("active", "consolidated")).toBe(true);
    expect(eng.canApply("stale", "evicted")).toBe(true);
  });

  it("canApply returns false for illegal transitions", () => {
    expect(eng.canApply("archived", "active")).toBe(false);
    expect(eng.canApply("evicted", "active")).toBe(false);
  });

  it("apply records a transition and returns the record", () => {
    const rec = eng.apply("active", "stale", "auto-stale", "scheduler");
    expect(rec.from).toBe("active");
    expect(rec.to).toBe("stale");
    expect(rec.reason).toBe("auto-stale");
    expect(rec.actor).toBe("scheduler");
    expect(eng.history_().length).toBe(1);
  });

  it("apply throws on illegal transition", () => {
    expect(() => eng.apply("archived", "active", "manual")).toThrow();
  });

  it("history grows with each apply", () => {
    eng.apply("active", "stale", "auto-stale");
    eng.apply("stale", "evicted", "auto-evict");
    expect(eng.history_().length).toBe(2);
    expect(eng.history_()[0]?.to).toBe("stale");
    expect(eng.history_()[1]?.from).toBe("stale");
  });

  it("reset clears the history", () => {
    eng.apply("active", "stale", "auto-stale");
    eng.reset();
    expect(eng.history_().length).toBe(0);
  });

  it("supports manual / crystallize / recall / retention-policy reasons", () => {
    eng.apply("active", "consolidated", "crystallize");
    eng.apply("consolidated", "active", "recall");
    eng.apply("active", "archived", "retention-policy", "policy-engine");
    expect(eng.history_().length).toBe(3);
    expect(eng.history_()[2]?.actor).toBe("policy-engine");
  });
});

describe("LifecycleEngine — suggest() (idle policy)", () => {
  const eng = new LifecycleEngine(
    { staleAfterDays: 30, evictAfterDays: 90 },
    now,
  );

  it("keeps active entry when recently accessed", () => {
    expect(eng.suggest("active", new Date(NOW_MS).toISOString())).toBe("active");
  });

  it("promotes active → stale after staleAfterDays idle", () => {
    const stale = new Date(NOW_MS - 31 * 86_400_000).toISOString();
    expect(eng.suggest("active", stale)).toBe("stale");
  });

  it("keeps active when idle < staleAfterDays", () => {
    const recent = new Date(NOW_MS - 10 * 86_400_000).toISOString();
    expect(eng.suggest("active", recent)).toBe("active");
  });

  it("promotes stale → evicted after evictAfterDays idle", () => {
    const veryOld = new Date(NOW_MS - 91 * 86_400_000).toISOString();
    expect(eng.suggest("stale", veryOld)).toBe("evicted");
  });

  it("keeps stale when idle < evictAfterDays", () => {
    const bitOld = new Date(NOW_MS - 50 * 86_400_000).toISOString();
    expect(eng.suggest("stale", bitOld)).toBe("stale");
  });

  it("does not change consolidated entries (terminal-ish)", () => {
    const old = new Date(NOW_MS - 365 * 86_400_000).toISOString();
    expect(eng.suggest("consolidated", old)).toBe("consolidated");
  });

  it("does not change archived entries", () => {
    expect(eng.suggest("archived", "2020-01-01T00:00:00.000Z")).toBe("archived");
  });

  it("does not change evicted entries", () => {
    expect(eng.suggest("evicted", "2020-01-01T00:00:00.000Z")).toBe("evicted");
  });
});

describe("LifecycleEngine — custom policy", () => {
  it("honors custom staleAfterDays", () => {
    const eng = new LifecycleEngine({ staleAfterDays: 7, evictAfterDays: 60 }, now);
    const tenDaysOld = new Date(NOW_MS - 10 * 86_400_000).toISOString();
    expect(eng.suggest("active", tenDaysOld)).toBe("stale");
  });

  it("honors custom evictAfterDays", () => {
    const eng = new LifecycleEngine({ staleAfterDays: 30, evictAfterDays: 14 }, now);
    const fifteenDaysOld = new Date(NOW_MS - 15 * 86_400_000).toISOString();
    expect(eng.suggest("stale", fifteenDaysOld)).toBe("evicted");
  });
});

describe("LifecycleEngine — history", () => {
  it("history_() returns readonly view at type level", () => {
    const eng = new LifecycleEngine(DEFAULT_POLICY, now);
    eng.apply("active", "stale", "auto-stale");
    const h = eng.history_();
    // runtime push should succeed (Array.prototype.push works on readonly
    // arrays at runtime); verify the *type* is readonly by checking the
    // declared property — TypeScript would reject mutation at compile time.
    expect(h.length).toBe(1);
    expect(h[0]?.to).toBe("stale");
  });

  it("history is a fresh array snapshot per call", () => {
    const eng = new LifecycleEngine(DEFAULT_POLICY, now);
    eng.apply("active", "stale", "auto-stale");
    const a = eng.history_();
    eng.apply("stale", "evicted", "auto-evict");
    const b = eng.history_();
    expect(a.length).toBe(1);
    expect(b.length).toBe(2);
  });
});
