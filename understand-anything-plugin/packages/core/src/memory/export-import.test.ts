/**
 * ExportImportEngine Tests (V25/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { ExportImportEngine, EXPORT_VERSION, SUPPORTED_VERSIONS } from "./export-import.js";
import { MemoryKV } from "./kv.js";
import { LessonStore } from "./lesson-store.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("ExportImportEngine — export", () => {
  it("exports all memories with version + timestamp", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    kv.put({ id: "m2", content: "y" });
    const data = new ExportImportEngine(now).export(kv);
    expect(data.version).toBe(EXPORT_VERSION);
    expect(data.exportedAt).toBe(FIXED);
    expect(data.memories?.length).toBe(2);
  });

  it("filters by scope", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x", scope: "s1" });
    kv.put({ id: "m2", content: "y", scope: "s2" });
    const data = new ExportImportEngine(now).export(kv, undefined, { scope: "s1" });
    expect(data.memories?.length).toBe(1);
    expect(data.memories?.[0]?.id).toBe("m1");
  });

  it("includes lessons when requested", () => {
    const kv = new MemoryKV();
    const lessons = new LessonStore();
    const data = new ExportImportEngine(now).export(kv, lessons, { includeLessons: true });
    expect(data.lessons).toEqual([]);
  });

  it("omits lessons when not requested", () => {
    const kv = new MemoryKV();
    const lessons = new LessonStore();
    const data = new ExportImportEngine(now).export(kv, lessons);
    expect(data.lessons).toBeUndefined();
  });
});

describe("ExportImportEngine — import", () => {
  it("round-trips memories", () => {
    const kv1 = new MemoryKV();
    kv1.put({ id: "m1", content: "x" });
    kv1.put({ id: "m2", content: "y" });
    const data = new ExportImportEngine(now).export(kv1);
    const kv2 = new MemoryKV();
    const r = new ExportImportEngine(now).import(kv2, data);
    expect(r.memories).toBe(2);
    expect(kv2.size()).toBe(2);
  });

  it("rejects unsupported version", () => {
    const kv = new MemoryKV();
    const engine = new ExportImportEngine(now);
    expect(() => engine.import(kv, { version: "0.0.0", exportedAt: FIXED, memories: [] }))
      .toThrow();
  });

  it("rejects missing version", () => {
    const kv = new MemoryKV();
    const engine = new ExportImportEngine(now);
    expect(() => engine.fromJson('{"exportedAt":"x"}')).toThrow();
  });

  it("rejects unsupported version in fromJson", () => {
    const kv = new MemoryKV();
    const engine = new ExportImportEngine(now);
    expect(() => engine.fromJson('{"version":"0.0.0","exportedAt":"x"}')).toThrow();
  });
});

describe("ExportImportEngine — JSON round-trip", () => {
  it("toJson produces valid JSON", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const data = new ExportImportEngine(now).export(kv);
    const json = new ExportImportEngine(now).toJson(data);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(EXPORT_VERSION);
  });

  it("fromJson restores data", () => {
    const json = JSON.stringify({
      version: EXPORT_VERSION,
      exportedAt: FIXED,
      memories: [{ id: "m1", content: "x", confidence: 0.5, lifecycle: "active", tags: [], scope: "default", metadata: {}, createdAt: FIXED, lastAccessedAt: FIXED, accessCount: 0, relatedIds: [], fingerprint: "abc" }],
    });
    const data = new ExportImportEngine(now).fromJson(json);
    expect(data.memories?.length).toBe(1);
  });
});

describe("ExportImportEngine — version constants", () => {
  it("EXPOR_VERSION is in SUPPORTED_VERSIONS", () => {
    expect(SUPPORTED_VERSIONS).toContain(EXPORT_VERSION);
  });
});
