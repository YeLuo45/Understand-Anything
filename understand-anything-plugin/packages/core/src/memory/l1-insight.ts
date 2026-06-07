/**
 * L1 Insight Index — fast routing to L3 skills (V8/30)
 *
 * Minimal pointer records that map keywords to L3 skill IDs.
 * Used as a routing layer: when a task arrives, L1 helps identify
 * which L3 skills are relevant without loading full content.
 *
 * Borrowed from generic-agent's L1 layer.
 */

export interface Insight {
  keyword: string;
  skillId: string;
  weight: number;          // 0..1
  description?: string;
  addedAt: string;
}

export interface RouteQuery {
  keywords: string[];
  minWeight?: number;
  topK?: number;
}

export interface RouteHit {
  skillId: string;
  score: number;
  matchedKeywords: string[];
}

export class InsightIndex {
  private index = new Map<string, Insight[]>();  // keyword → insights
  private skillIndex = new Map<string, Set<string>>();  // skillId → keywords
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  add(insight: Omit<Insight, "addedAt">): Insight {
    const full: Insight = { ...insight, addedAt: this.now() };
    const list = this.index.get(insight.keyword) ?? [];
    list.push(full);
    this.index.set(insight.keyword, list);
    let set = this.skillIndex.get(insight.skillId);
    if (!set) {
      set = new Set();
      this.skillIndex.set(insight.skillId, set);
    }
    set.add(insight.keyword);
    return full;
  }

  remove(skillId: string, keyword?: string): number {
    if (!keyword) {
      const ks = this.skillIndex.get(skillId);
      if (!ks) return 0;
      let removed = 0;
      for (const k of ks) {
        const list = this.index.get(k) ?? [];
        const next = list.filter((i) => i.skillId !== skillId);
        removed += list.length - next.length;
        if (next.length === 0) this.index.delete(k);
        else this.index.set(k, next);
      }
      this.skillIndex.delete(skillId);
      return removed;
    }
    const list = this.index.get(keyword) ?? [];
    const next = list.filter((i) => i.skillId !== skillId);
    const removed = list.length - next.length;
    if (next.length === 0) this.index.delete(keyword);
    else this.index.set(keyword, next);
    const ks = this.skillIndex.get(skillId);
    if (ks) {
      ks.delete(keyword);
      if (ks.size === 0) this.skillIndex.delete(skillId);
    }
    return removed;
  }

  size(): number {
    return this.skillIndex.size;
  }

  /** Total number of insight records (not unique skills). */
  total(): number {
    let n = 0;
    for (const list of this.index.values()) n += list.length;
    return n;
  }

  keywords(): string[] {
    return [...this.index.keys()];
  }

  forSkill(skillId: string): Insight[] {
    const ks = this.skillIndex.get(skillId);
    if (!ks) return [];
    const out: Insight[] = [];
    for (const k of ks) {
      const list = this.index.get(k) ?? [];
      for (const i of list) {
        if (i.skillId === skillId) out.push(i);
      }
    }
    return out;
  }

  route(query: RouteQuery): RouteHit[] {
    const minWeight = query.minWeight ?? 0;
    const topK = query.topK ?? 10;
    const scoreBySkill = new Map<string, { score: number; keywords: Set<string> }>();
    for (const k of query.keywords) {
      const list = this.index.get(k) ?? [];
      for (const i of list) {
        if (i.weight < minWeight) continue;
        const cur = scoreBySkill.get(i.skillId) ?? { score: 0, keywords: new Set() };
        cur.score += i.weight;
        cur.keywords.add(k);
        scoreBySkill.set(i.skillId, cur);
      }
    }
    const out: RouteHit[] = [];
    for (const [skillId, v] of scoreBySkill.entries()) {
      out.push({ skillId, score: v.score, matchedKeywords: [...v.keywords] });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, topK);
  }
}
