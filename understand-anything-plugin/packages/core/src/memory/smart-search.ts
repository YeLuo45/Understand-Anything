/**
 * Smart Search — query expansion + synonym ring (V20/30)
 *
 * Wraps HybridSearchRouter with:
 *   - synonym ring (configure per-domain)
 *   - query expansion (adds synonym variants)
 *   - stemming (light: plural/singular)
 *   - normalize
 *
 * Borrowed from agentmemory's `smart-search.ts` and `graph-retrieval.ts`.
 */

import { HybridSearchRouter, type RankedHit, type SearchBackend } from "./hybrid-search.js";

export type SynonymRing = Record<string, string[]>;

export interface SmartSearchOptions {
  synonyms?: SynonymRing;
  expandQuery?: boolean;
  pluralStemming?: boolean;
}

export const DEFAULT_SYNONYMS: SynonymRing = {
  api: ["endpoint", "route", "service"],
  database: ["db", "datastore", "storage"],
  user: ["account", "person", "member"],
  error: ["exception", "fault", "failure"],
};

export class SmartSearch {
  private router: HybridSearchRouter;
  private synonyms: SynonymRing;
  private expandQuery: boolean;
  private pluralStemming: boolean;

  constructor(router: HybridSearchRouter, opts: SmartSearchOptions = {}) {
    this.router = router;
    this.synonyms = { ...DEFAULT_SYNONYMS, ...(opts.synonyms ?? {}) };
    this.expandQuery = opts.expandQuery ?? true;
    this.pluralStemming = opts.pluralStemming ?? true;
  }

  register(backend: SearchBackend): void {
    this.router.register(backend);
  }

  search(query: string, limit: number = 10): RankedHit[] {
    const variants = this.expandQuery ? this._expand(query) : [query];
    const merged = new Map<string, RankedHit>();
    for (const v of variants) {
      const hits = this.router.search(v, limit);
      for (const h of hits) {
        const prev = merged.get(h.id);
        if (prev) {
          merged.set(h.id, {
            id: h.id,
            score: prev.score + h.score,
            source: prev.source,
            metadata: { ...prev.metadata, ...h.metadata, variants: ((prev.metadata?.variants as string[]) ?? []).concat([v]) },
          });
        } else {
          merged.set(h.id, { ...h, metadata: { ...h.metadata, variants: [v] } });
        }
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Generate query variants by substituting known synonyms. */
  private _expand(query: string): string[] {
    const out = new Set<string>([query]);
    const tokens = query.toLowerCase().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      const stem = this.pluralStemming ? this._stem(t) : t;
      for (const [key, syns] of Object.entries(this.synonyms)) {
        const all = [key, ...syns];
        if (all.includes(stem) || all.includes(t)) {
          for (const alt of all) {
            if (alt !== t) {
              const variant = [...tokens.slice(0, i), alt, ...tokens.slice(i + 1)].join(" ");
              out.add(variant);
            }
          }
        }
      }
    }
    return [...out];
  }

  /** Light stemming: remove trailing 's' (English plurals). */
  private _stem(token: string): string {
    if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
      return token.slice(0, -1);
    }
    return token;
  }
}
