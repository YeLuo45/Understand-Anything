/**
 * MemoryKV — Primary key-value store (Direction A V2/30)
 *
 * Map-based store with fingerprint dedup, scope/tag indexes, and
 * lifecycle-aware listing. Borrowed from agentmemory's `memory:{id}`
 * prefix pattern.
 */

import {
  createMemoryEntry,
  fingerprintId,
  type CreateMemoryInput,
  type MemoryEntry,
  type MemoryLifecycle,
} from "./schema.js";

export interface MemoryKVOptions {
  scope?: string;        // default scope for entries without explicit scope
  now?: () => string;
}

export interface PutResult {
  entry: MemoryEntry;
  inserted: boolean;     // false when fingerprint already exists
  replacedId?: string;   // id of the entry whose fingerprint matched
}

export interface ListFilter {
  scope?: string;
  tags?: string[];
  lifecycle?: MemoryLifecycle | MemoryLifecycle[];
  minConfidence?: number;
}

export class MemoryKV {
  private entries = new Map<string, MemoryEntry>();
  private byFingerprint = new Map<string, string>();  // fingerprint → id
  private byScope = new Map<string, Set<string>>();   // scope → set<id>
  private byTag = new Map<string, Set<string>>();     // tag → set<id>
  private now: () => string;
  private defaultScope: string;

  constructor(opts: MemoryKVOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.defaultScope = opts.scope ?? "default";
  }

  size(): number {
    return this.entries.size;
  }

  put(input: CreateMemoryInput & { id?: string }): PutResult {
    const id = input.id ?? `mem_${this.entries.size + 1}`;
    const scope = input.scope ?? this.defaultScope;
    const fp = fingerprintId(input.content);
    const existingId = this.byFingerprint.get(fp);
    if (existingId && existingId !== id) {
      const existing = this.entries.get(existingId);
      if (existing && existing.scope === scope) {
        return { entry: existing, inserted: false, replacedId: existingId };
      }
    }
    const entry = createMemoryEntry(id, { ...input, scope }, this.now);
    this.entries.set(id, entry);
    this.byFingerprint.set(fp, id);
    this._addToIndex(this.byScope, scope, id);
    for (const tag of entry.tags) {
      this._addToIndex(this.byTag, tag, id);
    }
    return { entry, inserted: true };
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  getByFingerprint(content: string): MemoryEntry | undefined {
    const id = this.byFingerprint.get(fingerprintId(content));
    return id ? this.entries.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  delete(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.byFingerprint.delete(entry.fingerprint);
    this._removeFromIndex(this.byScope, entry.scope, id);
    for (const tag of entry.tags) {
      this._removeFromIndex(this.byTag, tag, id);
    }
    return true;
  }

  setLifecycle(id: string, lifecycle: MemoryLifecycle): MemoryEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const updated: MemoryEntry = { ...entry, lifecycle };
    this.entries.set(id, updated);
    return updated;
  }

  list(filter: ListFilter = {}): MemoryEntry[] {
    let candidates: Iterable<string>;
    if (filter.scope) {
      candidates = this.byScope.get(filter.scope) ?? [];
    } else if (filter.tags && filter.tags.length > 0) {
      // intersection of tag sets
      const sets = filter.tags.map((t) => this.byTag.get(t) ?? new Set<string>());
      if (sets.some((s) => s.size === 0)) return [];
      const [first, ...rest] = sets;
      candidates = [...first!].filter((id) => rest.every((s) => s.has(id)));
    } else {
      candidates = this.entries.keys();
    }
    const lcFilter = filter.lifecycle
      ? Array.isArray(filter.lifecycle) ? filter.lifecycle : [filter.lifecycle]
      : null;
    const minConf = filter.minConfidence ?? 0;
    const out: MemoryEntry[] = [];
    for (const id of candidates) {
      const e = this.entries.get(id);
      if (!e) continue;
      if (lcFilter && !lcFilter.includes(e.lifecycle)) continue;
      if (e.confidence < minConf) continue;
      out.push(e);
    }
    return out;
  }

  scopes(): string[] {
    return [...this.byScope.keys()];
  }

  tags(): string[] {
    return [...this.byTag.keys()];
  }

  clear(): void {
    this.entries.clear();
    this.byFingerprint.clear();
    this.byScope.clear();
    this.byTag.clear();
  }

  private _addToIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(id);
  }

  private _removeFromIndex(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }
}
