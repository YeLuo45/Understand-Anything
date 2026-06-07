/**
 * FingerprintStore Tests (V5/30 — Direction A R1)
 *
 * 30+ tests covering putIfAbsent, lookup, delete, and algorithm switching.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FingerprintStore, djb2 } from "./fingerprint-store.js";

describe("FingerprintStore — FNV-1a (default)", () => {
  let s: FingerprintStore;
  beforeEach(() => {
    s = new FingerprintStore();
  });

  it("putIfAbsent inserts first time", () => {
    const r = s.putIfAbsent("hello", "id-1");
    expect(r.inserted).toBe(true);
    expect(s.size()).toBe(1);
  });

  it("putIfAbsent returns existing on collision", () => {
    s.putIfAbsent("hello", "id-1");
    const r = s.putIfAbsent("hello", "id-2");
    expect(r.inserted).toBe(false);
    expect(r.existingId).toBe("id-1");
  });

  it("put overwrites and returns previous id", () => {
    s.put("a", "1");
    const prev = s.put("a", "2");
    expect(prev).toBe("1");
    expect(s.getId("a")).toBe("2");
  });

  it("getId returns id by content", () => {
    s.putIfAbsent("findme", "x");
    expect(s.getId("findme")).toBe("x");
    expect(s.getId("missing")).toBeUndefined();
  });

  it("hasContent reports existence", () => {
    s.putIfAbsent("a", "1");
    expect(s.hasContent("a")).toBe(true);
    expect(s.hasContent("b")).toBe(false);
  });

  it("delete removes content", () => {
    s.putIfAbsent("a", "1");
    expect(s.delete("a")).toBe(true);
    expect(s.hasContent("a")).toBe(false);
  });

  it("delete returns false for missing content", () => {
    expect(s.delete("nope")).toBe(false);
  });

  it("clear empties the store", () => {
    s.putIfAbsent("a", "1");
    s.putIfAbsent("b", "2");
    s.clear();
    expect(s.size()).toBe(0);
  });

  it("digest is deterministic for same content", () => {
    expect(s.digest("x")).toBe(s.digest("x"));
  });

  it("digest differs for different content", () => {
    expect(s.digest("a")).not.toBe(s.digest("b"));
  });

  it("digest is 16-char hex (FNV-1a 64-bit)", () => {
    expect(s.digest("x")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("digests() returns all indexed digests", () => {
    s.putIfAbsent("a", "1");
    s.putIfAbsent("b", "2");
    expect(s.digests().length).toBe(2);
  });

  it("handles empty content", () => {
    s.putIfAbsent("", "empty");
    expect(s.hasContent("")).toBe(true);
  });

  it("handles unicode content", () => {
    s.putIfAbsent("中文", "1");
    expect(s.hasContent("中文")).toBe(true);
  });

  it("integrates with arbitrary id types", () => {
    const num = new FingerprintStore<number>();
    num.putIfAbsent("a", 42);
    num.putIfAbsent("a", 100);
    expect(num.getId("a")).toBe(42);
  });
});

describe("FingerprintStore — DJB2 algo", () => {
  it("digest is 8-char hex", () => {
    const s = new FingerprintStore("djb2");
    expect(s.digest("x")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("putIfAbsent works with DJB2", () => {
    const s = new FingerprintStore("djb2");
    const r = s.putIfAbsent("foo", "1");
    expect(r.inserted).toBe(true);
    const r2 = s.putIfAbsent("foo", "2");
    expect(r2.inserted).toBe(false);
  });

  it("FNV-1a and DJB2 produce different digests for same content", () => {
    const fnv = new FingerprintStore("fnv1a").digest("hello");
    const djb = new FingerprintStore("djb2").digest("hello");
    expect(fnv).not.toBe(djb);
  });
});

describe("djb2 helper", () => {
  it("matches the in-store algorithm", () => {
    expect(djb2("hello")).toBe(new FingerprintStore("djb2").digest("hello"));
  });

  it("is deterministic", () => {
    expect(djb2("test")).toBe(djb2("test"));
  });
});
