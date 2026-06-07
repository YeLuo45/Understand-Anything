/**
 * Confidence Engine — score decay + access boost (V4/30)
 *
 * Confidence is a value in [0, 1] attached to every MemoryEntry.
 * This engine:
 *   - Decays confidence over time (configurable half-life)
 *   - Boosts confidence on access (logarithmic)
 *   - Clamps into [0, 1]
 */

export interface ConfidencePolicy {
  halfLifeDays: number;          // confidence × 0.5 every N days idle
  accessBoostBase: number;       // log(1 + N) × base boost
  minConfidence: number;         // floor for decay
  maxConfidence: number;         // ceiling for boost
}

export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = {
  halfLifeDays: 60,
  accessBoostBase: 0.05,
  minConfidence: 0.0,
  maxConfidence: 1.0,
};

export class ConfidenceEngine {
  policy: ConfidencePolicy;

  constructor(policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY) {
    this.policy = policy;
  }

  /**
   * Apply time-based decay to a confidence value.
   * Returns 0 if input is out of [0,1] or non-finite.
   */
  decay(current: number, idleDays: number): number {
    if (!Number.isFinite(current) || current < 0 || current > 1) return 0;
    if (idleDays <= 0) return current;
    const { halfLifeDays, minConfidence } = this.policy;
    const factor = Math.pow(0.5, idleDays / halfLifeDays);
    const decayed = current * factor;
    return Math.max(minConfidence, decayed);
  }

  /**
   * Apply access-based boost. Uses log curve so the Nth access adds
   * less than the first.
   */
  boost(current: number, accessCount: number): number {
    if (!Number.isFinite(current) || current < 0 || current > 1) return 0;
    const { accessBoostBase, maxConfidence } = this.policy;
    const increment = accessBoostBase * Math.log(1 + accessCount);
    return Math.min(maxConfidence, current + increment);
  }

  /**
   * Compute the effective confidence for a memory entry given an
   * idle period and a target number of additional accesses.
   */
  project(current: number, idleDays: number, futureAccesses: number): number {
    const d = this.decay(current, idleDays);
    return this.boost(d, futureAccesses);
  }

  /**
   * Compare two confidence values within a tolerance.
   * Used to support floating-point assertions in tests.
   */
  equals(a: number, b: number, epsilon = 1e-9): boolean {
    return Math.abs(a - b) < epsilon;
  }
}
