/**
 * SnapshotEngine Tests (V28/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SnapshotEngine } from "./snapshot.js";
import { MemoryKV } from "./kv.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("SnapshotEngine — capture", () => {
  let s: SnapshotEngine;
  beforeEach(() => {
    s = new SnapshotEngine(now);
  });

  it("captures current state of KV", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    kv.put({ id: "m2", content: "y" });
    const snap = s.capture(kv);
    expect(snap.size).toBe(2);
    expect(snap.entries.length).toBe(2);
    expect(snap.createdAt).toBe(FIXED);
  });

  it("uses provided name", () => {
    const kv = new MemoryKV();
    const snap = s.capture(kv, { name: "pre-migration" });
    expect(snap.name).toBe("pre-migration");
  });

  it("auto-generates name when omitted", () => {
    const kv = new MemoryKV();
    const snap = s.capture(kv);
    expect(snap.name).toMatch(/^snapshot_/);
  });

  it("auto-increments id", () => {
    const kv = new MemoryKV();
    const s1 = s.capture(kv);
    const s2 = s.capture(kv);
    expect(s1.id).not.toBe(s2.id);
  });
});

describe("SnapshotEngine — query", () => {
  it("get returns snapshot by id", () => {
    const s = new SnapshotEngine(now);
    const kv = new MemoryKV();
    const snap = s.capture(kv);
    expect(s.get(snap.id)?.id).toBe(snap.id);
  });

  it("get returns undefined for missing", () => {
    const s = new SnapshotEngine(now);
    expect(s.get("nope")).toBeUndefined();
  });

  it("list returns all snapshots", () => {
    const s = new SnapshotEngine(now);
    s.capture(new MemoryKV());
    s.capture(new MemoryKV());
    expect(s.list().length).toBe(2);
  });
});

describe("SnapshotEngine — restore", () => {
  it("restores entries into target KV", () => {
    const s = new SnapshotEngine(now);
    const src = new MemoryKV();
    src.put({ id: "m1", content: "x" });
    src.put({ id: "m2", content: "y" });
    const snap = s.capture(src);
    const target = new MemoryKV();
    const restored = s.restore(snap.id, target);
    expect(restored).toBe(2);
    expect(target.size()).toBe(2);
  });

  it("clears target before restore", () => {
    const s = new SnapshotEngine(now);
    const src = new MemoryKV();
    src.put({ id: "m1", content: "x" });
    const snap = s.capture(src);
    const target = new MemoryKV();
    target.put({ id: "old", content: "old" });
    s.restore(snap.id, target);
    expect(target.get("old")).toBeUndefined();
    expect(target.size()).toBe(1);
  });

  it("returns 0 for missing snapshot", () => {
    const s = new SnapshotEngine(now);
    expect(s.restore("nope", new MemoryKV())).toBe(0);
  });

  it("preserves scope/tags/confidence", () => {
    const s = new SnapshotEngine(now);
    const src = new MemoryKV();
    src.put({ id: "m1", content: "x", scope: "proj-A", tags: ["t"], confidence: 0.9 });
    const snap = s.capture(src);
    const target = new MemoryKV();
    s.restore(snap.id, target);
    const e = target.get("m1");
    expect(e?.scope).toBe("proj-A");
    expect(e?.tags).toEqual(["t"]);
    expect(e?.confidence).toBe(0.9);
  });
});

describe("SnapshotEngine — delete / clear", () => {
  it("delete removes snapshot", () => {
    const s = new SnapshotEngine(now);
    const snap = s.capture(new MemoryKV());
    expect(s.delete(snap.id)).toBe(true);
    expect(s.get(snap.id)).toBeUndefined();
  });

  it("delete returns false for missing", () => {
    const s = new SnapshotEngine(now);
    expect(s.delete("nope")).toBe(false);
  });

  it("clear empties all", () => {
    const s = new SnapshotEngine(now);
    s.capture(new MemoryKV());
    s.clear();
    expect(s.list().length).toBe(0);
  });
});
