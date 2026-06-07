/**
 * L3 Task Skills Tests (V10/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TaskSkillsStore, type SkillStep } from "./l3-skills.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

const SAMPLE_STEPS: SkillStep[] = [
  { order: 1, name: "scan", description: "Scan project files" },
  { order: 2, name: "analyze", description: "Run analysis", optional: true },
  { order: 3, name: "report", description: "Generate report" },
];

describe("TaskSkillsStore — add / get", () => {
  let s: TaskSkillsStore;
  beforeEach(() => {
    s = new TaskSkillsStore(now);
  });

  it("adds a skill with auto-assigned id", () => {
    const sk = s.add({ name: "plan", description: "Plan tasks", steps: SAMPLE_STEPS });
    expect(sk.id).toMatch(/^skill_\d+$/);
    expect(sk.steps.length).toBe(3);
  });

  it("auto-assigns step order if missing", () => {
    const sk = s.add({
      name: "x",
      description: "d",
      steps: [{ name: "a" }, { name: "b" }, { name: "c" }] as SkillStep[],
    });
    expect(sk.steps[0]?.order).toBe(1);
    expect(sk.steps[2]?.order).toBe(3);
  });

  it("sorts steps by order on add", () => {
    const sk = s.add({
      name: "x",
      description: "d",
      steps: [
        { order: 3, name: "c" },
        { order: 1, name: "a" },
        { order: 2, name: "b" },
      ],
    });
    expect(sk.steps.map((x) => x.name)).toEqual(["a", "b", "c"]);
  });

  it("defaults triggers to []", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS });
    expect(sk.triggers).toEqual([]);
  });

  it("preserves provided triggers", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS, triggers: ["plan", "task"] });
    expect(sk.triggers).toEqual(["plan", "task"]);
  });

  it("get returns skill by id", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS });
    expect(s.get(sk.id)?.name).toBe("x");
  });

  it("initial useCount is 0", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS });
    expect(sk.useCount).toBe(0);
  });
});

describe("TaskSkillsStore — recordUse", () => {
  let s: TaskSkillsStore;
  beforeEach(() => {
    s = new TaskSkillsStore(now);
  });

  it("increments useCount", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS });
    s.recordUse(sk.id);
    const updated = s.get(sk.id);
    expect(updated?.useCount).toBe(1);
  });

  it("sets lastUsedAt", () => {
    const sk = s.add({ name: "x", description: "d", steps: SAMPLE_STEPS });
    s.recordUse(sk.id);
    expect(s.get(sk.id)?.lastUsedAt).toBe(FIXED);
  });

  it("returns undefined for missing id", () => {
    expect(s.recordUse("nope")).toBeUndefined();
  });
});

describe("TaskSkillsStore — findByTrigger", () => {
  let s: TaskSkillsStore;
  beforeEach(() => {
    s = new TaskSkillsStore(now);
    s.add({ name: "plan", description: "d", steps: SAMPLE_STEPS, triggers: ["plan", "task"] });
    s.add({ name: "analyze", description: "d", steps: SAMPLE_STEPS, triggers: ["analyze", "scan"] });
    s.add({ name: "deploy", description: "d", steps: SAMPLE_STEPS });
  });

  it("finds skills by trigger substring (case-insensitive)", () => {
    expect(s.findByTrigger("plan").map((x) => x.name)).toEqual(["plan"]);
    expect(s.findByTrigger("PLAN").map((x) => x.name)).toEqual(["plan"]);
  });

  it("returns empty for no match", () => {
    expect(s.findByTrigger("xyz")).toEqual([]);
  });

  it("matches multiple skills", () => {
    expect(s.findByTrigger("a").length).toBe(2);
  });
});

describe("TaskSkillsStore — list / delete", () => {
  it("list returns all", () => {
    const s = new TaskSkillsStore(now);
    s.add({ name: "a", description: "d", steps: SAMPLE_STEPS });
    s.add({ name: "b", description: "d", steps: SAMPLE_STEPS });
    expect(s.list().length).toBe(2);
  });

  it("delete removes skill", () => {
    const s = new TaskSkillsStore(now);
    const sk = s.add({ name: "a", description: "d", steps: SAMPLE_STEPS });
    expect(s.delete(sk.id)).toBe(true);
    expect(s.list().length).toBe(0);
  });

  it("delete returns false for missing", () => {
    const s = new TaskSkillsStore(now);
    expect(s.delete("nope")).toBe(false);
  });

  it("clear empties the store", () => {
    const s = new TaskSkillsStore(now);
    s.add({ name: "a", description: "d", steps: SAMPLE_STEPS });
    s.clear();
    expect(s.size()).toBe(0);
  });
});
