/**
 * Crystallizer Tests (V12/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { Crystallizer } from "./crystallize.js";
import { createMemoryEntry } from "./schema.js";
import type { MemoryEntry } from "./schema.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

const mem = (id: string, content: string, tags: string[], accessCount = 0, confidence = 0.5): MemoryEntry => ({
  ...createMemoryEntry(id, { content, tags, confidence }, now),
  accessCount,
});

describe("Crystallizer — crystallize", () => {
  const cry = new Crystallizer(now);

  it("creates a lesson from memories", () => {
    const lesson = cry.crystallize([
      mem("m1", "a", ["x"]),
      mem("m2", "b", ["x"]),
    ]);
    expect(lesson.basedOn).toEqual(["m1", "m2"]);
    expect(lesson.version).toBe(1);
    expect(lesson.id).toMatch(/^lesson_/);
  });

  it("auto-detects common tags (majority threshold)", () => {
    const lesson = cry.crystallize([
      mem("m1", "a", ["x", "y"]),
      mem("m2", "b", ["x", "z"]),
      mem("m3", "c", ["x"]),
    ]);
    expect(lesson.tags).toContain("x");
    expect(lesson.tags).not.toContain("y");
  });

  it("uses top-accessed entry for summary", () => {
    const lesson = cry.crystallize([
      mem("m1", "low", ["t"], 0, 0.5),
      mem("m2", "top", ["t"], 100, 0.5),
    ]);
    expect(lesson.summary).toBe("top");
  });

  it("computes mean confidence", () => {
    const lesson = cry.crystallize([
      mem("m1", "a", ["t"], 0, 0.6),
      mem("m2", "b", ["t"], 0, 0.8),
    ]);
    expect(lesson.confidence).toBeCloseTo(0.7, 9);
  });

  it("throws when below minMemoryCount", () => {
    expect(() => cry.crystallize([], { minMemoryCount: 1 })).toThrow();
  });

  it("uses provided title", () => {
    const lesson = cry.crystallize([mem("m1", "a", ["t"])], { title: "My title" });
    expect(lesson.title).toBe("My title");
  });

  it("uses provided type", () => {
    const lesson = cry.crystallize([mem("m1", "a", ["t"])], { type: "skill" });
    expect(lesson.type).toBe("skill");
  });

  it("uses provided contentTemplate", () => {
    const lesson = cry.crystallize(
      [mem("m1", "a", ["t"]), mem("m2", "b", ["t"])],
      { contentTemplate: (es, t) => `custom ${es.length} ${t.join(",")}` },
    );
    expect(lesson.content).toBe("custom 2 t");
  });

  it("limits examples to 5", () => {
    const lesson = cry.crystallize(
      [1, 2, 3, 4, 5, 6, 7].map((i) => mem(`m${i}`, `c${i}`, ["t"])),
    );
    expect(lesson.examples.length).toBe(5);
  });

  it("uses summary field of top entry when available", () => {
    const top: MemoryEntry = {
      ...mem("m1", "a", ["t"], 10),
      summary: "AI-generated summary",
    };
    const lesson = cry.crystallize([top, mem("m2", "b", ["t"], 0)]);
    expect(lesson.summary).toBe("AI-generated summary");
  });

  it("falls back to content slice when no summary", () => {
    const longContent = "x".repeat(200);
    const lesson = cry.crystallize([mem("m1", longContent, ["t"], 10)]);
    expect(lesson.summary.length).toBeLessThanOrEqual(120);
  });
});

describe("Crystallizer — consolidate", () => {
  const cry = new Crystallizer(now);

  it("increments version", () => {
    const lesson = cry.crystallize([mem("m1", "a", ["t"])]);
    const updated = cry.consolidate(lesson, [mem("m2", "b", ["t"])]);
    expect(updated.version).toBe(2);
  });

  it("appends basedOn", () => {
    const lesson = cry.crystallize([mem("m1", "a", ["t"])]);
    const updated = cry.consolidate(lesson, [mem("m2", "b", ["t"])]);
    expect(updated.basedOn).toEqual(["m1", "m2"]);
  });

  it("appends examples (max 5 new)", () => {
    const lesson = cry.crystallize(
      [1, 2, 3, 4, 5].map((i) => mem(`m${i}`, `c${i}`, ["t"])),
    );
    const updated = cry.consolidate(
      lesson,
      [6, 7, 8, 9, 10, 11].map((i) => mem(`m${i}`, `c${i}`, ["t"])),
    );
    expect(updated.examples.length).toBe(10);  // 5 + 5
  });
});
