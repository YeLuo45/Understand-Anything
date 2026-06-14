/**
 * LLM Decision Summarizer — V9 of Direction A "Why" persona
 *
 * Heuristic extraction (V8) leaves `consequences.positive/negative` and
 * `alternatives[]` empty for most candidates. This module defines the
 * prompt template + JSON response schema that an LLM agent can call to
 * fill those fields in. The actual LLM call is implemented in V24
 * (the `/understand-decisions` pipeline); V9 ships only the prompt +
 * parser so the rest of the system can be wired today.
 */
import type { ArchitectureDecisionRecord } from "../types.js";

/** Input the LLM receives per ADR. */
export interface LLMSummarizeInput {
  /** The partially-filled ADR from V8. */
  partial: ArchitectureDecisionRecord;
  /** Optional: the commit body (richer context) for non-LLM-derived fields. */
  rawBody?: string;
  /** Optional: related files that the LLM should consider as "alternatives touched". */
  relatedFiles?: string[];
}

/** Output the LLM is expected to return (validated by Zod in V25). */
export interface LLMSummarizeOutput {
  /** Better decision statement (one or two sentences). */
  decision: string;
  /** Bulleted list of positive consequences. */
  positive: string[];
  /** Bulleted list of negative consequences. */
  negative: string[];
  /** Alternatives considered, with rejection reasons. */
  alternatives: Array<{
    name: string;
    whyRejected: string;
  }>;
  /** Optional tradeoff score in [0, 1]. 0.5 = neutral. */
  tradeoffScore?: number;
}

/**
 * Build the system + user prompt pair. The LLM is asked to return strict
 * JSON that the caller validates against `LLMSummarizeOutput` before
 * merging into the partial ADR.
 */
export function buildSummarizePrompt(input: LLMSummarizeInput): {
  system: string;
  user: string;
} {
  const system = `You are an expert software architect enriching an Architecture Decision Record (ADR).

You will receive a partial ADR with: id, title, context, decision, source, files touched.
Your job: produce a STRICT JSON object with these fields:
  - "decision":   one-or-two-sentence restatement of the decision
  - "positive":   string[] of 1-5 positive consequences
  - "negative":   string[] of 1-5 negative consequences (be honest!)
  - "alternatives": array of { "name": string, "whyRejected": string }
  - "tradeoffScore": number in [0, 1], optional

Rules:
  - Be terse. Each bullet ≤ 80 chars.
  - If you don't know a field, return [] or omit it. Do NOT invent tradeoffs.
  - Output JSON only, no markdown fences, no commentary.`;

  const user = JSON.stringify(
    {
      id: input.partial.id,
      title: input.partial.title,
      context: input.partial.context || "(none)",
      decision: input.partial.decision,
      source: input.partial.source,
      files: input.partial.linkedNodeIds,
      relatedFiles: input.relatedFiles ?? [],
      rawBody: input.rawBody ?? "",
    },
    null,
    2,
  );

  return { system, user };
}

/** Parse a raw LLM string into LLMSummarizeOutput, returning null on failure. */
export function parseSummarizeResponse(raw: string): LLMSummarizeOutput | null {
  // Strip ```json fences if present, then try the strictest parse.
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof obj.decision !== "string") return null;
    if (!Array.isArray(obj.positive) && obj.positive !== undefined) return null;
    if (!Array.isArray(obj.negative) && obj.negative !== undefined) return null;
    const positive = Array.isArray(obj.positive)
      ? obj.positive.filter((x): x is string => typeof x === "string")
      : [];
    const negative = Array.isArray(obj.negative)
      ? obj.negative.filter((x): x is string => typeof x === "string")
      : [];
    const alts = Array.isArray(obj.alternatives)
      ? (obj.alternatives as Array<Record<string, unknown>>)
          .map((a) => ({
            name: typeof a.name === "string" ? a.name : "",
            whyRejected:
              typeof a.whyRejected === "string" ? a.whyRejected : "",
          }))
          .filter((a) => a.name.length > 0)
      : [];
    let tradeoffScore: number | undefined;
    if (typeof obj.tradeoffScore === "number" && obj.tradeoffScore >= 0 && obj.tradeoffScore <= 1) {
      tradeoffScore = obj.tradeoffScore;
    }
    return {
      decision: obj.decision,
      positive,
      negative,
      alternatives: alts,
      tradeoffScore,
    };
  } catch {
    return null;
  }
}

/** Merge a `LLMSummarizeOutput` back into a partial ADR. */
export function mergeSummarize(
  partial: ArchitectureDecisionRecord,
  enrichment: LLMSummarizeOutput,
): ArchitectureDecisionRecord {
  return {
    ...partial,
    decision: enrichment.decision || partial.decision,
    consequences: {
      positive: enrichment.positive,
      negative: enrichment.negative,
    },
    alternatives: enrichment.alternatives.map((a) => ({
      name: a.name,
      whyRejected: a.whyRejected,
      pros: [],
      cons: [],
    })),
    tradeoffScore: enrichment.tradeoffScore,
  };
}
