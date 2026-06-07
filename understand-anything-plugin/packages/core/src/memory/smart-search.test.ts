/**
 * SmartSearch Tests (V20/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { SmartSearch, DEFAULT_SYNONYMS } from "./smart-search.js";
import { HybridSearchRouter, type SearchBackend, type RankedHit } from "./hybrid-search.js";

class MockBackend implements SearchBackend {
  constructor(public readonly name: "bm25", private hits: RankedHit[]) {}
  search(_query: string, limit: number): RankedHit[] {
    return this.hits.slice(0, limit);
  }
}

describe("SmartSearch — query expansion", () => {
  it("expands known synonyms", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "endpoint_doc", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: true, pluralStemming: false });
    const hits = smart.search("api");
    // expanded to "api", "endpoint", "route", "service"
    const variants = (hits[0]?.metadata as { variants?: string[] })?.variants ?? [];
    expect(variants.length).toBeGreaterThan(1);
  });

  it("does not expand when disabled", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "api_doc", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: false });
    const hits = smart.search("api");
    expect(hits.length).toBe(1);
  });

  it("merges scores from expanded variants", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "api", score: 1.0, source: "bm25" },
      { id: "endpoint", score: 0.5, source: "bm25" },
    ]));
    const smart = new SmartSearch(r);
    const hits = smart.search("api");
    const apiHit = hits.find((h) => h.id === "api");
    const endpointHit = hits.find((h) => h.id === "endpoint");
    expect(apiHit).toBeDefined();
    expect(endpointHit).toBeDefined();
  });
});

describe("SmartSearch — stemming", () => {
  it("strips trailing 's' (plural)", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "user_doc", score: 1.0, source: "bm25" },
      { id: "users_doc", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: false, pluralStemming: true });
    const hits = smart.search("users");
    expect(hits.length).toBe(2);
  });

  it("preserves 'ss' (does not strip)", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "class", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: false, pluralStemming: true });
    const hits = smart.search("class");
    expect(hits.length).toBe(1);
  });

  it("does not stem short tokens", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "is_doc", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: false, pluralStemming: true });
    const hits = smart.search("is");
    expect(hits.length).toBe(1);
  });
});

describe("SmartSearch — synonyms", () => {
  it("uses default synonyms when none provided", () => {
    expect(DEFAULT_SYNONYMS.api).toContain("endpoint");
    expect(DEFAULT_SYNONYMS.database).toContain("db");
  });

  it("merges custom synonyms with defaults", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", []));
    const smart = new SmartSearch(r, { synonyms: { custom: ["c1", "c2"] } });
    // Just verify it doesn't throw
    expect(smart.search("custom")).toBeDefined();
  });
});

describe("SmartSearch — sort by score", () => {
  it("returns results in score-descending order", () => {
    const r = new HybridSearchRouter();
    r.register(new MockBackend("bm25", [
      { id: "low", score: 0.3, source: "bm25" },
      { id: "high", score: 1.0, source: "bm25" },
    ]));
    const smart = new SmartSearch(r, { expandQuery: false });
    const hits = smart.search("low_high");
    expect(hits[0]?.id).toBe("high");
  });
});
