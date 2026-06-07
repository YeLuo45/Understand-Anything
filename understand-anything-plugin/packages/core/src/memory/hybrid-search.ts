/**
 * Hybrid Search Router — three-way recall with weighted rerank (V15/30)
 *
 * Routes a search query through BM25 (keyword) + vector (semantic) +
 * graph (relationship) backends, then merges results with a weighted
 * rerank. Each backend returns RankedHit[]; router sums weighted scores
 * and returns the merged ranking.
 *
 * Borrowed from agentmemory's `search.ts` (search function).
 */

export interface RankedHit {
  id: string;
  score: number;
  source: "bm25" | "vector" | "graph";
  metadata?: Record<string, unknown>;
}

export interface SearchBackend {
  readonly name: "bm25" | "vector" | "graph";
  search(query: string, limit: number): RankedHit[];
}

export interface HybridWeights {
  bm25: number;
  vector: number;
  graph: number;
}

export const DEFAULT_WEIGHTS: HybridWeights = {
  bm25: 0.4,
  vector: 0.4,
  graph: 0.2,
};

export class HybridSearchRouter {
  private backends: SearchBackend[] = [];
  private weights: HybridWeights;

  constructor(weights: HybridWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  register(backend: SearchBackend): void {
    if (this.backends.some((b) => b.name === backend.name)) {
      throw new Error(`Backend ${backend.name} already registered`);
    }
    this.backends.push(backend);
  }

  weights_(): HybridWeights {
    return { ...this.weights };
  }

  setWeights(w: HybridWeights): void {
    this.weights = { ...w };
  }

  backends_(): ReadonlyArray<SearchBackend> {
    return this.backends;
  }

  search(query: string, limit: number = 10): RankedHit[] {
    const merged = new Map<string, RankedHit>();
    for (const backend of this.backends) {
      const weight = this.weights[backend.name];
      const hits = backend.search(query, limit * 2);
      for (const h of hits) {
        const prev = merged.get(h.id);
        const weightedScore = h.score * weight;
        if (prev) {
          // Sum scores from all backends
          const sources = prev.source.split(",");
          if (!sources.includes(backend.name)) {
            sources.push(backend.name);
          }
          merged.set(h.id, {
            id: h.id,
            score: prev.score + weightedScore,
            source: sources.join(",") as RankedHit["source"],
            metadata: { ...prev.metadata, ...h.metadata },
          });
        } else {
          merged.set(h.id, {
            id: h.id,
            score: weightedScore,
            source: backend.name,
            metadata: h.metadata,
          });
        }
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
