/**
 * VectorIndex Tests (V17/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VectorIndex, cosineSimilarity } from "./vector-index.js";

describe("VectorIndex — add / search", () => {
  let idx: VectorIndex;
  beforeEach(() => {
    idx = new VectorIndex();
  });

  it("returns empty for empty index", () => {
    expect(idx.search("anything")).toEqual([]);
  });

  it("adds docs and tracks size", () => {
    idx.add({ id: "a", vector: [1, 0, 0] });
    idx.add({ id: "b", vector: [0, 1, 0] });
    expect(idx.size()).toBe(2);
  });

  it("throws on empty vector", () => {
    expect(() => idx.add({ id: "x", vector: [] })).toThrow();
  });

  it("finds similar doc via text query", () => {
    idx.add({ id: "alpha", vector: Array(64).fill(0).map((_, i) => (i % 3 === 0 ? 1 : 0)) });
    idx.add({ id: "beta", vector: Array(64).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)) });
    const r = idx.search("alpha");
    expect(r.length).toBeGreaterThan(0);
  });

  it("returns RankedHit with source=vector", () => {
    idx.add({ id: "a", vector: Array(64).fill(0.1) });
    const r = idx.search("hello");
    expect(r[0]?.source).toBe("vector");
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      idx.add({ id: `id_${i}`, vector: Array(64).fill(0.1) });
    }
    const r = idx.search("x", 3);
    expect(r.length).toBe(3);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 9);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns 0 for zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for dimension mismatch", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("computes known case", () => {
    // a=[1,2,3], b=[4,5,6] → dot=32, |a|=sqrt(14), |b|=sqrt(77)
    // cos = 32 / (sqrt(14) * sqrt(77))
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(sim).toBeCloseTo(32 / (Math.sqrt(14) * Math.sqrt(77)), 9);
  });

  it("symmetric", () => {
    const a = [0.3, 0.5, 0.7];
    const b = [0.2, 0.4, 0.6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 9);
  });
});
