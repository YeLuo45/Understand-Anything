/**
 * TemporalGraph Tests (V19/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { MemoryGraph } from "./graph.js";
import { TemporalGraph } from "./temporal-graph.js";

describe("TemporalGraph — range queries", () => {
  it("nodesInRange filters by createdAt", () => {
    const g = new MemoryGraph(() => "2026-06-07T00:00:00.000Z");
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    const t = new TemporalGraph(g);
    const r = t.nodesInRange({ fromTs: "2026-06-01T00:00:00.000Z", toTs: "2026-06-30T00:00:00.000Z" });
    expect(r.length).toBe(1);
  });

  it("edgesInRange filters by createdAt", () => {
    const g = new MemoryGraph(() => "2026-06-07T00:00:00.000Z");
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    g.addNode({ id: "b", type: "entity", label: "B", properties: {}, confidence: 1 });
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    const t = new TemporalGraph(g);
    const r = t.edgesInRange({ fromTs: "2026-06-01T00:00:00.000Z", toTs: "2026-06-30T00:00:00.000Z" });
    expect(r.length).toBe(1);
  });

  it("returns empty when range is outside", () => {
    const g = new MemoryGraph(() => "2026-06-07T00:00:00.000Z");
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    const t = new TemporalGraph(g);
    const r = t.nodesInRange({ fromTs: "2020-01-01T00:00:00.000Z", toTs: "2020-12-31T00:00:00.000Z" });
    expect(r.length).toBe(0);
  });

  it("boundary conditions inclusive", () => {
    const g = new MemoryGraph(() => "2026-06-07T00:00:00.000Z");
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    const t = new TemporalGraph(g);
    const r = t.nodesInRange({ fromTs: "2026-06-07T00:00:00.000Z", toTs: "2026-06-07T00:00:00.000Z" });
    expect(r.length).toBe(1);
  });
});

describe("TemporalGraph — trajectory", () => {
  it("returns time-ordered events", () => {
    let ts = 0;
    const inc = () => {
      ts += 1000;
      return new Date(ts).toISOString();
    };
    const g = new MemoryGraph(inc);
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    g.addNode({ id: "b", type: "entity", label: "B", properties: {}, confidence: 1 });
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    const t = new TemporalGraph(g);
    const tr = t.trajectory("a", 1);
    expect(tr.length).toBe(3);
    for (let i = 1; i < tr.length; i++) {
      expect(tr[i]!.ts >= tr[i - 1]!.ts).toBe(true);
    }
  });

  it("returns empty for missing node", () => {
    const g = new MemoryGraph();
    const t = new TemporalGraph(g);
    expect(t.trajectory("nope", 2)).toEqual([]);
  });
});

describe("TemporalGraph — countBefore / countAfter", () => {
  it("counts nodes/edges before/after timestamp", () => {
    const baseMs = Date.parse("2026-06-07T00:00:00.000Z");
    let step = 0;
    const inc = () => {
      step += 1;
      return new Date(baseMs + step * 1000).toISOString();
    };
    const g = new MemoryGraph(inc);
    g.addNode({ id: "a", type: "entity", label: "A", properties: {}, confidence: 1 });
    g.addNode({ id: "b", type: "entity", label: "B", properties: {}, confidence: 1 });
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    const t = new TemporalGraph(g);
    const refTs = "2026-06-07T00:00:00.500Z";
    expect(t.countBefore(refTs)).toEqual({ nodes: 0, edges: 0 });
    const future = "2099-01-01T00:00:00.000Z";
    expect(t.countBefore(future)).toEqual({ nodes: 2, edges: 1 });
    expect(t.countAfter(refTs)).toEqual({ nodes: 2, edges: 1 });
  });
});

describe("TemporalGraph — underlying accessor", () => {
  it("exposes underlying MemoryGraph", () => {
    const g = new MemoryGraph();
    const t = new TemporalGraph(g);
    expect(t.underlying()).toBe(g);
  });
});
