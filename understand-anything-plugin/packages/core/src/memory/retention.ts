/**
 * Retention Policy Engine — TTL rules + auto-forget (V22/30)
 *
 * Applies scope-based retention rules to a MemoryKV:
 *   - per-scope max age
 *   - per-scope max entries
 *   - global policies (e.g. evict all archived older than X days)
 *
 * Borrowed from agentmemory's `retention.ts`.
 */

import { MemoryKV } from "./kv.js";
import type { MemoryEntry, MemoryLifecycle } from "./schema.js";

export interface ScopePolicy {
  maxAgeDays?: number;
  maxEntries?: number;
  archiveAfterDays?: number;
}

export interface RetentionConfig {
  defaultPolicy?: ScopePolicy;
  scopePolicies?: Record<string, ScopePolicy>;
  /** Lifecycle to set when entry expires (default: "evicted"). */
  expireLifecycle?: MemoryLifecycle;
  now?: () => number;        // ms
}

export const DEFAULT_RETENTION_CONFIG: Required<Pick<RetentionConfig, "expireLifecycle">> & RetentionConfig = {
  expireLifecycle: "evicted",
};

export interface RetentionResult {
  evicted: number;
  archived: number;
  total: number;
}

export class RetentionEngine {
  private config: RetentionConfig;

  constructor(config: RetentionConfig = {}) {
    this.config = config;
  }

  /**
   * Apply policies to a KV. Returns counts of mutated entries.
   * Mutates the KV by changing lifecycle or deleting entries.
   */
  apply(kv: MemoryKV): RetentionResult {
    const nowMs = (this.config.now ?? Date.now)();
    const expireLifecycle = this.config.expireLifecycle ?? "evicted";
    let evicted = 0;
    let archived = 0;
    const all = kv.list();
    for (const e of all) {
      const policy = this._policyFor(e.scope);
      if (!policy) continue;
      const ageDays = (nowMs - new Date(e.createdAt).getTime()) / 86_400_000;
      // archive first
      if (policy.archiveAfterDays && ageDays >= policy.archiveAfterDays && e.lifecycle !== "archived") {
        kv.setLifecycle(e.id, "archived");
        archived++;
      }
      // evict
      if (policy.maxAgeDays && ageDays >= policy.maxAgeDays) {
        kv.setLifecycle(e.id, expireLifecycle);
        if (expireLifecycle === "evicted") {
          kv.delete(e.id);
        }
        evicted++;
      }
    }
    // cap by maxEntries per scope
    const perScope = new Map<string, MemoryEntry[]>();
    for (const e of kv.list()) {
      if (e.lifecycle === "evicted" || e.lifecycle === "archived") continue;
      const list = perScope.get(e.scope) ?? [];
      list.push(e);
      perScope.set(e.scope, list);
    }
    for (const [scope, entries] of perScope) {
      const policy = this._policyFor(scope);
      if (!policy?.maxEntries) continue;
      if (entries.length <= policy.maxEntries) continue;
      // Sort by createdAt ascending (oldest first), drop the oldest
      const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const toEvict = sorted.slice(0, sorted.length - policy.maxEntries);
      for (const e of toEvict) {
        kv.setLifecycle(e.id, expireLifecycle);
        if (expireLifecycle === "evicted") {
          kv.delete(e.id);
        }
        evicted++;
      }
    }
    return { evicted, archived, total: all.length };
  }

  /** Determine which policy applies to a given scope. */
  _policyFor(scope: string): ScopePolicy | undefined {
    if (this.config.scopePolicies?.[scope]) return this.config.scopePolicies[scope];
    return this.config.defaultPolicy;
  }
}
