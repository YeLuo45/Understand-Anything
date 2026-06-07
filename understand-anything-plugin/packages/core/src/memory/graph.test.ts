/**
 * MemoryGraph Tests (V18/30 — Direction A R1)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryGraph, type GraphNode, type GraphEdge } from "./graph.js";

const FIXED = "2026-06-07T00:00:00.000Z";
const now = () => FIXED;

const node = (id: string, type: GraphNode["type"] = "entity", label = id): GraphNode => ({
  id, type, label, properties: {}, confidence: 0.5, createdAt: FIXED,
});

describe("MemoryGraph — add / get", () => {
  let g: MemoryGraph;
  beforeEach(() => {
    g = new MemoryGraph(now);
  });

  it("adds nodes and tracks size", () => {
    g.addNode(node("a"));
    g.addNode(node("b"));
    expect(g.size()).toEqual({ nodes: 2, edges: 0 });
  });

  it("getNode returns node by id", () => {
    g.addNode(node("a", "concept", "Auth"));
    expect(g.getNode("a")?.label).toBe("Auth");
  });

  it("listNodes filters by type", () => {
    g.addNode(node("a", "entity"));
    g.addNode(node("b", "concept"));
    g.addNode(node("c", "entity"));
    expect(g.listNodes("entity").length).toBe(2);
    expect(g.listNodes("concept").length).toBe(1);
  });

  it("addEdge throws if source missing", () => {
    g.addNode(node("a"));
    expect(() => g.addEdge({ type: "related", source: "missing", target: "a", weight: 1, confidence: 1 }))
      .toThrow();
  });

  it("addEdge throws if target missing", () => {
    g.addNode(node("a"));
    expect(() => g.addEdge({ type: "related", source: "a", target: "missing", weight: 1, confidence: 1 }))
      .toThrow();
  });

  it("addEdge creates edge with auto id", () => {
    g.addNode(node("a"));
    g.addNode(node("b"));
    const e = g.addEdge({ type: "related", source: "a", target: "b", weight: 0.5, confidence: 0.9 });
    expect(e.id).toMatch(/^edge_/);
    expect(g.size().edges).toBe(1);
  });
});

describe("MemoryGraph — traversal", () => {
  let g: MemoryGraph;
  beforeEach(() => {
    g = new MemoryGraph(now);
    g.addNode(node("a"));
    g.addNode(node("b"));
    g.addNode(node("c"));
    g.addNode(node("d"));
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    g.addEdge({ type: "related", source: "b", target: "c", weight: 1, confidence: 1 });
    g.addEdge({ type: "related", source: "c", target: "d", weight: 1, confidence: 1 });
  });

  it("outgoing_ returns outgoing edges", () => {
    expect(g.outgoing_("a").length).toBe(1);
  });

  it("incoming_ returns incoming edges", () => {
    expect(g.incoming_("b").length).toBe(1);
  });

  it("neighbors 1-hop", () => {
    expect(g.neighbors("a", 1)).toEqual(["b"]);
  });

  it("neighbors 2-hops", () => {
    expect(g.neighbors("a", 2).sort()).toEqual(["b", "c"]);
  });

  it("neighbors 3-hops reaches d", () => {
    expect(g.neighbors("a", 3).sort()).toEqual(["b", "c", "d"]);
  });

  it("neighbors returns empty for missing node", () => {
    expect(g.neighbors("nope", 2)).toEqual([]);
  });

  it("outgoing_ filters by type", () => {
    expect(g.outgoing_("a", "causes").length).toBe(0);
    expect(g.outgoing_("a", "related").length).toBe(1);
  });
});

describe("MemoryGraph — listEdges / remove", () => {
  let g: MemoryGraph;
  beforeEach(() => {
    g = new MemoryGraph(now);
    g.addNode(node("a"));
    g.addNode(node("b"));
  });

  it("listEdges filters by type", () => {
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });  // duplicate type
    expect(g.listEdges().length).toBe(2);
    expect(g.listEdges("related").length).toBe(2);
    expect(g.listEdges("causes").length).toBe(0);
  });

  it("removeEdge cleans up indexes", () => {
    const e = g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    g.removeEdge(e.id);
    expect(g.outgoing_("a").length).toBe(0);
    expect(g.incoming_("b").length).toBe(0);
  });

  it("removeNode cascades to edges", () => {
    g.addEdge({ type: "related", source: "a", target: "b", weight: 1, confidence: 1 });
    g.removeNode("a");
    expect(g.size().nodes).toBe(1);
    expect(g.size().edges).toBe(0);
  });

  it("removeNode returns false for missing", () => {
    expect(g.removeNode("nope")).toBe(false);
  });

  it("removeEdge returns false for missing", () => {
    expect(g.removeEdge("nope")).toBe(false);
  });
});
