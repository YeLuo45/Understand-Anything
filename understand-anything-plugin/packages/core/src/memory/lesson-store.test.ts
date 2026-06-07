/**
 * LessonStore Tests (V13/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LessonStore } from "./lesson-store.js";
import { createMemoryEntry } from "./schema.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

const mem = (id: string, content: string, tags: string[] = []) => ({
  ...createMemoryEntry(id, { content, tags }, now),
});

describe("LessonStore — add / get", () => {
  let s: LessonStore;
  beforeEach(() => {
    s = new LessonStore();
  });

  it("adds and retrieves a lesson", () => {
    const l = s.crystallizeFromMemories([mem("m1", "a", ["t"]), mem("m2", "b", ["t"])]);
    expect(s.get(l.id)?.id).toBe(l.id);
    expect(s.size()).toBe(1);
  });

  it("crystallizeFromMemories uses provided type", () => {
    const l = s.crystallizeFromMemories([mem("m1", "a", ["t"])], "skill");
    expect(l.type).toBe("skill");
  });
});

describe("LessonStore — list", () => {
  let s: LessonStore;
  beforeEach(() => {
    s = new LessonStore();
  });

  it("lists all lessons when no type filter", () => {
    s.crystallizeFromMemories([mem("m1", "a", ["t"])], "lesson");
    s.crystallizeFromMemories([mem("m2", "b", ["t"])], "skill");
    s.crystallizeFromMemories([mem("m3", "c", ["t"])], "pattern");
    expect(s.list().length).toBe(3);
  });

  it("filters list by type", () => {
    s.crystallizeFromMemories([mem("m1", "a", ["t"])], "lesson");
    s.crystallizeFromMemories([mem("m2", "b", ["t"])], "skill");
    s.crystallizeFromMemories([mem("m3", "c", ["t"])], "pattern");
    expect(s.list("lesson").length).toBe(1);
    expect(s.list("skill").length).toBe(1);
    expect(s.list("pattern").length).toBe(1);
  });
});

describe("LessonStore — findByMemoryId", () => {
  let s: LessonStore;
  beforeEach(() => {
    s = new LessonStore();
  });

  it("finds lessons by memoryId in basedOn", () => {
    const l1 = s.crystallizeFromMemories([mem("m1", "a", ["t"]), mem("m2", "b", ["t"])]);
    s.crystallizeFromMemories([mem("m3", "c", ["t"])]);
    const found = s.findByMemoryId("m1");
    expect(found.map((x) => x.id)).toEqual([l1.id]);
  });

  it("finds multiple lessons sharing a memory", () => {
    s.crystallizeFromMemories([mem("m1", "a", ["t"]), mem("m2", "b", ["t"])], "lesson");
    s.crystallizeFromMemories([mem("m2", "c", ["t"]), mem("m3", "d", ["t"])], "skill");
    expect(s.findByMemoryId("m2").length).toBe(2);
  });

  it("returns empty for memory not in any lesson", () => {
    s.crystallizeFromMemories([mem("m1", "a", ["t"])]);
    expect(s.findByMemoryId("nope")).toEqual([]);
  });
});

describe("LessonStore — delete / clear", () => {
  it("delete removes lesson and memory index", () => {
    const s = new LessonStore();
    const l = s.crystallizeFromMemories([mem("m1", "a", ["t"])]);
    expect(s.delete(l.id)).toBe(true);
    expect(s.findByMemoryId("m1")).toEqual([]);
  });

  it("delete returns false for missing id", () => {
    const s = new LessonStore();
    expect(s.delete("nope")).toBe(false);
  });

  it("clear empties everything", () => {
    const s = new LessonStore();
    s.crystallizeFromMemories([mem("m1", "a", ["t"])]);
    s.clear();
    expect(s.size()).toBe(0);
  });
});
