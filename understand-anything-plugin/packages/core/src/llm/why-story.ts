/**
 * Why Story generator — V6 / V7 / V8 of Direction A R2
 *
 * A "Why Story" is a 1-paragraph, 1st-person, plain-English retelling of
 * an Architecture Decision Record, plus 3 bulleted takeaways. It's the
 * single most useful piece of UX in the Why persona: it lets a new
 * developer get the gist of a decision in 30 seconds.
 *
 * Architecture:
 *   - V6 — buildWhyStoryPrompt() emits the system + user prompt pair
 *   - V7 — parseWhyStory() + mergeWhyStory() round-trip LLM output
 *   - V8 — WhyStoryCache (FNV-1a → story) prevents repeat LLM calls
 */
import type { ArchitectureDecisionRecord } from "../types.js";
import {
  chatWithRetry,
  generateStructured,
  type LLMProvider,
  type ChatMessage,
} from "../llm/llm-client.js";
import { z } from "zod";

/** A "Why Story" — short, human-friendly ADR retelling. */
export interface WhyStory {
  /** 1 short paragraph (≤ 280 chars), written in 1st-person past tense. */
  story: string;
  /** 3 short bullets that capture the key takeaways. */
  takeaways: string[];
  /** Tags from the LLM (e.g. "tradeoff", "migration", "performance"). */
  tags: string[];
}

/** FNV-1a 32-bit hash, returned as a hex string. */
function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Sync FNV-1a-based cache key (32 bits is enough to avoid collisions in-process). */
function cacheKeyFor(decision: ArchitectureDecisionRecord, language: string): string {
  return fnv1a32(decision.id + "|" + decision.title + "|" + decision.decision + "|" + language);
}

/**
 * Build the LLM prompt that turns an ADR into a Why Story.
 * V6 contract: 1 paragraph (≤ 280 chars) + 3 bullets.
 */
export function buildWhyStoryPrompt(
  decision: ArchitectureDecisionRecord,
  language = "en",
): { system: string; user: string; cacheKey: string } {
  // cacheKey is a stable FNV-1a 8-char hex. Same fn is used by
  // WhyStoryCache.keyFor so the two stay in sync.
  const cacheKey = cacheKeyFor(decision, language);
  const system =
    `You are a senior engineer explaining an architecture decision to a new ` +
    `teammate. Be terse, vivid, and concrete. Output language: ${language}.`;
  const user =
    `Decision: ${decision.title}\n\n` +
    `Output language: ${language}\n\n` +
    `Context:\n${decision.context || "(none)"}\n\n` +
    `What was decided:\n${decision.decision}\n\n` +
    `Positive consequences:\n` +
    (decision.consequences.positive.length
      ? decision.consequences.positive.map((c) => `+ ${c}`).join("\n")
      : "+ (none recorded)") +
    `\n\nNegative consequences:\n` +
    (decision.consequences.negative.length
      ? decision.consequences.negative.map((c) => `- ${c}`).join("\n")
      : "- (none recorded)") +
    `\n\nAlternatives considered:\n` +
    (decision.alternatives.length
      ? decision.alternatives
          .map((a) => `• ${a.name} — rejected because ${a.whyRejected}`)
          .join("\n")
      : "(none recorded)") +
    `\n\nWrite a STRICT JSON object with this exact shape:\n` +
    JSON.stringify(
      {
        story: "string (≤ 280 chars, 1st-person, present/past tense)",
        takeaways: ["string", "string", "string"],
        tags: ["string"],
      },
      null,
      2,
    );
  return { system, user, cacheKey };
}

/** Zod schema for validating a Why Story returned by the LLM. */
export const WhyStorySchema = z.object({
  story: z.string().min(1).max(2000),
  takeaways: z.array(z.string()).min(1).max(10),
  tags: z.array(z.string()).max(10),
});

/**
 * V7 — Parse a raw LLM string into a Why Story.
 * Strips ```json fences, falls back to null on parse error.
 */
