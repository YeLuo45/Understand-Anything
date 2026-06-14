/**
 * Decision Extractor — V8 of Direction A "Why" persona
 *
 * Combines raw decision candidates from the git log (V6) and code comments
 * (V7) and turns each one into a fully-formed `ArchitectureDecisionRecord`
 * (from the schema in V1). Heuristic field-fill (no LLM):
 *   - title    ← first 80 chars of the commit / comment body
 *   - context  ← commit message body before any "Decision:" line, or empty
 *   - decision ← the bit after "Decision:" or the full body
 *   - status   ← "accepted" (we only see things that landed)
 *   - source   ← passed through from the candidate
 *   - tags     ← the matched keywords
 *
 * For richer fills (alternatives, consequences) use the LLM summarizer in V9.
 */
import type { ArchitectureDecisionRecord } from "../types.js";
import type { DecisionCandidate } from "./git-decision-scanner.js";

/** Options for `extractDecisions`. */
export interface ExtractDecisionsOptions {
  /** Project metadata. */
  project: {
    name: string;
    analyzedAt: string;
    gitCommitHash: string;
  };
  /** Override the auto-generated id prefix. Default: "adr". */
  idPrefix?: string;
  /** Hard cap on returned records (defensive). Default: 100. */
  maxRecords?: number;
}

/**
 * Build a stable, human-readable ADR id from a candidate. The id includes
 * a short hash of the source so re-runs are idempotent (no duplicate
 * decisions across incremental updates).
 */
function buildId(prefix: string, candidate: DecisionCandidate, index: number): string {
  const seed = candidate.commitHash
    ? `${candidate.source}:${candidate.commitHash}`
    : `${candidate.source}:${candidate.filesChanged.join(",")}:${candidate.title}`;
  // Simple deterministic short hash (FNV-1a 32-bit-ish).
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}:${h.toString(16).padStart(8, "0")}:${index.toString().padStart(3, "0")}`;
}

/** Split a commit body on the first `Decision:` / `Why:` line. */
function splitBody(body: string): { context: string; decision: string } {
  const lines = body.split(/\r?\n/);
  let cutAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (l.startsWith("decision:") || l.startsWith("why:") || l.startsWith("rationale:")) {
      cutAt = i;
      break;
    }
  }
  if (cutAt < 0) return { context: "", decision: body.trim() };
  return {
    context: lines.slice(0, cutAt).join("\n").trim(),
    decision: lines.slice(cutAt).join("\n").trim(),
  };
}

/** Tag severity — used as a proxy for ADR complexity. */
function inferComplexity(body: string): "simple" | "moderate" | "complex" {
  if (body.length > 600) return "complex";
  if (body.length > 200) return "moderate";
  return "simple";
}

/** Convert one candidate into one ADR. */
export function candidateToADR(
  candidate: DecisionCandidate,
  index: number,
  idPrefix = "adr",
): ArchitectureDecisionRecord {
  const { context, decision } = splitBody(candidate.body);
  return {
    id: buildId(idPrefix, candidate, index),
    title: candidate.title || decision.slice(0, 80) || `${candidate.source} decision`,
    status: "accepted",
    context,
    decision,
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: candidate.date ?? new Date().toISOString(),
    authorCommit: candidate.commitHash,
    source: candidate.source,
    tags: candidate.matchedKeywords,
    linkedNodeIds: candidate.filesChanged.map(
      (f) => `file:${f}`,
    ),
    complexity: inferComplexity(candidate.body),
  };
}

/** Convert a list of candidates into a list of ADRs. */
export function extractDecisions(
  candidates: DecisionCandidate[],
  options: ExtractDecisionsOptions,
): ArchitectureDecisionRecord[] {
  const max = options.maxRecords ?? 100;
  const prefix = options.idPrefix ?? "adr";
  // Stable order: oldest first, so the ADR list reads as a timeline.
  const sorted = [...candidates].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    return da.localeCompare(db);
  });
  return sorted.slice(0, max).map((c, i) => candidateToADR(c, i, prefix));
}
