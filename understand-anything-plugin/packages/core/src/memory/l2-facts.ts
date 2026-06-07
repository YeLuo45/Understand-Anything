/**
 * L2 Global Facts Engine — stable user/env knowledge (V9/30)
 *
 * Permanent facts: user preferences, environment config, stable API
 * endpoints. Facts rarely change and persist across sessions.
 * Borrowed from generic-agent's L2 layer.
 */

export type FactCategory = "preference" | "environment" | "endpoint" | "identity" | "config";

export interface GlobalFact {
  id: string;
  key: string;
  value: unknown;
  category: FactCategory;
  source?: string;
  confidence: number;
  version: number;        // increments on update
  createdAt: string;
  updatedAt: string;
}

export interface SetFactInput {
  key: string;
  value: unknown;
  category?: FactCategory;
  source?: string;
  confidence?: number;
}

export class GlobalFactsStore {
  private byId = new Map<string, GlobalFact>();
  private byKey = new Map<string, string>();  // key → id
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  size(): number {
    return this.byId.size;
  }

  get(id: string): GlobalFact | undefined {
    return this.byId.get(id);
  }

  getByKey(key: string): GlobalFact | undefined {
    const id = this.byKey.get(key);
    return id ? this.byId.get(id) : undefined;
  }

  set(input: SetFactInput): GlobalFact {
    const existing = this.getByKey(input.key);
    if (existing) {
      const updated: GlobalFact = {
        ...existing,
        value: input.value,
        category: input.category ?? existing.category,
        source: input.source ?? existing.source,
        confidence: input.confidence ?? existing.confidence,
        version: existing.version + 1,
        updatedAt: this.now(),
      };
      this.byId.set(existing.id, updated);
      return updated;
    }
    const id = `fact_${this.byId.size + 1}`;
    const fact: GlobalFact = {
      id,
      key: input.key,
      value: input.value,
      category: input.category ?? "config",
      source: input.source,
      confidence: input.confidence ?? 1.0,
      version: 1,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.byId.set(id, fact);
    this.byKey.set(input.key, id);
    return fact;
  }

  delete(idOrKey: string): boolean {
    const fact = this.byId.has(idOrKey)
      ? this.byId.get(idOrKey)
      : this.getByKey(idOrKey);
    if (!fact) return false;
    this.byId.delete(fact.id);
    this.byKey.delete(fact.key);
    return true;
  }

  list(filter: { category?: FactCategory } = {}): GlobalFact[] {
    const all = [...this.byId.values()];
    if (!filter.category) return all;
    return all.filter((f) => f.category === filter.category);
  }

  clear(): void {
    this.byId.clear();
    this.byKey.clear();
  }
}
