/**
 * ReplayEngine Tests (V26/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { ReplayEngine } from "./replay.js";
import { AuditLog } from "./audit.js";
import { MemoryKV } from "./kv.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("ReplayEngine — basic replay", () => {
  it("replays create entries", () => {
    const log = new AuditLog(now);
    log.append("create", "memory", "m1", { new: { content: "x" } });
    log.append("create", "memory", "m2", { new: { content: "y" } });
    const kv = new MemoryKV();
    const r = new ReplayEngine().replay([...log["entries" as keyof AuditLog] as unknown as Array<{ ts: string; op: "create"; entity: "memory"; id: string; new: unknown }>], kv);
    expect(r.applied).toBe(2);
    expect(kv.size()).toBe(2);
  });

  it("skips create without content", () => {
    const log: Array<{ ts: string; op: "create"; entity: "memory"; id: string; new?: unknown }> = [
      { ts: FIXED, op: "create", entity: "memory", id: "m1" },
    ];
    const kv = new MemoryKV();
    const r = new ReplayEngine().replay(log, kv);
    expect(r.errors).toBe(1);
  });

  it("replays delete entries", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const log: Array<{ ts: string; op: "delete"; entity: "memory"; id: string }> = [
      { ts: FIXED, op: "delete", entity: "memory", id: "m1" },
    ];
    new ReplayEngine().replay(log, kv);
    expect(kv.get("m1")).toBeUndefined();
  });

  it("replays update entries (lifecycle)", () => {
    const kv = new MemoryKV();
    kv.put({ id: "m1", content: "x" });
    const log: Array<{ ts: string; op: "update"; entity: "memory"; id: string; field: string; new: string }> = [
      { ts: FIXED, op: "update", entity: "memory", id: "m1", field: "lifecycle", new: "consolidated" },
    ];
    new ReplayEngine().replay(log, kv);
    expect(kv.get("m1")?.lifecycle).toBe("consolidated");
  });
});

describe("ReplayEngine — filtering", () => {
  it("filters by entity type", () => {
    const log: Array<{ ts: string; op: "create"; entity: "memory" | "lesson"; id: string; new: { content: string } }> = [
      { ts: FIXED, op: "create", entity: "memory", id: "m1", new: { content: "x" } },
      { ts: FIXED, op: "create", entity: "lesson", id: "l1", new: { content: "y" } },
    ];
    const kv = new MemoryKV();
    const r = new ReplayEngine().replay(log, kv, { entity: "memory" });
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("filters by op type", () => {
    const log: Array<{ ts: string; op: "create" | "search"; entity: "memory"; id: string; new: { content: string } }> = [
      { ts: FIXED, op: "create", entity: "memory", id: "m1", new: { content: "x" } },
      { ts: FIXED, op: "search", entity: "memory", id: "m1", new: { content: "x" } },
    ];
    const kv = new MemoryKV();
    const r = new ReplayEngine().replay(log, kv, { op: "create" });
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
  });
});

describe("ReplayEngine — unsupported ops", () => {
  it("returns error for unsupported op", () => {
    const log: Array<{ ts: string; op: "search"; entity: "memory"; id: string }> = [
      { ts: FIXED, op: "search", entity: "memory", id: "m1" },
    ];
    const kv = new MemoryKV();
    const r = new ReplayEngine().replay(log, kv);
    expect(r.errors).toBe(1);
    expect(r.applied).toBe(0);
  });
});

describe("ReplayEngine — preserves scope/tags", () => {
  it("replays scope and tags from create entry", () => {
    const log: Array<{ ts: string; op: "create"; entity: "memory"; id: string; new: { content: string; scope: string; tags: string[]; confidence: number } }> = [
      { ts: FIXED, op: "create", entity: "memory", id: "m1", new: { content: "x", scope: "proj-A", tags: ["t1", "t2"], confidence: 0.9 } },
    ];
    const kv = new MemoryKV();
    new ReplayEngine().replay(log, kv);
    const e = kv.get("m1");
    expect(e?.scope).toBe("proj-A");
    expect(e?.tags).toEqual(["t1", "t2"]);
    expect(e?.confidence).toBe(0.9);
  });
});