export function parseWhyStory(raw: string): WhyStory | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const result = WhyStorySchema.safeParse(obj);
  if (!result.success) return null;
  const data = result.data;
  const takeaways = data.takeaways.map((t) => t.trim()).filter((t) => t.length > 0);
  const tags = data.tags.map((t) => t.trim()).filter((t) => t.length > 0);
  return { story: data.story.trim(), takeaways, tags };
}

/**
 * V7 — Merge a Why Story into an ADR.
 * Stores the story in `tags` as a structured token: "__story:<json>" so it
 * round-trips without adding a new field to the schema.
 */
export function mergeWhyStory(
  decision: ArchitectureDecisionRecord,
  story: WhyStory,
): ArchitectureDecisionRecord {
  const payload = JSON.stringify(story);
  const token = `__story:${payload}`;
  const baseTags = decision.tags.filter((t) => !t.startsWith("__story:"));
  return {
    ...decision,
    tags: [...baseTags, token, ...story.tags],
  };
}

/** Extract a story from a merged ADR (if one was previously embedded). */
export function extractWhyStory(decision: ArchitectureDecisionRecord): WhyStory | null {
  const tag = decision.tags.find((t) => t.startsWith("__story:"));
  if (!tag) return null;
  try {
    const json = tag.slice("__story:".length);
    const parsed = JSON.parse(json) as WhyStory;
    if (!parsed.story || !Array.isArray(parsed.takeaways)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * V8 — In-memory cache of WhyStory keyed by FNV-1a(decision + language).
 * Persistent cache would belong in a Vite middleware or a separate
 * IndexedDB layer; for V8 we only need the in-process shape.
 */
export class WhyStoryCache {
  private readonly map = new Map<string, { story: WhyStory; at: number }>();

  /** Build the cache key for a given decision + language. */
  static keyFor(decision: ArchitectureDecisionRecord, language: string): string {
    return cacheKeyFor(decision, language);
  }

  get(decision: ArchitectureDecisionRecord, language: string): WhyStory | null {
    const key = WhyStoryCache.keyFor(decision, language);
    return this.map.get(key)?.story ?? null;
  }

  set(decision: ArchitectureDecisionRecord, language: string, story: WhyStory): void {
    const key = WhyStoryCache.keyFor(decision, language);
    this.map.set(key, { story, at: Date.now() });
  }

  has(decision: ArchitectureDecisionRecord, language: string): boolean {
    const key = WhyStoryCache.keyFor(decision, language);
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

/**
 * High-level: generate a Why Story for a decision. Uses the cache when
 * available, otherwise calls the LLM via `chatWithRetry` (free-form
 * response, NOT generateStructured, so we can recover from partial JSON).
 */
export async function generateWhyStory(
  provider: LLMProvider,
  decision: ArchitectureDecisionRecord,
  options?: { language?: string; cache?: WhyStoryCache; model?: string },
): Promise<WhyStory> {
  const language = options?.language ?? "en";
  const cache = options?.cache;
  if (cache) {
    const hit = cache.get(decision, language);
    if (hit) return hit;
  }
  const { system, user } = buildWhyStoryPrompt(decision, language);
  try {
    const result = await generateStructured(
      provider,
      WhyStorySchema,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model: options?.model },
    );
    const story: WhyStory = {
      story: result.story.trim(),
      takeaways: result.takeaways.map((t) => t.trim()).filter((t) => t.length > 0),
      tags: result.tags.map((t) => t.trim()).filter((t) => t.length > 0),
    };
    if (cache) cache.set(decision, language, story);
    return story;
  } catch {
    // Fallback: free-form chat → manual parse. If the second attempt
    // also fails, return a stub so callers always get a Why Story shape.
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    let parsed: WhyStory | null = null;
    try {
      const reply = await chatWithRetry(provider, messages, { model: options?.model });
      parsed = parseWhyStory(reply.content);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return {
        story: `${decision.title}. ${decision.decision.slice(0, 240)}`,
        takeaways: [decision.decision.slice(0, 200)],
        tags: ["fallback"],
      };
    }
    if (cache) cache.set(decision, language, parsed);
    return parsed;
  }
}
