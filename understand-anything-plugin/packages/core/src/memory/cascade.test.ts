/**
 * CascadeDeleter Tests (V24/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { CascadeDeleter } from "./cascade.js";
import { MemoryKV } from "./kv.js";
import { MemoryGraph } from "./graph.js";
import { AuditLog } from "./audit.js";
import { LessonStore } from "./lesson-store.js";
import { InsightIndex } from "./l1-insight.js";
import { SessionArchive } from "./l4-sessions.js";
import { createMemoryEntry } from "./schema.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("CascadeDeleter — KV only", () => {
  it("deletes from KV", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const r = new CascadeDeleter().delete("m1", { kv });
    expect(r.deleted.entries).toBe(1);
    expect(kv.get("m1")).toBeUndefined();
  });

  it("returns zero when not found", () => {
    const kv = new MemoryKV();
    const r = new CascadeDeleter().delete("nope", { kv });
    expect(r.deleted.entries).toBe(0);
  });
});

describe("CascadeDeleter — KV + Graph", () => {
  it("removes edges where id is source or target", () => {
    const kv = new MemoryKV();
    const g = new MemoryGraph(now);
    kv.put({ id: "m1", content: "x" });
    g.addNode({ id: "m1", type: "entity", label: "M1", properties: {}, confidence: 1 });
    g.addNode({ id: "m2", type: "entity", label: "M2", properties: {}, confidence: 1 });
    g.addEdge({ type: "related", source: "m1", target: "m2", weight: 1, confidence: 1 });
    const r = new CascadeDeleter().delete("m1", { kv, graph: g });
    expect(r.deleted.edges).toBe(1);
    expect(g.listEdges().length).toBe(0);
  });

  it("removes node from graph", () => {
    const g = new MemoryGraph(now);
    g.addNode({ id: "m1", type: "entity", label: "M1", properties: {}, confidence: 1 });
    const r = new CascadeDeleter().delete("m1", { graph: g });
    expect(g.getNode("m1")).toBeUndefined();
  });
});

describe("CascadeDeleter — Audit log", () => {
  it("counts but does not delete audit entries", () => {
    const log = new AuditLog(now);
    log.append("create", "memory", "m1");
    log.append("update", "memory", "m1", { field: "tags" });
    const r = new CascadeDeleter().delete("m1", { audit: log });
    expect(r.deleted.audits).toBe(2);
    expect(log.size()).toBe(2);  // audit log is append-only
  });
});

describe("CascadeDeleter — Lesson store", () => {
  it("removes lessons that reference the memory", () => {
    const lessons = new LessonStore();
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "a" });
    kv.put({ id: "m2", content: "b" });
    const entries = [
      { ...createMemoryEntry("m1", { content: "a" }, now) },
      { ...createMemoryEntry("m2", { content: "b" }, now) },
    ];
    lessons.crystallizeFromMemories(entries);
    const r = new CascadeDeleter().delete("m1", { kv, lessons });
    expect(r.deleted.lessons).toBe(1);
    expect(lessons.size()).toBe(0);
  });
});

describe("CascadeDeleter — Insight index", () => {
  it("removes insights for the deleted skill id", () => {
    const idx = new InsightIndex(now);
    idx.add({ keyword: "k", skillId: "s1", weight: 0.5 });
    const r = new CascadeDeleter().delete("s1", { insights: idx });
    expect(r.deleted.insights).toBe(1);
  });
});

describe("CascadeDeleter — Session archive", () => {
  it("counts sessions referencing the memory", () => {
    const sessions = new SessionArchive();
    sessions.archive({
      title: "t",
      summary: "s",
      startTs: FIXED,
      endTs: FIXED,
      outcome: "success",
      memoryIds: ["m1", "m2"],
    });
    const r = new CascadeDeleter().delete("m1", { sessions });
    expect(r.deleted.sessions).toBe(1);
  });
});

describe("CascadeDeleter — references list", () => {
  it("lists all references in result", () => {
    const kv = new MemoryKV();
    const log = new AuditLog(now);
    kv.put({ id: "m1", content: "x" });
    log.append("create", "memory", "m1");
    const r = new CascadeDeleter().delete("m1", { kv, audit: log });
    expect(r.references).toContain("kv:m1");
    expect(r.references).toContain("audit:m1");
  });
});

describe("CascadeDeleter — no targets", () => {
  it("returns empty result", () => {
    const r = new CascadeDeleter().delete("m1", {});
    expect(r.deleted.entries).toBe(0);
    expect(r.references).toEqual([]);
  });
});
