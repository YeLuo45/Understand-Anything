/**
 * Vector Similarity Search — cosine similarity, top-k (V17/30)
 *
 * Naive O(n) cosine-similarity search. For larger corpora, swap in
 * a real ANN backend. The SearchBackend interface is stable.
 */

import type { RankedHit, SearchBackend } from "./hybrid-search.js";

export interface VectorDoc {
  id: string;
  vector: number[];
}

export class VectorIndex implements SearchBackend {
  readonly name = "vector" as const;
  private docs: VectorDoc[] = [];

  size(): number {
    return this.docs.length;
  }

  add(doc: VectorDoc): void {
    if (doc.vector.length === 0) {
      throw new Error("VectorIndex: cannot add doc with empty vector");
    }
    this.docs.push(doc);
  }

  search(query: string, limit: number = 10): RankedHit[] {
    // For now, parse query as JSON-encoded vector; or compute from text
    // via a token-frequency hash projection (intentionally simple).
    const queryVec = this._textToVector(query);
    if (queryVec.length === 0) return [];
    const scored: RankedHit[] = [];
    for (const d of this.docs) {
      if (d.vector.length !== queryVec.length) continue;  // dim mismatch
      const sim = cosineSimilarity(queryVec, d.vector);
      if (sim > 0) {
        scored.push({ id: d.id, score: sim, source: "vector" });
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Project text into a fixed-dimension vector via character n-gram hashing. */
  private _textToVector(text: string, dim: number = 64): number[] {
    const v = new Array(dim).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const code = lower.charCodeAt(i);
      const idx = code % dim;
      v[idx] = (v[idx] ?? 0) + 1;
    }
    // L2 normalize
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm > 0) {
      for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
    }
    return v;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
