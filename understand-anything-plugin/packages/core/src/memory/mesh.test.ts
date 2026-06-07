/**
 * MemoryMesh Tests (V21/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryMesh } from "./mesh.js";
import { MemoryKV } from "./kv.js";
import { createMemoryEntry } from "./schema.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("MemoryMesh — register / agents", () => {
  let m: MemoryMesh;
  beforeEach(() => {
    m = new MemoryMesh(now);
  });

  it("registers an agent with auto-created KV", () => {
    const kv = m.registerAgent("a1");
    expect(kv).toBeInstanceOf(MemoryKV);
    expect(m.agents()).toEqual(["a1"]);
  });

  it("unregister removes agent", () => {
    m.registerAgent("a1");
    expect(m.unregisterAgent("a1")).toBe(true);
    expect(m.agents()).toEqual([]);
  });

  it("unregister returns false for missing agent", () => {
    expect(m.unregisterAgent("nope")).toBe(false);
  });

  it("getKV returns agent's KV", () => {
    const kv = m.registerAgent("a1");
    expect(m.getKV("a1")).toBe(kv);
  });
});

describe("MemoryMesh — mesh (point-to-point)", () => {
  let m: MemoryMesh;
  beforeEach(() => {
    m = new MemoryMesh(now);
    m.registerAgent("a1");
    m.registerAgent("a2");
  });

  it("shares an entry from a1 to a2", () => {
    const entry = createMemoryEntry("m1", { content: "x", tags: ["t"] }, now);
    const msg = m.mesh("a1", "a2", entry);
    expect(msg.fromAgent).toBe("a1");
    expect(msg.toScope).toBe("a2");
    expect(m.inbox_("a2").length).toBe(1);
  });

  it("applies entry to target KV with re-keyed id", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    m.mesh("a1", "a2", entry);
    const a2KV = m.getKV("a2")!;
    const stored = a2KV.get("a2_m1");
    expect(stored).toBeDefined();
    expect(stored?.tags).toContain("from:a1");
  });

  it("throws when fromAgent is unknown", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    expect(() => m.mesh("nope", "a2", entry)).toThrow();
  });

  it("throws when toAgent is unknown", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    expect(() => m.mesh("a1", "nope", entry)).toThrow();
  });

  it("appends to outbox", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    m.mesh("a1", "a2", entry);
    expect(m.outbox_().length).toBe(1);
  });
});

describe("MemoryMesh — publish (broadcast)", () => {
  let m: MemoryMesh;
  beforeEach(() => {
    m = new MemoryMesh(now);
    m.registerAgent("a1");
    m.registerAgent("a2");
    m.registerAgent("a3");
  });

  it("publishes to all except sender", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    const msgs = m.publish("a1", entry);
    expect(msgs.length).toBe(2);
    expect(m.inbox_("a1").length).toBe(0);
    expect(m.inbox_("a2").length).toBe(1);
    expect(m.inbox_("a3").length).toBe(1);
  });
});

describe("MemoryMesh — inbox query / clear", () => {
  let m: MemoryMesh;
  beforeEach(() => {
    m = new MemoryMesh(now);
    m.registerAgent("a1");
    m.registerAgent("a2");
  });

  it("inbox_ filters by sinceTs", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    m.mesh("a1", "a2", entry);
    expect(m.inbox_("a2", "2099-01-01T00:00:00.000Z").length).toBe(0);
  });

  it("clearInbox empties the inbox", () => {
    const entry = createMemoryEntry("m1", { content: "x" }, now);
    m.mesh("a1", "a2", entry);
    expect(m.clearInbox("a2")).toBe(1);
    expect(m.inbox_("a2").length).toBe(0);
  });

  it("clearInbox returns 0 for missing agent", () => {
    expect(m.clearInbox("nope")).toBe(0);
  });
});
