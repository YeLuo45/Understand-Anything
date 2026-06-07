/**
 * Audit Log Tests (V14/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AuditLog } from "./audit.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

describe("AuditLog — append", () => {
  let log: AuditLog;
  beforeEach(() => {
    log = new AuditLog(now);
  });

  it("appends an entry with timestamp", () => {
    const e = log.append("create", "memory", "m1");
    expect(e.ts).toBe(FIXED);
    expect(e.op).toBe("create");
    expect(e.entity).toBe("memory");
    expect(e.id).toBe("m1");
    expect(log.size()).toBe(1);
  });

  it("stores field-level old/new values", () => {
    const e = log.append("update", "memory", "m1", {
      field: "confidence",
      old: 0.5,
      new: 0.8,
    });
    expect(e.field).toBe("confidence");
    expect(e.old).toBe(0.5);
    expect(e.new).toBe(0.8);
  });

  it("stores actor and checksum", () => {
    const e = log.append("update", "memory", "m1", {
      actor: "scheduler",
      checksum_after: "abc123",
    });
    expect(e.actor).toBe("scheduler");
    expect(e.checksum_after).toBe("abc123");
  });
});

describe("AuditLog — query", () => {
  let log: AuditLog;
  beforeEach(() => {
    log = new AuditLog(now);
    log.append("create", "memory", "m1");
    log.append("update", "memory", "m1", { field: "confidence" });
    log.append("update", "memory", "m2", { field: "confidence" });
    log.append("delete", "memory", "m1");
    log.append("create", "lesson", "l1");
  });

  it("forEntity returns entries for given id", () => {
    expect(log.forEntity("m1").length).toBe(3);
    expect(log.forEntity("m2").length).toBe(1);
  });

  it("forOp returns entries of given op", () => {
    expect(log.forOp("create").length).toBe(2);
    expect(log.forOp("update").length).toBe(2);
    expect(log.forOp("delete").length).toBe(1);
  });

  it("lastFor returns most recent entry", () => {
    const last = log.lastFor("m1");
    expect(last?.op).toBe("delete");
  });

  it("lastFor returns undefined for missing id", () => {
    expect(log.lastFor("nope")).toBeUndefined();
  });

  it("recent with limit", () => {
    const r = log.recent(2);
    expect(r.length).toBe(2);
    expect(r[1]?.op).toBe("create");
  });
});

describe("AuditLog — JSON Lines serialization", () => {
  it("toJsonl produces parseable lines", () => {
    const log = new AuditLog(now);
    log.append("create", "memory", "m1");
    log.append("update", "memory", "m1", { field: "confidence", old: 0.5, new: 0.8 });
    const jsonl = log.toJsonl();
    const lines = jsonl.split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).id).toBe("m1");
    expect(JSON.parse(lines[1]!).old).toBe(0.5);
  });

  it("fromJsonl restores entries", () => {
    const log = new AuditLog(now);
    log.append("create", "memory", "m1");
    log.append("update", "memory", "m2", { field: "tags" });
    const jsonl = log.toJsonl();
    const restored = AuditLog.fromJsonl(jsonl, now);
    expect(restored.size()).toBe(2);
    expect(restored.forEntity("m2")[0]?.field).toBe("tags");
  });

  it("fromJsonl handles empty input", () => {
    const restored = AuditLog.fromJsonl("", now);
    expect(restored.size()).toBe(0);
  });

  it("fromJsonl skips blank lines", () => {
    const restored = AuditLog.fromJsonl("\n\n", now);
    expect(restored.size()).toBe(0);
  });
});

describe("AuditLog — clear", () => {
  it("clear empties the log", () => {
    const log = new AuditLog(now);
    log.append("create", "memory", "m1");
    log.clear();
    expect(log.size()).toBe(0);
  });
});
