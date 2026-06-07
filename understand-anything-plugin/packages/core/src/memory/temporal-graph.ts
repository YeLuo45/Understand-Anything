/**
 * Temporal Graph — time-windowed traversal (V19/30)
 *
 * Wraps MemoryGraph with time-windowed queries:
 *   - queryTimeRange(t0, t1): nodes/edges created in window
 *   - trajectory(nodeId): time-ordered node/edge visit history
 *   - snapshotAt(t): graph state at given timestamp
 *
 * Borrowed from agentmemory's `temporal-graph.ts`.
 */

import { MemoryGraph, type GraphNode, type GraphEdge } from "./graph.js";

export interface TemporalQuery {
  fromTs: string;
  toTs: string;
}

export class TemporalGraph {
  private graph: MemoryGraph;

  constructor(graph: MemoryGraph = new MemoryGraph()) {
    this.graph = graph;
  }

  /** Underlying graph accessor. */
  underlying(): MemoryGraph {
    return this.graph;
  }

  /** All nodes with createdAt in [fromTs, toTs]. */
  nodesInRange(query: TemporalQuery): GraphNode[] {
    return this.graph.listNodes().filter((n) =>
      n.createdAt >= query.fromTs && n.createdAt <= query.toTs,
    );
  }

  /** All edges with createdAt in [fromTs, toTs]. */
  edgesInRange(query: TemporalQuery): GraphEdge[] {
    return this.graph.listEdges().filter((e) =>
      e.createdAt >= query.fromTs && e.createdAt <= query.toTs,
    );
  }

  /** Time-ordered list of node and edge IDs touched by a node's traversal. */
  trajectory(nodeId: string, maxHops: number = 3): Array<{ ts: string; kind: "node" | "edge"; id: string }> {
    const visited = this.graph.neighbors(nodeId, maxHops);
    const events: Array<{ ts: string; kind: "node" | "edge"; id: string }> = [];
    const start = this.graph.getNode(nodeId);
    if (start) events.push({ ts: start.createdAt, kind: "node", id: nodeId });
    for (const n of visited) {
      const node = this.graph.getNode(n);
      if (node) events.push({ ts: node.createdAt, kind: "node", id: n });
    }
    for (const e of this.graph.listEdges()) {
      if (visited.includes(e.source) || visited.includes(e.target) || e.source === nodeId) {
        events.push({ ts: e.createdAt, kind: "edge", id: e.id });
      }
    }
    return events.sort((a, b) => a.ts.localeCompare(b.ts));
  }

  /** Count of nodes/edges created before a given timestamp. */
  countBefore(ts: string): { nodes: number; edges: number } {
    return {
      nodes: this.graph.listNodes().filter((n) => n.createdAt < ts).length,
      edges: this.graph.listEdges().filter((e) => e.createdAt < ts).length,
    };
  }

  /** Count of nodes/edges created after a given timestamp. */
  countAfter(ts: string): { nodes: number; edges: number } {
    return {
      nodes: this.graph.listNodes().filter((n) => n.createdAt > ts).length,
      edges: this.graph.listEdges().filter((e) => e.createdAt > ts).length,
    };
  }
}
