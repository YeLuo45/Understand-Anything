/**
 * Impact propagation tests — V6 / V7 / V8 / V10 of Direction B
 */
import { describe, it, expect } from "vitest";
import {
  buildImpactIndex,
  bfsReachable,
  impactFromNode,
  impactFromNodes,
  severityScore,
  severityBucket,
  type ImpactNode,
  type ImpactEdge,
} from "../impact-propagation";
import type { ArchitectureDecisionRecord } from "../../types";

function makeAdr(overrides: Partial<ArchitectureDecisionRecord> = {}): ArchitectureDecisionRecord {
  return {
    id: "adr:1",
    title: "X",
    status: "accepted",
    context: "",
    decision: "X",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "2026-06-14",
    source: "manual",
    tags: [],
    linkedNodeIds: [],
    complexity: "simple",
    ...overrides,
  };
}

function makeNodes(ids: string[]): ImpactNode[] {
  return ids.map((id) => ({ id }));
}

function makeEdge(source: string, target: string, type = "imports"): ImpactEdge {
  return { source, target, type };
}

describe("V6 — buildImpactIndex", () => {
  it("returns empty map for no decisions", () => {
    expect(buildImpactIndex([]).size).toBe(0);
  });
  it("indexes each decision by every linked node id", () => {
    const idx = buildImpactIndex([
      makeAdr({ id: "a", linkedNodeIds: ["file:1", "file:2"] }),
      makeAdr({ id: "b", linkedNodeIds: ["file:2", "file:3"] }),
    ]);
    expect(idx.get("file:1")).toEqual([expect.objectContaining({ id: "a" })]);
    expect(idx.get("file:2")?.map((d) => d.id).sort()).toEqual(["a", "b"]);
    expect(idx.get("file:3")).toEqual([expect.objectContaining({ id: "b" })]);
  });
  it("ignores decisions with empty linkedNodeIds", () => {
    const idx = buildImpactIndex([makeAdr({ id: "a", linkedNodeIds: [] })]);
    expect(idx.size).toBe(0);
  });
});

describe("V7 — bfsReachable", () => {
  const nodes = makeNodes(["a", "b", "c", "d"]);
  const edges: ImpactEdge[] = [
    makeEdge("a", "b"),
    makeEdge("b", "c"),
    makeEdge("c", "d"),
  ];

  it("returns just the start at depth 0", () => {
    const r = bfsReachable("a", nodes, edges, { maxDepth: 0 });
    expect(r.get("a")).toBe(0);
  });
  it("walks 1 hop", () => {
    const r = bfsReachable("a", nodes, edges, { maxDepth: 1 });
    expect(r.get("a")).toBe(0);
    expect(r.get("b")).toBe(1);
    expect(r.has("c")).toBe(false);
  });
  it("walks 2 hops", () => {
    const r = bfsReachable("a", nodes, edges, { maxDepth: 2 });
    expect(r.get("c")).toBe(2);
    expect(r.has("d")).toBe(false);
  });
  it("walks N hops via undirected traversal (both directions)", () => {
    const r = bfsReachable("d", nodes, edges, { maxDepth: 3 });
    expect(r.get("a")).toBe(3);
    expect(r.get("b")).toBe(2);
    expect(r.get("c")).toBe(1);
  });
  it("stops at maxDepth", () => {
    const r = bfsReachable("a", nodes, edges, { maxDepth: 3 });
    expect(r.get("d")).toBe(3);
    // d would reach further if we allowed it
    expect(r.size).toBe(4);
  });
  it("ignores edges of disallowed types", () => {
    const restricted = new Set(["exports"]);
    const r = bfsReachable("a", nodes, edges, { maxDepth: 2, edgeTypes: restricted });
    expect(r.size).toBe(1); // only a itself
  });
  it("treats isolated nodes as 0-hop only", () => {
    const isolated = makeNodes(["x", "y"]);
    const r = bfsReachable("x", isolated, [], { maxDepth: 3 });
    expect(r.get("x")).toBe(0);
    expect(r.size).toBe(1);
  });
  it("returns empty map for unknown start node", () => {
    const r = bfsReachable("z", nodes, edges, { maxDepth: 3 });
    expect(r.size).toBe(0);
  });
  it("handles cycles correctly (a → b → a)", () => {
    const cyc = makeNodes(["a", "b"]);
    const r = bfsReachable("a", cyc, [makeEdge("a", "b")], { maxDepth: 5 });
    expect(r.get("a")).toBe(0);
    expect(r.get("b")).toBe(1);
    expect(r.size).toBe(2);
  });
});

