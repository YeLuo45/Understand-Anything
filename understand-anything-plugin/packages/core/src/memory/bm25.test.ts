/**
 * BM25Index Tests (V16/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BM25Index } from "./bm25.js";

describe("BM25Index — add / search", () => {
  let idx: BM25Index;
  beforeEach(() => {
    idx = new BM25Index();
  });

  it("returns empty for empty index", () => {
    expect(idx.search("x")).toEqual([]);
  });

  it("adds docs and tracks size", () => {
    idx.add({ id: "a", text: "hello world" });
    idx.add({ id: "b", text: "foo bar" });
    expect(idx.size()).toBe(2);
  });

  it("finds docs containing query tokens", () => {
    idx.add({ id: "a", text: "the quick brown fox" });
    idx.add({ id: "b", text: "jumps over the lazy dog" });
    const r = idx.search("quick fox");
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe("a");
  });

  it("ranks by relevance (more matches = higher score)", () => {
    idx.add({ id: "a", text: "apple apple apple" });
    idx.add({ id: "b", text: "apple" });
    const r = idx.search("apple");
    expect(r[0]?.id).toBe("a");
  });

  it("returns empty for non-matching query", () => {
    idx.add({ id: "a", text: "hello" });
    expect(idx.search("xyz")).toEqual([]);
  });

  it("case-insensitive matching", () => {
    idx.add({ id: "a", text: "Hello World" });
    const r = idx.search("hello");
    expect(r[0]?.id).toBe("a");
  });

  it("handles multi-token queries", () => {
    idx.add({ id: "a", text: "the cat sat" });
    idx.add({ id: "b", text: "the dog sat" });
    const r = idx.search("cat sat");
    expect(r[0]?.id).toBe("a");
  });

  it("respects limit", () => {
    idx.add({ id: "a", text: "x" });
    idx.add({ id: "b", text: "x" });
    idx.add({ id: "c", text: "x" });
    expect(idx.search("x", 2).length).toBe(2);
  });
});

describe("BM25Index — IDF behavior", () => {
  it("common term has lower score than rare term", () => {
    const idx = new BM25Index();
    // "the" appears in every doc, "fox" appears in only one
    idx.add({ id: "a", text: "the fox" });
    idx.add({ id: "b", text: "the cat" });
    idx.add({ id: "c", text: "the dog" });
    const r = idx.search("fox");
    // Fox is rare → high IDF → high score
    expect(r[0]?.id).toBe("a");
  });
});

describe("BM25Index — unicode tokens", () => {
  it("tokenizes Chinese (single character per token)", () => {
    const idx = new BM25Index();
    idx.add({ id: "a", text: "中文测试" });
    idx.add({ id: "b", text: "其他内容" });
    const r = idx.search("中文");
    expect(r[0]?.id).toBe("a");
  });

  it("handles emoji and mixed scripts", () => {
    const idx = new BM25Index();
    idx.add({ id: "a", text: "测试 🎉 test" });
    const r = idx.search("test");
    expect(r[0]?.id).toBe("a");
  });
});

describe("BM25Index — custom parameters", () => {
  it("honors k1 and b", () => {
    const idx = new BM25Index({ k1: 2.0, b: 0.5 });
    idx.add({ id: "a", text: "x y" });
    const r = idx.search("x");
    expect(r[0]?.id).toBe("a");
  });
});
