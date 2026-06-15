/**
 * Impact propagation — V6 / V7 / V8 of Direction B
 *
 * Given a knowledge graph (nodes + edges) and a set of ADRs, compute
 * which decisions are affected when a given file (or any node id)
 * changes. The propagation walks the graph forward (along imports,
 * contains, calls edges) up to a configurable depth, then filters the
 * affected nodes down to the ADRs whose `linkedNodeIds` intersect the
 * propagated set.
 *
 *   staleness
 *     └── (R2 V11-V12) on a per-ADR basis, file-level granularity
 *   impact propagation   ← (this module, R2-B V6-V8) on a graph basis,
 *                            node-level granularity, 1+ hop fan-out
 */
import type { ArchitectureDecisionRecord } from "../types.js";

/** Minimal graph node (subset of `GraphNode`). */
export interface ImpactNode {
  id: string;
}

/** Minimal graph edge (subset of `GraphEdge`). */
export interface ImpactEdge {
  source: string;
  target: string;
  /** Edge type; "imports" / "contains" / "calls" propagate. */
  type: string;
}

/** A single ADR's exposure to a propagated impact. */
export interface ImpactedDecision {
  decision: ArchitectureDecisionRecord;
  /** The graph node id(s) the decision references that the impact touched. */
  touchedNodeIds: string[];
  /** Severity bucket (see V8). */
  severity: "low" | "medium" | "high" | "critical";
  /** Numeric score in [0, 1]. */
  severityScore: number;
  /** Fan-out: number of distinct graph nodes affected. */
  fanOut: number;
  /** BFS depth at which the decision's first link was found. */
  minDepth: number;
}

/** Edge types that propagate impact. */
const PROPAGATING_EDGE_TYPES = new Set([
  "imports",
  "contains",
  "calls",
  "depends_on",
  "exports",
]);

/** V6 — Build the reverse index: nodeId → decision[]. */
export function buildImpactIndex(
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
): Map<string, ArchitectureDecisionRecord[]> {
  const out = new Map<string, ArchitectureDecisionRecord[]>();
  for (const d of decisions) {
    for (const nid of d.linkedNodeIds) {
      const arr = out.get(nid);
      if (arr) arr.push(d);
      else out.set(nid, [d]);
    }
  }
  return out;
}

/** V7 — BFS reachability: which nodeIds are reachable from `startId`? */
export function bfsReachable(
  startId: string,
  nodes: ReadonlyArray<ImpactNode>,
  edges: ReadonlyArray<ImpactEdge>,
  options: { maxDepth?: number; edgeTypes?: ReadonlySet<string> } = {},
): Map<string, number> {
  const maxDepth = options.maxDepth ?? 3;
  const allowed = options.edgeTypes ?? PROPAGATING_EDGE_TYPES;
  // Adjacency list (only propagating edges).
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!allowed.has(e.type)) continue;
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    // also include reverse direction (e.g. caller → callee is captured both ways)
    adj.get(e.target)!.push(e.source);
  }
  // Start the BFS only if the start node actually exists in the graph.
  // Unknown start nodes yield an empty map (per the contract in V7).
  if (!adj.has(startId)) return new Map();
  const distance = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  distance.set(startId, 0);
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    for (const next of adj.get(id) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, depth + 1);
      queue.push({ id: next, depth: depth + 1 });
    }
  }
  return distance;
}

/** V7/V8 — Propagate impact from one node to the affected ADRs. */
export function impactFromNode(
  startId: string,
  nodes: ReadonlyArray<ImpactNode>,
  edges: ReadonlyArray<ImpactEdge>,
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
  options: { maxDepth?: number; tradeoffScoreLookup?: (id: string) => number | undefined } = {},
): ImpactedDecision[] {
  const distances = bfsReachable(startId, nodes, edges, { maxDepth: options.maxDepth });
  if (distances.size === 0) return [];
  const index = buildImpactIndex(decisions);
  const lookup = options.tradeoffScoreLookup;
  const out: ImpactedDecision[] = [];
  for (const [nid, depth] of distances) {
    const ds = index.get(nid);
    if (!ds) continue;
    for (const d of ds) {
      const existing = out.find((x) => x.decision.id === d.id);
      if (existing) {
        existing.touchedNodeIds.push(nid);
        existing.fanOut = existing.touchedNodeIds.length;
        existing.minDepth = Math.min(existing.minDepth, depth);
      } else {
        out.push({
          decision: d,
          touchedNodeIds: [nid],
          severityScore: 0,
          severity: "low",
          fanOut: 1,
          minDepth: depth,
        });
      }
    }
  }
  // V8 — compute severity per impacted decision
  for (const x of out) {
    const tradeoff = lookup?.(x.decision.id) ?? x.decision.tradeoffScore;
    const score = severityScore(x.fanOut, x.minDepth, tradeoff);
    x.severityScore = score;
    x.severity = severityBucket(score);
  }
  // Sort by severity desc, then min depth asc
  out.sort((a, b) => {
    if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
    return a.minDepth - b.minDepth;
  });
  return out;
}

/** Propagate from many nodes at once. De-dups results by decision id. */
export function impactFromNodes(
  startIds: ReadonlyArray<string>,
  nodes: ReadonlyArray<ImpactNode>,
  edges: ReadonlyArray<ImpactEdge>,
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
  options: { maxDepth?: number } = {},
): ImpactedDecision[] {
  const merged = new Map<string, ImpactedDecision>();
  for (const sid of startIds) {
    for (const x of impactFromNode(sid, nodes, edges, decisions, options)) {
      const existing = merged.get(x.decision.id);
      if (existing) {
        // Merge touched nodes
        for (const nid of x.touchedNodeIds) {
          if (!existing.touchedNodeIds.includes(nid)) {
            existing.touchedNodeIds.push(nid);
          }
        }
        existing.fanOut = existing.touchedNodeIds.length;
        existing.minDepth = Math.min(existing.minDepth, x.minDepth);
      } else {
        merged.set(x.decision.id, { ...x, touchedNodeIds: [...x.touchedNodeIds] });
      }
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.severityScore - a.severityScore,
  );
}

/** V8 — Severity score in [0, 1]. Combines fan-out, depth, and tradeoff. */
export function severityScore(
  fanOut: number,
  minDepth: number,
  tradeoffScore: number | undefined,
): number {
  // fan-out component: 0..0.5 (more = worse). 1 node = 0, 10+ nodes = 0.5
  const fanOutComp = Math.min(0.5, Math.log10(1 + Math.max(0, fanOut)) * 0.25);
  // depth component: 0..0.25. depth 1 = 0.25, depth 3 = ~0.08
  const depthComp = 0.25 / Math.max(1, minDepth);
  // tradeoffScore component: 0..0.25 (higher = more critical to keep working)
  const tradeoffComp = typeof tradeoffScore === "number" ? Math.min(0.25, tradeoffScore * 0.25) : 0.1;
  return Math.min(1, fanOutComp + depthComp + tradeoffComp);
}

/** V8 — Map a numeric severity score to a human bucket. */
export function severityBucket(score: number): "low" | "medium" | "high" | "critical" {
  if (score < 0.25) return "low";
  if (score < 0.5) return "medium";
  if (score < 0.75) return "high";
  return "critical";
}
