/**
 * Memory Graph — graph of nodes/edges with confidence (V18/30)
 *
 * General-purpose knowledge graph that can wrap MemoryEntry objects.
 * Supports:
 *   - addNode / addEdge
 *   - neighbors (BFS up to N hops)
 *   - traverse (DFS)
 *   - edgesByType
 *
 * Borrowed from agentmemory's `graph.ts` function.
 */

export type GraphNodeType = "entity" | "concept" | "fact" | "rule" | "lesson" | "skill";
export type GraphEdgeType = "references" | "causes" | "temporal-after" | "related" | "supports" | "contradicts" | "derived-from" | "example-of";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: string;
  lastTraversedAt?: string;
}

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  source: string;
  target: string;
  weight: number;
  confidence: number;
  createdAt: string;
}

export class MemoryGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private outgoing = new Map<string, Set<string>>();  // nodeId → edgeIds
  private incoming = new Map<string, Set<string>>();
  private now: () => string;
  private counter = 0;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  size(): { nodes: number; edges: number } {
    return { nodes: this.nodes.size, edges: this.edges.size };
  }

  addNode(node: Omit<GraphNode, "createdAt">): GraphNode {
    const full: GraphNode = { ...node, createdAt: this.now() };
    this.nodes.set(node.id, full);
    return full;
  }

  addEdge(edge: Omit<GraphEdge, "id" | "createdAt">): GraphEdge {
    if (!this.nodes.has(edge.source)) {
      throw new Error(`addEdge: source node ${edge.source} does not exist`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`addEdge: target node ${edge.target} does not exist`);
    }
    this.counter++;
    const full: GraphEdge = { ...edge, id: `edge_${this.counter}`, createdAt: this.now() };
    this.edges.set(full.id, full);
    this._addToIndex(this.outgoing, edge.source, full.id);
    this._addToIndex(this.incoming, edge.target, full.id);
    return full;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  listNodes(type?: GraphNodeType): GraphNode[] {
    const all = [...this.nodes.values()];
    return type ? all.filter((n) => n.type === type) : all;
  }

  listEdges(type?: GraphEdgeType): GraphEdge[] {
    const all = [...this.edges.values()];
    return type ? all.filter((e) => e.type === type) : all;
  }

  /** Outgoing edges from a node, optionally filtered by type. */
  outgoing_(nodeId: string, type?: GraphEdgeType): GraphEdge[] {
    const ids = this.outgoing.get(nodeId);
    if (!ids) return [];
    const edges: GraphEdge[] = [];
    for (const id of ids) {
      const e = this.edges.get(id);
      if (e && (!type || e.type === type)) edges.push(e);
    }
    return edges;
  }

  /** Incoming edges to a node, optionally filtered by type. */
  incoming_(nodeId: string, type?: GraphEdgeType): GraphEdge[] {
    const ids = this.incoming.get(nodeId);
    if (!ids) return [];
    const edges: GraphEdge[] = [];
    for (const id of ids) {
      const e = this.edges.get(id);
      if (e && (!type || e.type === type)) edges.push(e);
    }
    return edges;
  }

  /** BFS traversal up to maxHops hops. Returns node IDs in visit order. */
  neighbors(nodeId: string, maxHops: number = 2): string[] {
    if (!this.nodes.has(nodeId)) return [];
    const visited = new Set<string>([nodeId]);
    let frontier = [nodeId];
    for (let hop = 0; hop < maxHops; hop++) {
      const next: string[] = [];
      for (const n of frontier) {
        for (const e of this.outgoing_(n)) {
          if (!visited.has(e.target)) {
            visited.add(e.target);
            next.push(e.target);
          }
        }
        for (const e of this.incoming_(n)) {
          if (!visited.has(e.source)) {
            visited.add(e.source);
            next.push(e.source);
          }
        }
      }
      frontier = next;
      if (next.length === 0) break;
    }
    return [...visited].filter((id) => id !== nodeId);
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    // Cascade remove edges
    const out = [...(this.outgoing.get(id) ?? [])];
    for (const eid of out) this.removeEdge(eid);
    const inc = [...(this.incoming.get(id) ?? [])];
    for (const eid of inc) this.removeEdge(eid);
    this.nodes.delete(id);
    return true;
  }

  removeEdge(id: string): boolean {
    const e = this.edges.get(id);
    if (!e) return false;
    this._removeFromIndex(this.outgoing, e.source, id);
    this._removeFromIndex(this.incoming, e.target, id);
    return this.edges.delete(id);
  }

  private _addToIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    let s = map.get(key);
    if (!s) {
      s = new Set();
      map.set(key, s);
    }
    s.add(id);
  }

  private _removeFromIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    const s = map.get(key);
    if (!s) return;
    s.delete(id);
    if (s.size === 0) map.delete(key);
  }
}
