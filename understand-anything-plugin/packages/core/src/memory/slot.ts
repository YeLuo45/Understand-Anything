/**
 * Slot Engine — working memory with TTL (V6/30)
 *
 * Lightweight key-value slots scoped by user/agent. Each slot has:
 *   - key (string)
 *   - value (any JSON-serializable)
 *   - scope (isolation)
 *   - ttlMs (sliding-window expiration)
 *   - lastUpdatedAt
 *
 * Borrowed from agentmemory's Slot type.
 */

export interface Slot {
  key: string;
  value: unknown;
  scope: string;
  ttlMs?: number;
  lastUpdatedAt: string;
}

export interface PutSlotOptions {
  scope?: string;
  ttlMs?: number;
}

export class SlotStore {
  private slots = new Map<string, Slot>();  // key = `${scope}:${key}`
  private now: () => string;
  private nowMs: () => number;
  private defaultScope: string;

  constructor(opts: { scope?: string; now?: () => string; nowMs?: () => number } = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.defaultScope = opts.scope ?? "default";
  }

  private _compositeKey(scope: string, key: string): string {
    return `${scope}:${key}`;
  }

  put(key: string, value: unknown, opts: PutSlotOptions = {}): Slot {
    const scope = opts.scope ?? this.defaultScope;
    const slot: Slot = {
      key,
      value,
      scope,
      ttlMs: opts.ttlMs,
      lastUpdatedAt: this.now(),
    };
    this.slots.set(this._compositeKey(scope, key), slot);
    return slot;
  }

  get(key: string, scope?: string): Slot | undefined {
    const s = scope ?? this.defaultScope;
    const slot = this.slots.get(this._compositeKey(s, key));
    if (!slot) return undefined;
    if (this._isExpired(slot)) {
      this.slots.delete(this._compositeKey(s, key));
      return undefined;
    }
    return slot;
  }

  has(key: string, scope?: string): boolean {
    return this.get(key, scope) !== undefined;
  }

  delete(key: string, scope?: string): boolean {
    const s = scope ?? this.defaultScope;
    return this.slots.delete(this._compositeKey(s, key));
  }

  size(scope?: string): number {
    if (!scope) return this.slots.size;
    let n = 0;
    for (const slot of this.slots.values()) {
      if (slot.scope === scope) n++;
    }
    return n;
  }

  list(scope?: string): Slot[] {
    const out: Slot[] = [];
    for (const slot of this.slots.values()) {
      if (scope && slot.scope !== scope) continue;
      if (this._isExpired(slot)) continue;
      out.push(slot);
    }
    return out;
  }

  /** Returns the number of slots removed. */
  sweepExpired(nowMsOverride?: number): number {
    const refMs = nowMsOverride ?? this.nowMs();
    let removed = 0;
    for (const [k, slot] of this.slots.entries()) {
      if (slot.ttlMs === undefined) continue;
      const ageMs = refMs - new Date(slot.lastUpdatedAt).getTime();
      if (ageMs > slot.ttlMs) {
        this.slots.delete(k);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.slots.clear();
  }

  private _isExpired(slot: Slot): boolean {
    if (slot.ttlMs === undefined) return false;
    const ageMs = this.nowMs() - new Date(slot.lastUpdatedAt).getTime();
    return ageMs > slot.ttlMs;
  }
}
