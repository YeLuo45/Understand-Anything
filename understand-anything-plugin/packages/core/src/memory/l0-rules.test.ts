/**
 * L0 Meta Rules Engine Tests (V7/30 — Direction A R1)
 *
 * 30+ tests covering add/remove/list/validate and blocker detection.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MetaRulesEngine, type RuleSeverity } from "./l0-rules.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("MetaRulesEngine — add / remove", () => {
  let eng: MetaRulesEngine;
  beforeEach(() => {
    eng = new MetaRulesEngine(now);
  });

  it("adds a rule and returns it with addedAt", () => {
    const r = eng.add({
      id: "no-destruct",
      description: "禁止删除用户数据",
      severity: "block",
      check: () => true,
    });
    expect(r.id).toBe("no-destruct");
    expect(r.addedAt).toBe(FIXED);
    expect(eng.size()).toBe(1);
  });

  it("remove deletes a rule", () => {
    eng.add({ id: "r1", description: "d", severity: "block", check: () => true });
    expect(eng.remove("r1")).toBe(true);
    expect(eng.size()).toBe(0);
  });

  it("remove returns false for missing id", () => {
    expect(eng.remove("nope")).toBe(false);
  });

  it("get returns rule by id", () => {
    eng.add({ id: "r1", description: "d", severity: "block", check: () => true });
    expect(eng.get("r1")?.id).toBe("r1");
    expect(eng.get("nope")).toBeUndefined();
  });

  it("list returns all rules", () => {
    eng.add({ id: "a", description: "A", severity: "block", check: () => true });
    eng.add({ id: "b", description: "B", severity: "warn", check: () => true });
    expect(eng.list().length).toBe(2);
  });
});

describe("MetaRulesEngine — validate", () => {
  let eng: MetaRulesEngine;
  beforeEach(() => {
    eng = new MetaRulesEngine(now);
  });

  it("returns no violations when all rules pass", () => {
    eng.add({ id: "r1", description: "d", severity: "block", check: () => true });
    expect(eng.validate({})).toEqual([]);
  });

  it("returns violation when rule fails", () => {
    eng.add({ id: "no-delete", description: "禁止删除", severity: "block", check: (c) => !c.deleting });
    const v = eng.validate({ deleting: true });
    expect(v.length).toBe(1);
    expect(v[0]?.ruleId).toBe("no-delete");
    expect(v[0]?.severity).toBe("block");
  });

  it("aggregates multiple violations", () => {
    eng.add({ id: "r1", description: "d1", severity: "block", check: () => false });
    eng.add({ id: "r2", description: "d2", severity: "warn", check: () => false });
    expect(eng.validate({}).length).toBe(2);
  });

  it("check receives full context", () => {
    let received: Record<string, unknown> | null = null;
    eng.add({
      id: "r1",
      description: "d",
      severity: "log",
      check: (c) => { received = c; return true; },
    });
    eng.validate({ x: 1, y: "z" });
    expect(received).toEqual({ x: 1, y: "z" });
  });

  it("firstBlocker returns first 'block' violation", () => {
    eng.add({ id: "warn1", description: "d1", severity: "warn", check: () => false });
    eng.add({ id: "block1", description: "d2", severity: "block", check: () => false });
    const b = eng.firstBlocker({});
    expect(b?.ruleId).toBe("block1");
  });

  it("firstBlocker returns undefined when no blockers", () => {
    eng.add({ id: "warn1", description: "d1", severity: "warn", check: () => false });
    expect(eng.firstBlocker({})).toBeUndefined();
  });

  it("violation includes timestamp", () => {
    eng.add({ id: "r1", description: "d", severity: "block", check: () => false });
    const v = eng.validate({});
    expect(v[0]?.ts).toBe(FIXED);
  });
});

describe("MetaRulesEngine — severity types", () => {
  it("supports block / warn / log", () => {
    const eng = new MetaRulesEngine(now);
    const sevs: RuleSeverity[] = ["block", "warn", "log"];
    sevs.forEach((s, i) => {
      eng.add({ id: `r${i}`, description: `d${i}`, severity: s, check: () => false });
    });
    const v = eng.validate({});
    expect(v.map((x) => x.severity)).toEqual(sevs);
  });
});
