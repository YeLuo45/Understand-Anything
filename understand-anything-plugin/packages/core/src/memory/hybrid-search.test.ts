/**
 * Hybrid Search Router Tests (V15/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HybridSearchRouter, DEFAULT_WEIGHTS, type SearchBackend, type RankedHit } from "./hybrid-search.js";

class MockBackend implements SearchBackend {
  constructor(public readonly name: "bm25" | "vector" | "graph", private hits: RankedHit[]) {}
  search(_query: string, limit: number): RankedHit[] {
    return this.hits.slice(0, limit);
  }
}

describe("HybridSearchRouter — registration", () => {
  it("starts with no backends", () => {
    const r = new HybridSearchRouter();
    expect(r.backends_().length).toBe(0);
  });

  it("registers a backend", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", []));
    expect(r.backends_().length).toBe(1);
  });

  it("refuses duplicate backend names", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", []));
    expect(() => r.register(new MockBackend("bm25", []))).toThrow();
  });

  it("supports all three backend types", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", []));
    r.register(new MockBackend("vector", []));
    r.register(new MockBackend("graph", []));
    expect(r.backends_().length).toBe(3);
  });
});

describe("HybridSearchRouter — weights", () => {
  it("defaults to DEFAULT_WEIGHTS", () => {
    const r = new HybridSearchRouter();
    expect(r.weights_()).toEqual(DEFAULT_WEIGHTS);
  });

  it("setWeights replaces", () => {
    const r = new HybridSearchRouter();
    r.setWeights({ bm25: 0.1, vector: 0.2, graph: 0.7 });
    expect(r.weights_()).toEqual({ bm25: 0.1, vector: 0.2, graph: 0.7 });
  });

  it("setWeights does not mutate caller's object", () => {
    const w = { bm25: 0.1, vector: 0.2, graph: 0.7 };
    const r = new HybridSearchRouter();
    r.setWeights(w);
    expect(w).toEqual({ bm25: 0.1, vector: 0.2, graph: 0.7 });
  });
});

describe("HybridSearchRouter — search", () => {
  let r: HybridSearchRouter;
  beforeEach(() => {
    r = new HybridSearchRouter();
  });

  it("returns empty when no backends", () => {
    expect(r.search("x")).toEqual([]);
  });

  it("uses weight to scale scores", () => {
    r.register(new MockBackend("bm25", [{ id: "a", score: 1.0, source: "bm25" }]));
    const hits = r.search("x");
    expect(hits[0]?.score).toBeCloseTo(0.4, 9);
  });

  it("merges hits from multiple backends with score sum", () => {
    r.register(new MockBackend("bm25", [{ id: "a", score: 1.0, source: "bm25" }]));
    r.register(new MockBackend("vector", [{ id: "a", score: 0.8, source: "vector" }]));
    const hits = r.search("x");
    expect(hits[0]?.score).toBeCloseTo(0.4 + 0.32, 9);
  });

  it("tracks source for multi-backend hits", () => {
    r.register(new MockBackend("bm25", [{ id: "a", score: 1.0, source: "bm25" }]));
    r.register(new MockBackend("vector", [{ id: "a", score: 0.8, source: "vector" }]));
    const hits = r.search("x");
    expect(hits[0]?.source).toContain("bm25");
    expect(hits[0]?.source).toContain("vector");
  });

  it("sorts by score descending", () => {
    r.register(new MockBackend("bm25", [
      { id: "low", score: 0.3, source: "bm25" },
      { id: "high", score: 0.9, source: "bm25" },
      { id: "mid", score: 0.6, source: "bm25" },
    ]));
    const hits = r.search("x");
    expect(hits.map((h) => h.id)).toEqual(["high", "mid", "low"]);
  });

  it("respects limit", () => {
    r.register(new MockBackend("bm25", [
      { id: "a", score: 1.0, source: "bm25" },
      { id: "b", score: 0.9, source: "bm25" },
      { id: "c", score: 0.8, source: "bm25" },
    ]));
    const hits = r.search("x", 2);
    expect(hits.length).toBe(2);
  });

  it("merges metadata", () => {
    r.register(new MockBackend("bm25", [{ id: "a", score: 1.0, source: "bm25", metadata: { x: 1 } }]));
    r.register(new MockBackend("vector", [{ id: "a", score: 0.8, source: "vector", metadata: { y: 2 } }]));
    const hits = r.search("x");
    expect(hits[0]?.metadata).toEqual({ x: 1, y: 2 });
  });
});
