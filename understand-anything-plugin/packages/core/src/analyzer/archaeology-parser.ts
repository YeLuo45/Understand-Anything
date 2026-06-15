/**
 * Archaeology parser — V2 of Direction B
 *
 * Turns `ArchaeologyCandidate` records (from V1) into full
 * `ArchitectureDecisionRecord` ADR drafts. The conversion is
 * heuristic-only (no LLM) so the V4 CLI can produce ADR candidates
 * offline.
 */
import type { ArchitectureDecisionRecord } from "../types.js";
import type { ArchaeologyCandidate } from "./archaeology-scanner.js";

/** Options for `parseCandidate`. */
export interface ParseCandidateOptions {
  /** Project name. Default: "unknown". */
  projectName?: string;
  /** ISO 8601 timestamp; defaults to the candidate's commit date. */
  analyzedAt?: string;
  /** Override id prefix. Default: "adr-arch". */
  idPrefix?: string;
}

/** Build a stable id from the commit hash + 0-based index in the source. */
function buildId(
  prefix: string,
  candidate: ArchaeologyCandidate,
): string {
  // FNV-1a 32-bit on (commitHash + title)
  let h = 0x811c9dc5;
  const seed = `${candidate.commitHash}::${candidate.title}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}:${h.toString(16).padStart(8, "0")}`;
}

/** Split a commit message body into a context / decision pair. */
export function splitBodyOnDecision(body: string): {
  context: string;
  decision: string;
} {
  const lines = body.split(/\r?\n/);
  let cutAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.toLowerCase();
    if (
      l.startsWith("decision:") ||
      l.startsWith("why:") ||
      l.startsWith("rationale:") ||
      l.startsWith("because") ||
      l.startsWith("chosen:") ||
      l.startsWith("chose ")
    ) {
      cutAt = i;
      break;
    }
  }
  if (cutAt < 0) {
    return { context: "", decision: body.trim() };
  }
  return {
    context: lines.slice(0, cutAt).join("\n").trim(),
    decision: lines.slice(cutAt).join("\n").trim(),
  };
}

/**
 * Extract "alternatives" from a commit body when the commit message
 * explicitly mentions them (e.g. "Chose X over Y" or "X instead of Y").
 * Returns an empty array if no clear signal is found.
 */
export function extractAlternativesFromBody(
  body: string,
): ArchitectureDecisionRecord["alternatives"] {
  const alts: ArchitectureDecisionRecord["alternatives"] = [];
  // Pattern: "chose X over Y" / "choose X over Y" — Y is a short
  // noun phrase (1-3 word chars). The optional `(?:and|or)\s+over\s+`
  // at the END lets us chain "X over Y, and over Z" forms.
  const choseOverRe = /\b(?:chose|choose|chose to use|choosing)\s+([^\s]+(?:\s+[^\s]+){0,3}?)\s+over\s+([\w./-]+(?:\s+[\w./-]+){0,2}?)(?:,?\s+(?:and|or)\s+over\s+([\w./-]+(?:\s+[\w./-]+){0,2}?))*(?=[\s,.;:]|$)/gi;
  for (const m of body.matchAll(choseOverRe)) {
    // m[2] is the first alternative; m[3] (if defined) is the chained
    // "and over X" / "or over X" alternative. Collect both.
    for (let i = 2; i <= 3; i++) {
      const name = (m[i] ?? "").trim().replace(/[,.;]$/, "");
      if (!name) continue;
      // Skip pure numbers ("over 100 files") only. Single-letter
      // alternatives like "B" / "X" are valid ("chose A over B").
      if (/^\d+$/.test(name)) continue;
      alts.push({ name, whyRejected: "Not chosen (see commit message)", pros: [], cons: [] });
    }
  }
  // Pattern: "X instead of Y"
  const insteadOfRe = /\binstead of\s+([^\n.]+)/gi;
  for (const m of body.matchAll(insteadOfRe)) {
    const name = (m[1] ?? "").trim().replace(/[,.;]$/, "");
    if (!name) continue;
    alts.push({ name, whyRejected: "Replaced (see commit message)", pros: [], cons: [] });
  }
  return alts;
}

/**
 * Convert a single candidate into a partial ADR draft. The result has
 * empty `consequences` (no LLM in V2) and a minimal `alternatives` array
 * if the body contained "X over Y" / "X instead of Y" markers.
 */
export function parseCandidate(
  candidate: ArchaeologyCandidate,
  index: number,
  options: ParseCandidateOptions = {},
): ArchitectureDecisionRecord {
  const idPrefix = options.idPrefix ?? "adr-arch";
  const { context, decision } = splitBodyOnDecision(candidate.body);
  const alternatives = extractAlternativesFromBody(candidate.body);
  return {
    id: buildId(idPrefix, candidate),
    title: stripPrefix(candidate.title),
    status: "accepted",
    context: context || "(recovered from git history; no explicit context)",
    decision: decision || candidate.body,
    consequences: { positive: [], negative: [] },
    alternatives,
    date: candidate.date,
    authorCommit: candidate.commitHash,
    source: "git-commit",
    tags: ["archaeology", ...candidate.matchedPrefixes],
    linkedNodeIds: candidate.filesChanged.map((f) => `file:${f}`),
    complexity: candidate.body.length > 600 ? "complex" : candidate.body.length > 200 ? "moderate" : "simple",
  };
  void index;
}

/** Strip a recognised ADR prefix from a title for cleaner display. */
function stripPrefix(title: string): string {
  for (const { pattern, label } of ADR_PREFIXES) {
    if (pattern.test(title)) {
      return title.replace(pattern, "").trim();
    }
    void label;
  }
  return title.trim();
}

// Re-export the prefix list from the scanner to keep this module
// self-contained for ADR consumers.
import { ADR_PREFIXES } from "./archaeology-scanner.js";

/** Convert many candidates at once. */
export function parseCandidates(
  candidates: ReadonlyArray<ArchaeologyCandidate>,
  options: ParseCandidateOptions = {},
): ArchitectureDecisionRecord[] {
  return candidates.map((c, i) => parseCandidate(c, i, options));
}
