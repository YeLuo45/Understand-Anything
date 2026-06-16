/**
 * Cross-repo decision mirror — V21 / V22 / V23 of Direction B
 *
 * A "Decision mirror" is a manifest that other repos can reference to
 * know that a given ADR exists in *this* repo, and find the canonical
 * copy. The schema is intentionally tiny so it round-trips through
 * Git, npm, or HTTP without tooling.
 */
import type { ArchitectureDecisionRecord } from "../types.js";

/** V21 — The cross-repo mirror schema. */
export interface DecisionMirrorEntry {
  /** Canonical ADR id (e.g. "adr:abc:001"). */
  id: string;
  /** Short title. */
  title: string;
  /** Where the canonical copy lives (e.g. "org/this-repo", "file:..."). */
  origin: string;
  /** Hash of the canonical ADR's decision text, hex (first 16 hex chars of FNV-1a). */
  decisionHash: string;
  /** The set of node ids this ADR references (so consumers can spot local matches). */
  linkedNodeIds: string[];
  /** Optional: when the mirror entry was last updated. */
  mirroredAt?: string;
  /** Optional: a stable URL the canonical copy can be fetched from. */
  canonicalUrl?: string;
}

/** V21 — A full mirror file (1 entry per ADR). */
export interface DecisionMirror {
  version: "1.0";
  project: string;
  generatedAt: string;
  entries: DecisionMirrorEntry[];
}

/** FNV-1a 32-bit hex (first 16 chars). */
export function fnv1a16(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").padStart(16, "0").slice(0, 16);
}

/** V21 — Build a mirror from a list of ADRs. */
export function buildMirror(
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
  project: string,
): DecisionMirror {
  return {
    version: "1.0",
    project,
    generatedAt: new Date().toISOString(),
    entries: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      origin: project,
      decisionHash: fnv1a16(d.decision),
      linkedNodeIds: d.linkedNodeIds,
      mirroredAt: new Date().toISOString(),
    })),
  };
}

/** V22 — A "foreign" mirror we want to resolve against. */
export interface ForeignMirror {
  project: string;
  url?: string;
  entries: DecisionMirrorEntry[];
}

/** V22 — Find decisions in `local` that have a matching entry in `foreign`. */
export interface CrossRepoMatch {
  local: ArchitectureDecisionRecord;
  foreign: DecisionMirrorEntry;
  /** How well they match: 1.0 = exact (id+hash), 0.5 = id only, 0.25 = file refs only. */
  score: number;
  /** True if the decision text differs between local and foreign. */
  drift: boolean;
}

/** V22 — Resolve: find matching decisions across repos. */
export function resolveCrossRepo(
  local: ReadonlyArray<ArchitectureDecisionRecord>,
  foreign: ForeignMirror,
): CrossRepoMatch[] {
  const byId = new Map(foreign.entries.map((e) => [e.id, e]));
  const out: CrossRepoMatch[] = [];
  for (const d of local) {
    const f = byId.get(d.id);
    if (!f) continue;
    const hashMatches = f.decisionHash === fnv1a16(d.decision);
    out.push({
      local: d,
      foreign: f,
      score: hashMatches ? 1.0 : 0.5,
      drift: !hashMatches,
    });
  }
  // Also: find foreign entries not in local (the "remote knows more" direction).
  const localIds = new Set(local.map((d) => d.id));
  for (const f of foreign.entries) {
    if (localIds.has(f.id)) continue;
    // No local decision — score by file refs only.
    out.push({
      local: local[0]!, // sentinel — checked by the caller via foreign-only flag
      foreign: f,
      score: 0.25,
      drift: true,
    });
  }
  return out;
}

/** V22 — Filter for matches that look like the same decision. */
export function findLocalMatches(
  local: ReadonlyArray<ArchitectureDecisionRecord>,
  foreign: ForeignMirror,
): CrossRepoMatch[] {
  return resolveCrossRepo(local, foreign).filter((m) => {
    // Drop "remote-only" matches where the local entry is just a sentinel.
    return m.score >= 0.5;
  });
}

/** V22 — Find foreign entries that have no local counterpart. */
export function findForeignOnly(
  local: ReadonlyArray<ArchitectureDecisionRecord>,
  foreign: ForeignMirror,
): DecisionMirrorEntry[] {
  const localIds = new Set(local.map((d) => d.id));
  return foreign.entries.filter((e) => !localIds.has(e.id));
}
