/**
 * MemoryOrchestrator Tests (V30/30 — Direction A R1 — FINAL)
 *
 * Integration tests for the orchestrator wiring L0-L4 + crystallize + audit.
 */

import { describe, it, expect } from "vitest";
import { MemoryOrchestrator } from "./orchestrator.js";
import { createMemoryEntry } from "./schema.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("MemoryOrchestrator — empty state", () => {
  it("starts with mastery 0", () => {
    const o = MemoryOrchestrator.createEmpty();
    expect(o.mastery()).toBe(0);
  });

  it("reports all-zero stats", () => {
    const o = MemoryOrchestrator.createEmpty();
    const s = o.stats();
    expect(s.memories).toBe(0);
    expect(s.rules).toBe(0);
    expect(s.insights).toBe(0);
    expect(s.facts).toBe(0);
    expect(s.skills).toBe(0);
    expect(s.sessions).toBe(0);
    expect(s.lessons).toBe(0);
    expect(s.auditEntries).toBe(0);
  });

  it("provides recommendations for empty state", () => {
    const o = MemoryOrchestrator.createEmpty();
    expect(o.recommendations().length).toBeGreaterThan(0);
  });
});

describe("MemoryOrchestrator — health layers", () => {
  it("l0Health = 1 with one rule", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l0.add({ id: "r1", description: "x", severity: "block", check: () => true });
    expect(o.l0Health()).toBe(1);
  });

  it("l1Health scales with insights/skills ratio", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l3.add({ name: "s1", description: "d", steps: [] });
    o.state.l1.add({ keyword: "k1", skillId: "s1", weight: 0.5 });
    o.state.l1.add({ keyword: "k2", skillId: "s1", weight: 0.5 });
    o.state.l1.add({ keyword: "k3", skillId: "s1", weight: 0.5 });
    expect(o.l1Health()).toBe(1);
  });

  it("l2Health caps at 1 (10 facts)", () => {
    const o = MemoryOrchestrator.createEmpty();
    for (let i = 0; i < 15; i++) {
      o.state.l2.set({ key: `k${i}`, value: 1 });
    }
    expect(o.l2Health()).toBe(1);
  });

  it("l3Health caps at 1 (5 skills)", () => {
    const o = MemoryOrchestrator.createEmpty();
    for (let i = 0; i < 10; i++) {
      o.state.l3.add({ name: `s${i}`, description: "d", steps: [] });
    }
    expect(o.l3Health()).toBe(1);
  });

  it("l4Health caps at 1 (5 sessions)", () => {
    const o = MemoryOrchestrator.createEmpty();
    for (let i = 0; i < 10; i++) {
      o.state.l4.archive({
        title: `t${i}`, summary: "s",
        startTs: FIXED, endTs: FIXED, outcome: "success",
      });
    }
    expect(o.l4Health()).toBe(1);
  });

  it("crystallizeHealth = 1 when no sessions and at least one lesson", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.lessons.crystallizeFromMemories([
      { ...createMemoryEntry("m1", { content: "a" }, now) },
    ]);
    expect(o.crystallizeHealth()).toBe(1);
  });
});

