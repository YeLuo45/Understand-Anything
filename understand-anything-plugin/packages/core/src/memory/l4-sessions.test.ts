/**
 * L4 Session Archive Tests (V11/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SessionArchive } from "./l4-sessions.js";

describe("SessionArchive — archive", () => {
  let s: SessionArchive;
  beforeEach(() => {
    s = new SessionArchive();
  });

  it("archives a session with auto id and duration", () => {
    const r = s.archive({
      title: "Build feature X",
      summary: "Implemented and tested X",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T01:00:00.000Z",
      outcome: "success",
    });
    expect(r.id).toMatch(/^sess_\d+$/);
    expect(r.durationMs).toBe(3_600_000);
  });

  it("computes duration in ms", () => {
    const r = s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T00:30:00.000Z",
      outcome: "partial",
    });
    expect(r.durationMs).toBe(1_800_000);
  });

  it("clamps negative duration to 0", () => {
    const r = s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T01:00:00.000Z",
      endTs: "2026-06-07T00:00:00.000Z",
      outcome: "failure",
    });
    expect(r.durationMs).toBe(0);
  });

  it("stores tags", () => {
    const r = s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T00:01:00.000Z",
      outcome: "success",
      tags: ["build", "test"],
    });
    expect(r.tags).toEqual(["build", "test"]);
  });

  it("cross-references memory/skill/fact ids", () => {
    const r = s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T00:01:00.000Z",
      outcome: "success",
      memoryIds: ["m1", "m2"],
      skillIds: ["s1"],
      factIds: ["f1"],
    });
    expect(r.memoryIds).toEqual(["m1", "m2"]);
    expect(r.skillIds).toEqual(["s1"]);
    expect(r.factIds).toEqual(["f1"]);
  });
});

describe("SessionArchive — query", () => {
  let s: SessionArchive;
  beforeEach(() => {
    s = new SessionArchive();
    s.archive({
      title: "A",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T01:00:00.000Z",
      outcome: "success",
      tags: ["build"],
    });
    s.archive({
      title: "B",
      summary: "s",
      startTs: "2026-06-07T01:00:00.000Z",
      endTs: "2026-06-07T01:30:00.000Z",
      outcome: "failure",
      tags: ["deploy"],
    });
    s.archive({
      title: "C",
      summary: "s",
      startTs: "2026-06-07T02:00:00.000Z",
      endTs: "2026-06-07T03:00:00.000Z",
      outcome: "success",
      tags: ["build", "deploy"],
    });
  });

  it("list returns all", () => {
    expect(s.list().length).toBe(3);
  });

  it("byTagFn filters by tag", () => {
    expect(s.byTagFn("build").map((r) => r.title).sort()).toEqual(["A", "C"]);
  });

  it("byTagFn returns empty for missing tag", () => {
    expect(s.byTagFn("xyz")).toEqual([]);
  });

  it("byOutcome filters", () => {
    expect(s.byOutcome("success").length).toBe(2);
    expect(s.byOutcome("failure").length).toBe(1);
  });

  it("findSimilar returns sessions sharing tags", () => {
    const a = s.list().find((r) => r.title === "A")!;
    const sim = s.findSimilar(a.id).map((r) => r.title).sort();
    expect(sim).toEqual(["C"]);
  });
});

describe("SessionArchive — delete / clear", () => {
  it("delete removes record and tag index", () => {
    const s = new SessionArchive();
    const r = s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T00:01:00.000Z",
      outcome: "success",
      tags: ["x"],
    });
    expect(s.delete(r.id)).toBe(true);
    expect(s.byTagFn("x")).toEqual([]);
  });

  it("delete returns false for missing", () => {
    const s = new SessionArchive();
    expect(s.delete("nope")).toBe(false);
  });

  it("clear empties everything", () => {
    const s = new SessionArchive();
    s.archive({
      title: "t",
      summary: "s",
      startTs: "2026-06-07T00:00:00.000Z",
      endTs: "2026-06-07T00:01:00.000Z",
      outcome: "success",
    });
    s.clear();
    expect(s.size()).toBe(0);
  });
});
