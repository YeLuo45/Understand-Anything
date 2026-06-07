/**
 * AutoCrystallizer Tests (V29/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { AutoCrystallizer, DEFAULT_AUTO_CONFIG } from "./auto-crystallize.js";
import { MemoryKV } from "./kv.js";
import { LessonStore } from "./lesson-store.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("AutoCrystallizer — analyze", () => {
  it("identifies clusters by shared tags", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"] });
    kv.put({ content: "b", tags: ["x"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3 });
    const r = ac.analyze(kv);
    const x = r.find((x) => x.tag === "x");
    expect(x?.memoryCount).toBe(2);
  });

  it("does not recommend when below threshold", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"] });
    kv.put({ content: "b", tags: ["x"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3 });
    const r = ac.analyze(kv);
    expect(r.find((x) => x.tag === "x")?.shouldCrystallize).toBe(false);
  });

  it("recommends when at/above threshold", () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 3; i++) kv.put({ content: `c${i}`, tags: ["x"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3 });
    const r = ac.analyze(kv);
    expect(r.find((x) => x.tag === "x")?.shouldCrystallize).toBe(true);
  });

  it("includes avgConfidence", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"], confidence: 0.6 });
    kv.put({ content: "b", tags: ["x"], confidence: 0.8 });
    kv.put({ content: "c", tags: ["x"], confidence: 0.7 });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3, minAvgConfidence: 0 });
    const r = ac.analyze(kv);
    expect(r.find((x) => x.tag === "x")?.avgConfidence).toBeCloseTo(0.7, 9);
  });

  it("skips entries with non-active lifecycle", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"] });
    kv.put({ content: "b", tags: ["x"] });
    kv.put({ content: "c", tags: ["x"] });
    kv.setLifecycle(kv.list()[0]!.id, "archived");
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3 });
    const r = ac.analyze(kv);
    expect(r.find((x) => x.tag === "x")?.memoryCount).toBe(2);
  });

  it("respects watchTags filter", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x", "y"] });
    kv.put({ content: "b", tags: ["x", "y"] });
    kv.put({ content: "c", tags: ["x", "y"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3, watchTags: ["x"] });
    const r = ac.analyze(kv);
    const yReport = r.find((x) => x.tag === "y");
    expect(yReport).toBeUndefined();
    expect(r.find((x) => x.tag === "x")?.memoryCount).toBe(3);
  });

  it("respects minAvgConfidence", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"], confidence: 0.3 });
    kv.put({ content: "b", tags: ["x"], confidence: 0.3 });
    kv.put({ content: "c", tags: ["x"], confidence: 0.3 });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3, minAvgConfidence: 0.5 });
    const r = ac.analyze(kv);
    expect(r.find((x) => x.tag === "x")?.shouldCrystallize).toBe(false);
  });

  it("sorts reports by memory count desc", () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 3; i++) kv.put({ content: `x${i}`, tags: ["x"] });
    for (let i = 0; i < 5; i++) kv.put({ content: `y${i}`, tags: ["y"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 2 });
    const r = ac.analyze(kv);
    expect(r[0]?.tag).toBe("y");
    expect(r[1]?.tag).toBe("x");
  });
});

describe("AutoCrystallizer — autoCrystallizeAll", () => {
  it("stores suggested lessons and returns them", () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 3; i++) kv.put({ content: `c${i}`, tags: ["x"] });
    const store = new LessonStore();
    const ac = new AutoCrystallizer(store, { threshold: 3 });
    const lessons = ac.autoCrystallizeAll(kv);
    expect(lessons.length).toBe(1);
    expect(store.size()).toBe(1);
  });

  it("returns empty when no clusters meet threshold", () => {
    const kv = new MemoryKV();
    kv.put({ content: "a", tags: ["x"] });
    const ac = new AutoCrystallizer(new LessonStore(), { threshold: 3 });
    expect(ac.autoCrystallizeAll(kv).length).toBe(0);
  });

  it("getStore returns the underlying LessonStore", () => {
    const store = new LessonStore();
    const ac = new AutoCrystallizer(store);
    expect(ac.getStore()).toBe(store);
  });
});

describe("AutoCrystallizer — defaults", () => {
  it("DEFAULT_AUTO_CONFIG has threshold 3", () => {
    expect(DEFAULT_AUTO_CONFIG.threshold).toBe(3);
  });
});
