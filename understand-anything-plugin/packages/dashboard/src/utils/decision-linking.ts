/**
 * Decision ↔ Code cross-node helpers — V16 Direction A
 *
 * Build reverse indexes so the dashboard can answer questions like:
 *   - "For this file node, which decisions touched it?"
 *   - "Which nodes does this decision affect?"
 *   - "Which decisions are dangling (point to non-existent nodes)?"
 */
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

/** Forward index: decision.id → linkedNodeIds[] (already on the record). */
export function decisionToNodes(
  decision: ArchitectureDecisionRecord,
): string[] {
  return decision.linkedNodeIds;
}

/**
 * Build the reverse index: nodeId → Decision[] that reference it.
 *
 * Performance note: O(N * M) where N = #decisions, M = avg #linkedNodeIds.
 * For our scale (< 1000 decisions, < 5 links each) this is fine; if a
 * project grows past that, switch to a Map<nodeId, Set<decisionId>> built
 * incrementally.
 */
export function buildNodeToDecisionsIndex(
  decisions: readonly ArchitectureDecisionRecord[],
): Map<string, ArchitectureDecisionRecord[]> {
  const out = new Map<string, ArchitectureDecisionRecord[]>();
  for (const d of decisions) {
    for (const nid of d.linkedNodeIds) {
      const arr = out.get(nid);
      if (arr) arr.push(d);
      else out.set(nid, [d]);
    }
  }
  return out;
}

/**
 * Given a graph node id and a reverse index, return the decisions that
 * reference it. Order is stable: the original decision order is preserved.
 */
export function decisionsForNode(
  nodeId: string,
  index: Map<string, ArchitectureDecisionRecord[]>,
): ArchitectureDecisionRecord[] {
  return index.get(nodeId) ?? [];
}

/**
 * Identify "dangling" decision references — decisions that point to
 * nodeIds that don't exist in the supplied `validNodeIds` set.
 *
 * Use this to surface cleanup warnings in the dashboard (e.g. "3 decisions
 * reference deleted files").
 */
export function findDanglingDecisions(
  decisions: readonly ArchitectureDecisionRecord[],
  validNodeIds: ReadonlySet<string>,
): Array<{ decision: ArchitectureDecisionRecord; dangling: string[] }> {
  const out: Array<{ decision: ArchitectureDecisionRecord; dangling: string[] }> = [];
  for (const d of decisions) {
    const dangling = d.linkedNodeIds.filter((nid) => !validNodeIds.has(nid));
    if (dangling.length > 0) out.push({ decision: d, dangling });
  }
  return out;
}

/**
 * Group decisions by source for a node — used by the WhyChain visualizer
 * to render sections like "1 git commit, 2 code comments, 1 LLM inference".
 */
export function groupDecisionsBySource(
  decisions: readonly ArchitectureDecisionRecord[],
): Map<string, ArchitectureDecisionRecord[]> {
  const out = new Map<string, ArchitectureDecisionRecord[]>();
  for (const d of decisions) {
    const arr = out.get(d.source);
    if (arr) arr.push(d);
    else out.set(d.source, [d]);
  }
  return out;
}
