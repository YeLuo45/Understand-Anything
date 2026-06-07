/**
 * MemoryLifecycle Engine — state machine + transition orchestration (V3/30)
 *
 * Builds on schema.ts: wraps the transition rules with bulk operations,
 * a transition log, and a default "stale-after-N-days" policy.
 */

import { canTransition, type MemoryLifecycle } from "./schema.js";

export type TransitionReason =
  | "manual"
  | "auto-stale"
  | "auto-evict"
  | "crystallize"
  | "recall"
  | "retention-policy";

export interface TransitionRecord {
  from: MemoryLifecycle;
  to: MemoryLifecycle;
  reason: TransitionReason;
  ts: string;
  actor?: string;
}

export interface LifecyclePolicy {
  staleAfterDays: number;        // active → stale after N days idle
  evictAfterDays: number;        // stale → evicted after N days idle
}

export const DEFAULT_POLICY: LifecyclePolicy = {
  staleAfterDays: 30,
  evictAfterDays: 90,
};

export class LifecycleEngine {
  private history: TransitionRecord[] = [];
  private now: () => string;
  policy: LifecyclePolicy;

  constructor(policy: LifecyclePolicy = DEFAULT_POLICY, now: () => string = () => new Date().toISOString()) {
    this.policy = policy;
    this.now = now;
  }

  canApply(from: MemoryLifecycle, to: MemoryLifecycle): boolean {
    return canTransition(from, to);
  }

  /**
   * Apply a transition. Throws on illegal transition.
   * Records the transition in the log regardless of origin.
   */
  apply(
    from: MemoryLifecycle,
    to: MemoryLifecycle,
    reason: TransitionReason,
    actor?: string,
  ): TransitionRecord {
    if (!canTransition(from, to)) {
      throw new Error(`Illegal lifecycle transition: ${from} → ${to}`);
    }
    const rec: TransitionRecord = { from, to, reason, ts: this.now(), actor };
    this.history.push(rec);
    return rec;
  }

  /**
   * Compute the suggested next lifecycle given an entry's last-accessed
   * timestamp and current lifecycle. Pure function — does NOT mutate.
   */
  suggest(
    current: MemoryLifecycle,
    lastAccessedAt: string,
  ): MemoryLifecycle {
    if (current === "consolidated" || current === "archived" || current === "evicted") {
      return current;
    }
    const idleDays = (Date.now() - new Date(lastAccessedAt).getTime()) / 86_400_000;
    if (current === "stale" && idleDays >= this.policy.evictAfterDays) return "evicted";
    if (current === "active" && idleDays >= this.policy.staleAfterDays) return "stale";
    return current;
  }

  history_(): readonly TransitionRecord[] {
    return [...this.history];
  }

  reset(): void {
    this.history = [];
  }
}
