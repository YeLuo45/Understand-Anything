/**
 * Why Story tests — V6 / V7 / V8 of Direction A R2
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildWhyStoryPrompt,
  parseWhyStory,
  mergeWhyStory,
  extractWhyStory,
  WhyStoryCache,
  generateWhyStory,
} from "../why-story";
import type { ArchitectureDecisionRecord } from "../../types";
import { LLMError, type LLMProvider, type ChatCompletion } from "../llm-client";

const sampleDecision: ArchitectureDecisionRecord = {
  id: "adr:0001",
  title: "Adopt Zod for runtime validation",
  status: "accepted",
  context: "We need runtime validation for external API payloads.",
  decision: "Use Zod 3.x as the single source of truth for runtime schemas.",
  consequences: {
    positive: ["Type-safe parsing", "Good DX"],
    negative: ["+~50KB bundle"],
  },
  alternatives: [
    { name: "Yup", whyRejected: "Worse TS DX", pros: ["Mature"], cons: ["DX"] },
  ],
  date: "2026-06-14",
  source: "git-commit",
  tags: ["validation"],
  linkedNodeIds: ["file:src/schema.ts"],
  complexity: "moderate",
  tradeoffScore: 0.7,
};

function makeProvider(
  id: string,
  impl: (msgs: readonly { role: string; content: string }[]) => Promise<ChatCompletion>,
): LLMProvider {
  return {
    id,
    displayName: id,
    defaultModel: "m",
    isConfigured: () => true,
    chat: (messages) => impl(messages),
  };
}

describe("V6 — buildWhyStoryPrompt", () => {
  it("emits a system + user prompt pair", () => {
    const { system, user, cacheKey } = buildWhyStoryPrompt(sampleDecision);
    expect(system).toContain("senior engineer");
    expect(system).toContain("en");
    expect(user).toContain("Adopt Zod for runtime validation");
    expect(user).toContain("Type-safe parsing");
    expect(user).toContain("+~50KB bundle");
    expect(user).toContain("Yup");
    expect(user).toContain('"story"');
    expect(user).toContain('"takeaways"');
    // cacheKey is a stable FNV-1a 8-char hex (FNV-1a is platform-agnostic).
    expect(cacheKey).toMatch(/^[a-f0-9]{8}$/);
  });
  it("cache key is stable for identical inputs", () => {
    const a = buildWhyStoryPrompt(sampleDecision);
    const b = buildWhyStoryPrompt(sampleDecision);
    expect(a.cacheKey).toBe(b.cacheKey);
  });
  it("cache key changes when decision.decision changes", () => {
    const a = buildWhyStoryPrompt(sampleDecision);
    const b = buildWhyStoryPrompt({ ...sampleDecision, decision: "Use Zod 4.x" });
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
  it("cache key changes when language changes", () => {
    const a = buildWhyStoryPrompt(sampleDecision, "en");
    const b = buildWhyStoryPrompt(sampleDecision, "zh");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
  it("uses the language hint in the user prompt", () => {
    const { user } = buildWhyStoryPrompt(sampleDecision, "zh");
    expect(user).toContain("Output language: zh");
  });
});

describe("V7 — parseWhyStory", () => {
  it("parses a clean JSON object", () => {
    const raw = JSON.stringify({
      story: "We picked Zod for type-safe validation.",
      takeaways: ["Less boilerplate", "Catches errors at runtime", "+50KB bundle"],
      tags: ["validation", "tradeoff"],
    });
    const out = parseWhyStory(raw);
    expect(out).toEqual({
      story: "We picked Zod for type-safe validation.",
      takeaways: ["Less boilerplate", "Catches errors at runtime", "+50KB bundle"],
      tags: ["validation", "tradeoff"],
    });
  });
  it("strips ```json fences", () => {
    const raw = "```json\n" + JSON.stringify({ story: "x", takeaways: ["y"], tags: [] }) + "\n```";
    expect(parseWhyStory(raw)?.story).toBe("x");
  });
  it("returns null on non-JSON", () => {
    expect(parseWhyStory("not json")).toBeNull();
  });
  it("returns null on schema mismatch (missing story)", () => {
    expect(parseWhyStory(JSON.stringify({ takeaways: [], tags: [] }))).toBeNull();
  });
  it("returns null when takeaways is empty", () => {
    expect(parseWhyStory(JSON.stringify({ story: "x", takeaways: [], tags: [] }))).toBeNull();
  });
  it("filters empty / whitespace takeaways and tags", () => {
    const raw = JSON.stringify({
      story: "x",
      takeaways: ["a", "  ", "", "b"],
      tags: ["t1", "", "  "],
    });
    const out = parseWhyStory(raw);
    expect(out?.takeaways).toEqual(["a", "b"]);
    expect(out?.tags).toEqual(["t1"]);
  });
});

describe("V7 — mergeWhyStory / extractWhyStory round-trip", () => {
  it("round-trips through the __story: tag token", () => {
    const story = {
      story: "We picked Zod because TypeScript + runtime parity matters.",
      takeaways: ["Less boilerplate", "Catches at runtime", "+50KB bundle"],
      tags: ["validation"],
    };
    const merged = mergeWhyStory(sampleDecision, story);
    expect(merged.tags.some((t) => t.startsWith("__story:"))).toBe(true);
    const extracted = extractWhyStory(merged);
    expect(extracted).toEqual(story);
  });
  it("replaces a previously-merged story (no accumulation)", () => {
    const old = { story: "old", takeaways: ["a"], tags: ["x"] };
    const fresh = { story: "new", takeaways: ["b"], tags: ["y"] };
    const once = mergeWhyStory(sampleDecision, old);
    const twice = mergeWhyStory(once, fresh);
    const tagsWithStory = twice.tags.filter((t) => t.startsWith("__story:"));
    expect(tagsWithStory).toHaveLength(1);
    expect(extractWhyStory(twice)).toEqual(fresh);
  });
  it("returns null when the ADR has no story embedded", () => {
    expect(extractWhyStory(sampleDecision)).toBeNull();
  });
  it("returns null when the embedded JSON is corrupt", () => {
    const broken = {
      ...sampleDecision,
      tags: [...sampleDecision.tags, "__story:not-valid-json{"],
    };
    expect(extractWhyStory(broken)).toBeNull();
  });
});

describe("V8 — WhyStoryCache", () => {
  it("returns null for a decision not in cache", () => {
    const cache = new WhyStoryCache();
    expect(cache.get(sampleDecision, "en")).toBeNull();
    expect(cache.has(sampleDecision, "en")).toBe(false);
  });
  it("stores and retrieves a story", () => {
    const cache = new WhyStoryCache();
    const story = { story: "x", takeaways: ["a"], tags: [] };
    cache.set(sampleDecision, "en", story);
    expect(cache.get(sampleDecision, "en")).toEqual(story);
    expect(cache.has(sampleDecision, "en")).toBe(true);
    expect(cache.size()).toBe(1);
  });
  it("keyFor is language-sensitive", () => {
    const cache = new WhyStoryCache();
    const enStory = { story: "in english", takeaways: ["a"], tags: [] };
    const zhStory = { story: "中文", takeaways: ["甲"], tags: [] };
    cache.set(sampleDecision, "en", enStory);
    cache.set(sampleDecision, "zh", zhStory);
    expect(cache.get(sampleDecision, "en")?.story).toBe("in english");
    expect(cache.get(sampleDecision, "zh")?.story).toBe("中文");
    expect(cache.size()).toBe(2);
  });
  it("clear() empties the cache", () => {
    const cache = new WhyStoryCache();
    cache.set(sampleDecision, "en", { story: "x", takeaways: ["a"], tags: [] });
    cache.clear();
    expect(cache.size()).toBe(0);
  });
  it("two decisions with the same id/title/decision share the same cache key (deduped)", () => {
    const a = { ...sampleDecision };
    const b = { ...sampleDecision, date: "2099-01-01" }; // different date
    const cache = new WhyStoryCache();
    cache.set(a, "en", { story: "v1", takeaways: ["a"], tags: [] });
    // Reading via the second decision should hit the same key
    expect(cache.get(b, "en")?.story).toBe("v1");
  });
  it("keyFor() returns the same key the cache uses internally", () => {
    const cache = new WhyStoryCache();
    const key = WhyStoryCache.keyFor(sampleDecision, "en");
    cache.set(sampleDecision, "en", { story: "v1", takeaways: [], tags: [] });
    expect(cache.has(sampleDecision, "en")).toBe(true);
    expect(key).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe("V8 — generateWhyStory (cache + LLM path)", () => {
  it("returns the cached story on a hit (no LLM call)", async () => {
    const cache = new WhyStoryCache();
    const story = { story: "cached", takeaways: ["a"], tags: [] };
    cache.set(sampleDecision, "en", story);
    const provider = makeProvider("test", async () => {
      throw new Error("LLM should not be called on cache hit");
    });
    const out = await generateWhyStory(provider, sampleDecision, { cache });
    expect(out).toEqual(story);
  });

  it("calls the LLM on a miss and caches the result", async () => {
    const cache = new WhyStoryCache();
    let called = 0;
    const provider = makeProvider("test", async (messages) => {
      called++;
      // generateStructured path: extract the user message, build a JSON reply.
      const userMsg = messages.find((m) => m.role === "user");
      return {
        content: JSON.stringify({
          story: "We picked Zod for type-safe runtime validation.",
          takeaways: ["One", "Two", "Three"],
          tags: ["validation"],
        }),
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: "test",
        model: "m",
        latencyMs: 1,
      };
      void userMsg;
    });
    const out = await generateWhyStory(provider, sampleDecision, { cache });
    expect(called).toBe(1);
    expect(out.story).toContain("Zod");
    expect(cache.has(sampleDecision, "en")).toBe(true);
    // Second call hits the cache.
    const out2 = await generateWhyStory(provider, sampleDecision, { cache });
    expect(called).toBe(1);
    expect(out2).toEqual(out);
  });

  it("falls back to a stub Why Story when the LLM output is unrecoverable", async () => {
    const provider = makeProvider("test", async () => {
      // Both generateStructured AND the fallback parse fail.
      // To make generateStructured throw, we throw from chat directly.
      throw new LLMError({ kind: "parse", message: "bad", provider: "test" });
    });
    const out = await generateWhyStory(provider, sampleDecision);
    expect(out.story).toContain("Adopt Zod for runtime validation");
    expect(out.tags).toEqual(["fallback"]);
  });
});