describe("MemoryOrchestrator — mastery", () => {
  it("mastery is sum of weighted layer healths", () => {
    const o = MemoryOrchestrator.createEmpty();
    // L0: add 1 rule → 1
    o.state.l0.add({ id: "r1", description: "x", severity: "block", check: () => true });
    // L3: add 5 skills → 1
    for (let i = 0; i < 5; i++) {
      o.state.l3.add({ name: `s${i}`, description: "d", steps: [] });
    }
    // L1: add 15 insights → 1
    for (let i = 0; i < 15; i++) {
      o.state.l1.add({ keyword: `k${i}`, skillId: "s0", weight: 0.5 });
    }
    // L2: add 10 facts → 1
    for (let i = 0; i < 10; i++) {
      o.state.l2.set({ key: `k${i}`, value: 1 });
    }
    // L4: 5 sessions → 1
    for (let i = 0; i < 5; i++) {
      o.state.l4.archive({
        title: `t${i}`, summary: "s",
        startTs: FIXED, endTs: FIXED, outcome: "success",
      });
    }
    // crystallize: 1 lesson / 5 sessions = 0.2
    o.state.lessons.crystallizeFromMemories([
      { ...createMemoryEntry("m1", { content: "a" }, now) },
    ]);
    // mastery = 0.20*1 + 0.10*1 + 0.25*1 + 0.25*1 + 0.10*1 + 0.10*0.2 = 0.92
    expect(o.mastery()).toBeCloseTo(0.92, 9);
  });

  it("mastery = 1 when all layers are saturated and lessons = sessions", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l0.add({ id: "r1", description: "x", severity: "block", check: () => true });
    for (let i = 0; i < 5; i++) o.state.l3.add({ name: `s${i}`, description: "d", steps: [] });
    for (let i = 0; i < 15; i++) o.state.l1.add({ keyword: `k${i}`, skillId: "s0", weight: 0.5 });
    for (let i = 0; i < 10; i++) o.state.l2.set({ key: `k${i}`, value: 1 });
    for (let i = 0; i < 5; i++) {
      o.state.l4.archive({
        title: `t${i}`, summary: "s",
        startTs: FIXED, endTs: FIXED, outcome: "success",
      });
    }
    for (let i = 0; i < 5; i++) {
      o.state.lessons.crystallizeFromMemories([
        { ...createMemoryEntry(`m${i}`, { content: "a" }, now) },
      ]);
    }
    expect(o.mastery()).toBeCloseTo(1, 9);
  });
});

describe("MemoryOrchestrator — report", () => {
  it("report includes all sections", () => {
    const o = MemoryOrchestrator.createEmpty();
    const r = o.report();
    expect(r.mastery).toBeDefined();
    expect(r.layerHealth).toBeDefined();
    expect(r.stats).toBeDefined();
    expect(r.recommendations).toBeDefined();
  });

  it("report reflects current state", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l0.add({ id: "r1", description: "x", severity: "block", check: () => true });
    o.state.kv.put({ id: "m1", content: "x" });
    const r = o.report();
    expect(r.stats.rules).toBe(1);
    expect(r.stats.memories).toBe(1);
  });
});

describe("MemoryOrchestrator — recommendations", () => {
  it("recommends defining rules when none", () => {
    const o = MemoryOrchestrator.createEmpty();
    const r = o.recommendations();
    expect(r.some((s) => s.includes("L0"))).toBe(true);
  });

  it("recommends insights for skills without routing", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l3.add({ name: "s1", description: "d", steps: [] });
    const r = o.recommendations();
    expect(r.some((s) => s.includes("L1"))).toBe(true);
  });

  it("no recommendations when all layers healthy", () => {
    const o = MemoryOrchestrator.createEmpty();
    o.state.l0.add({ id: "r1", description: "x", severity: "block", check: () => true });
    for (let i = 0; i < 5; i++) o.state.l3.add({ name: `s${i}`, description: "d", steps: [] });
    for (let i = 0; i < 15; i++) o.state.l1.add({ keyword: `k${i}`, skillId: "s0", weight: 0.5 });
    for (let i = 0; i < 10; i++) o.state.l2.set({ key: `k${i}`, value: 1 });
    for (let i = 0; i < 5; i++) {
      o.state.l4.archive({
        title: `t${i}`, summary: "s",
        startTs: FIXED, endTs: FIXED, outcome: "success",
      });
    }
    for (let i = 0; i < 5; i++) {
      o.state.lessons.crystallizeFromMemories([
        { ...createMemoryEntry(`m${i}`, { content: "a" }, now) },
      ]);
    }
    o.state.audit.append("create", "memory", "m1");
    expect(o.recommendations().length).toBe(0);
  });
});