describe("V7 — impactFromNode (single start)", () => {
  it("returns [] when no decision is linked to any reachable node", () => {
    const r = impactFromNode(
      "a",
      makeNodes(["a", "b"]),
      [makeEdge("a", "b")],
      [makeAdr({ id: "d", linkedNodeIds: ["file:unrelated"] })],
      { maxDepth: 2 },
    );
    expect(r).toEqual([]);
  });
  it("returns a single decision when the start node is the link", () => {
    const r = impactFromNode(
      "file:1",
      makeNodes(["file:1"]),
      [],
      [makeAdr({ id: "d", linkedNodeIds: ["file:1"] })],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.decision.id).toBe("d");
    expect(r[0]!.touchedNodeIds).toEqual(["file:1"]);
    expect(r[0]!.minDepth).toBe(0);
  });
  it("returns the decision when reached via a 1-hop edge", () => {
    const r = impactFromNode(
      "file:a",
      makeNodes(["file:a", "file:b"]),
      [makeEdge("file:a", "file:b")],
      [makeAdr({ id: "d", linkedNodeIds: ["file:b"] })],
      { maxDepth: 2 },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.minDepth).toBe(1);
    expect(r[0]!.touchedNodeIds).toEqual(["file:b"]);
  });
  it("aggregates multiple touched nodes for the same decision", () => {
    const r = impactFromNode(
      "file:a",
      makeNodes(["file:a", "file:b", "file:c"]),
      [makeEdge("file:a", "file:b"), makeEdge("file:a", "file:c")],
      [makeAdr({ id: "d", linkedNodeIds: ["file:b", "file:c"] })],
      { maxDepth: 2 },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.fanOut).toBe(2);
    expect(r[0]!.touchedNodeIds.sort()).toEqual(["file:b", "file:c"]);
  });
  it("returns multiple decisions when several touch reachable nodes", () => {
    const r = impactFromNode(
      "file:a",
      makeNodes(["file:a", "file:b", "file:c"]),
      [makeEdge("file:a", "file:b"), makeEdge("file:a", "file:c")],
      [
        makeAdr({ id: "d1", linkedNodeIds: ["file:b"] }),
        makeAdr({ id: "d2", linkedNodeIds: ["file:c"] }),
      ],
      { maxDepth: 2 },
    );
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.decision.id).sort()).toEqual(["d1", "d2"]);
  });
  it("sorts results by severity desc", () => {
    const r = impactFromNode(
      "file:a",
      makeNodes(["file:a", "file:b", "file:c"]),
      [makeEdge("file:a", "file:b"), makeEdge("file:a", "file:c")],
      [
        makeAdr({ id: "low", linkedNodeIds: ["file:b"], tradeoffScore: 0.1 }),
        makeAdr({ id: "high", linkedNodeIds: ["file:c"], tradeoffScore: 0.95 }),
      ],
      { maxDepth: 2 },
    );
    expect(r[0]!.decision.id).toBe("high");
    expect(r[1]!.decision.id).toBe("low");
  });
});

describe("V7 — impactFromNodes (batch)", () => {
  it("merges touched nodes when same decision is reached from 2 starts", () => {
    const r = impactFromNodes(
      ["file:b", "file:c"],
      makeNodes(["file:a", "file:b", "file:c"]),
      [makeEdge("file:a", "file:b"), makeEdge("file:a", "file:c")],
      [makeAdr({ id: "d", linkedNodeIds: ["file:b", "file:c"] })],
      { maxDepth: 1 },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.fanOut).toBe(2);
    expect(r[0]!.touchedNodeIds.sort()).toEqual(["file:b", "file:c"]);
  });
  it("returns [] for empty starts", () => {
    const r = impactFromNodes([], makeNodes(["a"]), [], [makeAdr()]);
    expect(r).toEqual([]);
  });
});

describe("V8 — severityScore", () => {
  it("low for no fan-out, depth 1, no tradeoff", () => {
    expect(severityScore(0, 1, undefined)).toBeLessThan(0.5);
  });
  it("increases with fan-out", () => {
    const a = severityScore(1, 1, 0.5);
    const b = severityScore(10, 1, 0.5);
    expect(b).toBeGreaterThan(a);
  });
  it("decreases with depth (closer = more severe)", () => {
    const a = severityScore(3, 1, 0.5);
    const b = severityScore(3, 3, 0.5);
    expect(a).toBeGreaterThan(b);
  });
  it("increases with tradeoff score", () => {
    const a = severityScore(2, 1, 0.1);
    const b = severityScore(2, 1, 0.9);
    expect(b).toBeGreaterThan(a);
  });
  it("caps at 1.0", () => {
    expect(severityScore(100, 1, 1)).toBeLessThanOrEqual(1);
  });
});

describe("V8 — severityBucket", () => {
  it("classifies < 0.25 as low", () => expect(severityBucket(0.1)).toBe("low"));
  it("classifies 0.25..0.5 as medium", () => expect(severityBucket(0.3)).toBe("medium"));
  it("classifies 0.5..0.75 as high", () => expect(severityBucket(0.6)).toBe("high"));
  it("classifies ≥ 0.75 as critical", () => expect(severityBucket(0.9)).toBe("critical"));
});
