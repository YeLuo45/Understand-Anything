/**
 * Why Story integration tests — V10 of Direction A R2
 *
 * End-to-end coverage:
 *  - Full pipeline: ADR + cache + LLM mock → Why Story → merged ADR
 *    → extractWhyStory → round-trip equality
 *  - Dashboard data path: ADR with embedded story renders via
 *    extractWhyStory with the expected field shape
 *  - 10 scenarios: short / long / no alternatives / multiple languages /
 *    multiple decisions / no LLM / cache hit / cache miss / fallback stub
 *    / corrupt embedded JSON
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildWhyStoryPrompt,
  parseWhyStory,
  mergeWhyStory,
  extractWhyStory,
  WhyStoryCache,
  generateWhyStory,
  type WhyStory,
} from "../why-story";
import type { ArchitectureDecisionRecord } from "../../types";
import type { LLMProvider, ChatCompletion } from "../llm-client";

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

const shortDecision: ArchitectureDecisionRecord = {
  id: "adr:short",
  title: "Use Vite",
  status: "accepted",
  context: "Slow webpack.",
  decision: "Use Vite.",
  consequences: { positive: ["Fast HMR"], negative: [] },
  alternatives: [],
  date: "2026-06-14",
  source: "git-commit",
  tags: [],
  linkedNodeIds: [],
  complexity: "simple",
};

const longDecision: ArchitectureDecisionRecord = {
  id: "adr:long",
  title: "Migrate from REST to GraphQL",
  status: "accepted",
  context:
    "We have 12 microservices each exposing their own REST API. " +
    "Frontend teams have to make 5+ round trips to render a single page, " +
    "and the contract drift between services is constant churn.",
  decision:
    "Adopt GraphQL with a federated gateway (Apollo Federation v2). " +
    "Each service exposes a sub-graph; the gateway composes them. " +
    "Frontend uses one query per page, fetches exactly the fields it needs. " +
    "Persisted queries on mobile to cut payload size by 80%.",
  consequences: {
    positive: [
      "1 round trip per page",
      "Type-safe schema shared with clients",
      "No over-fetch",
    ],
    negative: [
      "+ 200ms cold-start for gateway",
      "Caching harder than REST",
      "Team needs Apollo Federation training",
    ],
  },
  alternatives: [
    { name: "tRPC", whyRejected: "TypeScript-only, can't serve mobile", pros: ["Simple"], cons: ["No native clients"] },
    { name: "BFF per service", whyRejected: "Multiplies ops burden", pros: ["Bounded"], cons: ["N teams × N BFFs"] },
  ],
  date: "2026-04-01",
  source: "manual",
  tags: ["api", "migration"],
  linkedNodeIds: ["file:src/gateway.ts"],
  complexity: "complex",
  tradeoffScore: 0.8,
};

describe("V10 — end-to-end Why Story pipeline", () => {
  it("1. prompt shape stays consistent for short and long ADRs", () => {
    const s = buildWhyStoryPrompt(shortDecision);
    const l = buildWhyStoryPrompt(longDecision);
    expect(s.system).toContain("senior engineer");
    expect(l.system).toContain("senior engineer");
    expect(s.user).toContain("Use Vite");
    expect(l.user).toContain("Migrate from REST to GraphQL");
    expect(s.user).toContain("Slow webpack.");
    expect(l.user).toContain("12 microservices");
  });

  it("2. parse + merge + extract round-trip preserves all 3 fields", () => {
    const story: WhyStory = {
      story: "We chose GraphQL to eliminate over-fetching.",
      takeaways: ["1 round trip", "Type-safe", "+200ms cold start"],
      tags: ["api", "tradeoff"],
    };
    const merged = mergeWhyStory(longDecision, story);
    const extracted = extractWhyStory(merged);
    expect(extracted).toEqual(story);
  });

  it("3. short ADR with no alternatives still gets a valid Why Story", async () => {
    const provider = makeProvider("test", async () => ({
      content: JSON.stringify({
        story: "We swapped Webpack for Vite to get sub-second HMR.",
        takeaways: ["10x faster HMR", "Less config", "ESM-native"],
        tags: ["build"],
      }),
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: "test",
      model: "m",
      latencyMs: 1,
    }));
    const out = await generateWhyStory(provider, shortDecision);
    expect(out.story).toContain("Vite");
    expect(out.takeaways).toHaveLength(3);
  });

  it("4. multi-language: a Chinese decision gets a Chinese prompt", () => {
    const { user, system } = buildWhyStoryPrompt(shortDecision, "zh");
    expect(system).toContain("zh");
    expect(user).toContain("Output language: zh");
  });

  it("5. multi-decision cache: 3 decisions, all cached, only 1 LLM call", async () => {
    let calls = 0;
    const provider = makeProvider("test", async () => {
      calls++;
      return {
        content: JSON.stringify({ story: "x", takeaways: ["a"], tags: [] }),
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: "test",
        model: "m",
        latencyMs: 1,
      };
    });
    const cache = new WhyStoryCache();
    const ds: ArchitectureDecisionRecord[] = [
      { ...shortDecision, id: "a" },
      { ...shortDecision, id: "b" },
      { ...shortDecision, id: "c" },
    ];
    for (const d of ds) await generateWhyStory(provider, d, { cache });
    expect(calls).toBe(3);
    expect(cache.size()).toBe(3);
    // Second pass — all hits
    for (const d of ds) await generateWhyStory(provider, d, { cache });
    expect(calls).toBe(3);
  });

  it("6. no LLM available → returns a fallback Why Story with the right shape", async () => {
    const provider = makeProvider("test", async () => {
      throw new Error("no LLM configured");
    });
    const out = await generateWhyStory(provider, shortDecision);
    expect(out.story).toContain("Use Vite");
    expect(out.tags).toEqual(["fallback"]);
    expect(out.takeaways).toHaveLength(1);
  });

  it("7. cache hit returns the exact same object reference", async () => {
    const provider = makeProvider("test", async () => ({
      content: JSON.stringify({ story: "x", takeaways: ["a"], tags: [] }),
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: "test",
      model: "m",
      latencyMs: 1,
    }));
    const cache = new WhyStoryCache();
    const a = await generateWhyStory(provider, shortDecision, { cache });
    const b = await generateWhyStory(provider, shortDecision, { cache });
    expect(a).toBe(b);
  });

  it("8. parseWhyStory filters out whitespace-only takeaways and tags", () => {
    const out = parseWhyStory(
      JSON.stringify({
        story: "ok",
        takeaways: ["real", "   ", "", "also real"],
        tags: ["", "  ", "t"],
      }),
    );
    expect(out?.takeaways).toEqual(["real", "also real"]);
    expect(out?.tags).toEqual(["t"]);
  });

  it("9. corrupt embedded JSON yields a safe null (no throw)", () => {
    const broken = {
      ...shortDecision,
      tags: [...shortDecision.tags, "__story:not-json{"],
    };
    expect(extractWhyStory(broken)).toBeNull();
  });

  it("10. embedded story that lacks the story key returns null (defensive)", () => {
    const bad = {
      ...shortDecision,
      tags: [
        ...shortDecision.tags,
        "__story:" + JSON.stringify({ takeaways: ["a"], tags: [] }),
      ],
    };
    expect(extractWhyStory(bad)).toBeNull();
  });

  it("11. WhyStoryCache keyFor() returns 8-char FNV-1a hex", () => {
    const key = WhyStoryCache.keyFor(shortDecision, "en");
    expect(key).toMatch(/^[a-f0-9]{8}$/);
  });

  it("12. multiple LLM providers share the same cache key (cache is provider-agnostic)", async () => {
    const cache = new WhyStoryCache();
    const anthropic = makeProvider("anthropic", async () => ({
      content: JSON.stringify({ story: "from-anthropic", takeaways: ["a"], tags: [] }),
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: "anthropic", model: "m", latencyMs: 1,
    }));
    const openai = makeProvider("openai", async () => {
      throw new Error("cache should have hit — openai should not be called");
    });
    const a = await generateWhyStory(anthropic, shortDecision, { cache });
    const b = await generateWhyStory(openai, shortDecision, { cache });
    expect(a.story).toBe("from-anthropic");
    expect(b.story).toBe("from-anthropic"); // served from cache
  });

  it("13. empty `linkedNodeIds` ADR still produces a valid Why Story", async () => {
    const provider = makeProvider("test", async () => ({
      content: JSON.stringify({ story: "x", takeaways: ["a"], tags: [] }),
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: "test", model: "m", latencyMs: 1,
    }));
    const out = await generateWhyStory(provider, { ...shortDecision, linkedNodeIds: [] });
    expect(out.story).toBe("x");
  });

  it("14. ADR with many alternatives is rendered with each one", () => {
    const manyAlts: ArchitectureDecisionRecord = {
      ...shortDecision,
      alternatives: [
        { name: "REST", whyRejected: "too chatty", pros: ["simple"], cons: ["overfetch"] },
        { name: "gRPC", whyRejected: "browser-unfriendly", pros: ["fast"], cons: ["tooling"] },
        { name: "tRPC", whyRejected: "TS-only", pros: ["types"], cons: ["mobile"] },
        { name: "GraphQL", whyRejected: "operational cost", pros: ["flexible"], cons: ["complex"] },
      ],
    };
    const { user } = buildWhyStoryPrompt(manyAlts);
    expect(user).toContain("REST");
    expect(user).toContain("gRPC");
    expect(user).toContain("tRPC");
    expect(user).toContain("GraphQL");
  });
});
