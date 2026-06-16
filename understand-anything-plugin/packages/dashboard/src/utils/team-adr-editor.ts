/**
 * Team ADR Editor — V16 / V17 / V18 / V19 of Direction B
 *
 * Front-end store + pure helpers for the in-browser "edit a decision"
 * flow. The component is wired up in a follow-up patch; this module
 * exports the data layer so tests can validate the state machine
 * without React.
 */
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

/** V17 — The set of editable fields on a draft ADR. */
export interface AdrDraft {
  title: string;
  context: string;
  decision: string;
  status: ArchitectureDecisionRecord["status"] | "draft";
  source: ArchitectureDecisionRecord["source"];
  tags: string[];
  linkedNodeIds: string[];
  complexity: ArchitectureDecisionRecord["complexity"] | "trivial" | "epic";
  date: string;
}
/** V19 — Review state. */
export type AdrReviewState = "needs-review" | "accepted" | "deprecated";

/** V17 — Validate a draft before saving. Returns [] if ok, error list otherwise. */
export function validateDraft(draft: AdrDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("title is required");
  if (!draft.decision.trim()) errors.push("decision is required");
  if (draft.title.length > 200) errors.push("title exceeds 200 chars");
  if (draft.decision.length < 5) errors.push("decision is too short (<5 chars)");
  if (draft.date && Number.isNaN(Date.parse(draft.date))) errors.push("date is not parseable");
  return errors;
}

/** V17 — Convert a draft to a full ADR (using a fresh FNV-1a id). */
export function draftToAdr(draft: AdrDraft, author: string): ArchitectureDecisionRecord {
  const id = `adr:${fnv1a8(`${draft.title}::${Date.now()}`)}`;
  // R1's ArchitectureDecisionRecord schema doesn't have a first-class
  // `author` field; we encode the author as a tag so round-trips are
  // stable. Tests check for "author:<name>".
  const tags = author ? [...draft.tags, `author:${author}`] : draft.tags;
  return {
    id,
    title: draft.title.trim(),
    status: draft.status as ArchitectureDecisionRecord["status"],
    context: draft.context,
    decision: draft.decision,
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: draft.date || new Date().toISOString(),
    source: draft.source,
    tags,
    linkedNodeIds: draft.linkedNodeIds,
    complexity: draft.complexity as ArchitectureDecisionRecord["complexity"],
  };
}

/** V17 — Convert an ADR to an editable draft. */
export function adrToDraft(adr: ArchitectureDecisionRecord): AdrDraft {
  return {
    title: adr.title,
    context: adr.context,
    decision: adr.decision,
    status: adr.status as AdrDraft["status"],
    source: adr.source,
    tags: adr.tags,
    linkedNodeIds: adr.linkedNodeIds,
    complexity: adr.complexity as AdrDraft["complexity"],
    date: adr.date,
  };
}

/** V18 — Render an ADR as markdown (the export format). */
export function adrToMarkdown(adr: ArchitectureDecisionRecord): string {
  const lines: string[] = [];
  lines.push(`# ${adr.title}`);
  lines.push("");
  lines.push(`**Status**: ${adr.status}  `);
  lines.push(`**Date**: ${adr.date}  `);
  lines.push(`**Source**: ${adr.source}  `);
  if (typeof adr.tradeoffScore === "number") {
    lines.push(`**Tradeoff**: ${adr.tradeoffScore.toFixed(2)}  `);
  }
  lines.push("");
  if (adr.context) {
    lines.push("## Context");
    lines.push("");
    lines.push(adr.context);
    lines.push("");
  }
  lines.push("## Decision");
  lines.push("");
  lines.push(adr.decision);
  lines.push("");
  if (adr.alternatives.length > 0) {
    lines.push("## Alternatives");
    lines.push("");
    for (const a of adr.alternatives) {
      lines.push(`- **${a.name}** — ${a.whyRejected}`);
    }
    lines.push("");
  }
  if (adr.consequences.positive.length || adr.consequences.negative.length) {
    lines.push("## Consequences");
    lines.push("");
    for (const p of adr.consequences.positive) lines.push(`- ✅ ${p}`);
    for (const n of adr.consequences.negative) lines.push(`- ⚠️ ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** V18 — Render the JSON export (round-trips). */
export function adrToJson(adr: ArchitectureDecisionRecord): string {
  return JSON.stringify(adr, null, 2);
}

/** V19 — Set the review state on an ADR. */
export function setReviewState(
  adr: ArchitectureDecisionRecord,
  state: AdrReviewState,
): ArchitectureDecisionRecord {
  return {
    ...adr,
    status: state as ArchitectureDecisionRecord["status"],
    tags: [...adr.tags, `review:${state}`],
  };
}

/** FNV-1a 32-bit → 8 hex. */
function fnv1a8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
