/**
 * BM25 Keyword Search — TF-IDF scoring (V16/30)
 *
 * Classic BM25 with parameters k1=1.5, b=0.75. Tokenizes on
 * word boundaries and lowercases. Returns RankedHit[].
 */

import type { RankedHit, SearchBackend } from "./hybrid-search.js";

export interface BM25Doc {
  id: string;
  text: string;
}

export interface BM25Options {
  k1?: number;
  b?: number;
}

export const DEFAULT_BM25: Required<BM25Options> = {
  k1: 1.5,
  b: 0.75,
};

function isAsciiWordChar(c: string): boolean {
  return /[a-z0-9_]/i.test(c);
}

function isCjk(c: string): boolean {
  return /[\u4e00-\u9fff]/.test(c);
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.length > 0) {
      out.push(buf);
      buf = "";
    }
  };
  for (const c of lower) {
    if (isAsciiWordChar(c) || isCjk(c)) {
      // For CJK, also emit individual character tokens (unigram)
      // so "中文" as a query can match "中文测试" as a doc.
      if (isCjk(c)) {
        flush();
        out.push(c);
      } else {
        buf += c;
      }
    } else {
      flush();
    }
  }
  flush();
  return out;
}

export class BM25Index implements SearchBackend {
  readonly name = "bm25" as const;
  private docs: BM25Doc[] = [];
  private inverted = new Map<string, Set<number>>();  // token → doc indices
  private docLen: number[] = [];
  private avgDl: number = 0;
  private k1: number;
  private b: number;

  constructor(opts: BM25Options = {}) {
    this.k1 = opts.k1 ?? DEFAULT_BM25.k1;
    this.b = opts.b ?? DEFAULT_BM25.b;
  }

  add(doc: BM25Doc): void {
    const idx = this.docs.length;
    this.docs.push(doc);
    this.docLen.push(tokenize(doc.text).length);
    for (const t of new Set(tokenize(doc.text))) {
      let s = this.inverted.get(t);
      if (!s) {
        s = new Set();
        this.inverted.set(t, s);
      }
      s.add(idx);
    }
    this._recomputeAvgDl();
  }

  size(): number {
    return this.docs.length;
  }

  search(query: string, limit: number = 10): RankedHit[] {
    const tokens = tokenize(query);
    if (tokens.length === 0 || this.docs.length === 0) return [];
    const N = this.docs.length;
    const scores: number[] = new Array(N).fill(0);
    for (const t of tokens) {
      const docs = this.inverted.get(t);
      if (!docs || docs.size === 0) continue;
      const df = docs.size;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const d of docs) {
        const tf = this._tf(d, t);
        const dl = this.docLen[d] ?? 0;
        const norm = 1 - this.b + this.b * (dl / (this.avgDl || 1));
        scores[d] = (scores[d] ?? 0) + idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * norm));
      }
    }
    const hits: RankedHit[] = [];
    for (let i = 0; i < N; i++) {
      if ((scores[i] ?? 0) > 0) {
        hits.push({ id: this.docs[i]!.id, score: scores[i]!, source: "bm25" });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private _tf(docIdx: number, token: string): number {
    const text = this.docs[docIdx]?.text.toLowerCase() ?? "";
    return tokenize(text).filter((t) => t === token).length;
  }

  private _recomputeAvgDl(): void {
    if (this.docLen.length === 0) {
      this.avgDl = 0;
    } else {
      this.avgDl = this.docLen.reduce((s, n) => s + n, 0) / this.docLen.length;
    }
  }
}
