/**
 * Why Impact — V11 / V12 of Direction A R2
 *
 * Detects "stale" decisions: an ADR is stale when the files it
 * references have been modified AFTER the decision was made (i.e. the
 * decision may no longer reflect reality).
 *
 *   staleness = 0.0 → fresh, code still matches the decision
 *   staleness = 1.0 → very stale, code is likely unrecognisable
 *
 * The input is a simple "file change info" map (path → lastModified)
 * rather than the full FileFingerprint, to keep the surface area
 * minimal. Consumers can derive this from any source (git ls-files -m,
 * fs.stat, fingerprint store, …).
 */
import type { ArchitectureDecisionRecord } from "../types.js";

/** Per-file modification timestamp (epoch ms) for staleness comparison. */
export interface FileChangeInfo {
  /** Graph node id, e.g. "file:src/foo.ts". */
  nodeId: string;
  /** Last modification timestamp (epoch ms). */
  lastModified: number;
}

/** Staleness bucket boundaries (used for filtering / colour). */
export type StalenessBucket = "fresh" | "aging" | "stale" | "ancient";

/** Result of `scoreStaleness`. */
export interface StalenessScore {
  decisionId: string;
  /** 0..1, higher = more stale. */
  score: number;
  bucket: StalenessBucket;
  /** Reasons that contributed (for the UI tooltip). */
  reasons: string[];
  /** Number of linked files that have been modified after the decision. */
  driftedFiles: number;
  /** Total linked files. */
  totalFiles: number;
}

/** Map a numeric score to a human bucket. */
export function stalenessBucketFor(score: number): StalenessBucket {
  if (score < 0.25) return "fresh";
  if (score < 0.5) return "aging";
  if (score < 0.8) return "stale";
  return "ancient";
}

/**
 * V11 — Compute the staleness score for a single decision.
 *
 * Inputs:
 *  - decision: the ADR
 *  - changeInfoMap: Map<nodeId, FileChangeInfo> of CURRENT file state
 *  - now: epoch ms (defaults to Date.now(); injectable for tests)
 *
 * Scoring model:
 *   - For each linked file:
 *     - File missing from map → +0.5
 *     - File's lastModified is AFTER the decision's date → +0.3
 *     - Otherwise: no contribution
 *   - If the decision is older than 1 year, +0.1 (age decay)
 *   - Score is normalised by (n_linked + 0)
 */
export function scoreStaleness(
  decision: ArchitectureDecisionRecord,
  changeInfoMap: ReadonlyMap<string, FileChangeInfo>,
  now: number = Date.now(),
): StalenessScore {
  const reasons: string[] = [];
  let drift = 0;
  let driftedFiles = 0;
  const totalFiles = decision.linkedNodeIds.length;
  const decisionMs = new Date(decision.date).getTime();
  for (const nid of decision.linkedNodeIds) {
    const info = changeInfoMap.get(nid);
    if (!info) {
      drift += 0.5;
      driftedFiles++;
      reasons.push(`Linked file no longer exists: ${nid}`);
      continue;
    }
    if (info.lastModified > decisionMs) {
      drift += 0.3;
      driftedFiles++;
      reasons.push(`File modified after decision: ${nid}`);
    }
  }
  // Time decay: a decision older than 1 year is a little more stale.
  const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;
  const ageMs = now - decisionMs;
  if (ageMs > ONE_YEAR_MS) {
    drift += 0.1;
    reasons.push(`Decision is older than 1 year (age: ${Math.round(ageMs / ONE_YEAR_MS * 10) / 10}y)`);
  }
  // Normalise by the number of linked files. The "+1" cap means a
  // single missing file (drift=0.5) lands at 0.5, crossing the stale
  // threshold (>0.5). Multi-file decisions average out.
  const denom = Math.max(1, totalFiles) + 0;
  const score = Math.min(1, drift / denom);
  return {
    decisionId: decision.id,
    score,
    bucket: stalenessBucketFor(score),
    reasons,
    driftedFiles,
    totalFiles,
  };
}

/**
 * V12 — Score many decisions at once, sorted by score descending.
 * `changeInfoMap` is keyed by graph node id (`"file:src/foo.ts"`).
 */
export function scoreAllStaleness(
  decisions: readonly ArchitectureDecisionRecord[],
  changeInfoMap: ReadonlyMap<string, FileChangeInfo>,
  now?: number,
): StalenessScore[] {
  return decisions
    .map((d) => scoreStaleness(d, changeInfoMap, now))
    .sort((a, b) => b.score - a.score);
}

/** True if the decision's staleness is in the "stale" or "ancient" bucket. */
export function isStaleScore(score: StalenessScore): boolean {
  return score.bucket === "stale" || score.bucket === "ancient";
}

/**
 * V12 — Convenience: drop decisions that are fresh and return only the
 * stale ones, in score-descending order.
 */
export function filterStale(
  decisions: readonly ArchitectureDecisionRecord[],
  changeInfoMap: ReadonlyMap<string, FileChangeInfo>,
  now?: number,
): Array<{ decision: ArchitectureDecisionRecord; score: StalenessScore }> {
  return scoreAllStaleness(decisions, changeInfoMap, now)
    .filter(isStaleScore)
    .map((score) => {
      const decision = decisions.find((d) => d.id === score.decisionId);
      return { decision: decision!, score };
    })
    .filter((x) => x.decision);
}
