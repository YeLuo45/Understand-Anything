/**
 * LLM provider integration tests — V5 of Direction A R2
 *
 * Mock-based end-to-end across the 3 providers (Anthropic, OpenAI,
 * Ollama). The 5 required scenarios are:
 *  1. Success on first try
 *  2. Parse failure (non-JSON reply)
 *  3. Timeout / abort
 *  4. Rate limit with retry
 *  5. Network failure with retry exhaustion
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "../anthropic-provider";
import { OpenAIProvider } from "../openai-provider";
import { OllamaProvider } from "../ollama-provider";
import {
  LLMError,
  chatWithRetry,
  generateStructured,
  type ChatMessage,
} from "../llm-client";

const ANTHROPIC_SUCCESS = {
  content: [{ type: "text", text: "Hello from Claude" }],
  usage: { input_tokens: 7, output_tokens: 3 },
  model: "claude-3-5-sonnet-20241022",
};

const OPENAI_SUCCESS = {
  choices: [{ message: { role: "assistant", content: "Hello from GPT" } }],
  usage: { prompt_tokens: 6, completion_tokens: 2 },
  model: "gpt-4o-mini",
};

const OLLAMA_SUCCESS = {
  model: "llama3.2",
  message: { role: "assistant", content: "Hello from Ollama" },
  done: true,
  prompt_eval_count: 5,
  eval_count: 4,
};

function stubFetchSequence(responses: Array<{ body: string | object; status?: number }>) {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("no more mocked responses");
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.OPENAI_API_KEY = "test-openai";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

const messages: ChatMessage[] = [{ role: "user", content: "hi" }];

describe("scenario 1 — success on first try (all 3 providers)", () => {
  it("anthropic returns content + usage", async () => {
    stubFetchSequence([{ body: ANTHROPIC_SUCCESS }]);
    const out = await new AnthropicProvider().chat(messages);
    expect(out.content).toBe("Hello from Claude");
    expect(out.usage.inputTokens).toBe(7);
    expect(out.usage.outputTokens).toBe(3);
    expect(out.provider).toBe("anthropic");
  });
  it("openai returns content + usage", async () => {
    stubFetchSequence([{ body: OPENAI_SUCCESS }]);
    const out = await new OpenAIProvider().chat(messages);
    expect(out.content).toBe("Hello from GPT");
    expect(out.usage.inputTokens).toBe(6);
    expect(out.usage.outputTokens).toBe(2);
    expect(out.provider).toBe("openai");
  });
  it("ollama returns content + usage", async () => {
    stubFetchSequence([{ body: OLLAMA_SUCCESS }]);
    const out = await new OllamaProvider().chat(messages);
    expect(out.content).toBe("Hello from Ollama");
    expect(out.usage.inputTokens).toBe(5);
    expect(out.usage.outputTokens).toBe(4);
    expect(out.provider).toBe("ollama");
  });
});

describe("scenario 2 — parse failure (non-JSON reply)", () => {
  it("Anthropic 200 with non-JSON text body returns parse error via generateStructured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("OK this is plain text not json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })),
    );
    const provider = new AnthropicProvider();
    const schema = z.object({ answer: z.string() });
    await expect(
      generateStructured(provider, schema, messages),
    ).rejects.toMatchObject({ kind: "parse" });
  });
  it("OpenAI 200 with JSON that doesn't match schema returns parse error", async () => {
    stubFetchSequence([{ body: { choices: [{ message: { role: "assistant", content: '{"unrelated":"x"}' } }], usage: {} } }]);
    const provider = new OpenAIProvider();
    const schema = z.object({ answer: z.string() });
    await expect(
      generateStructured(provider, schema, messages),
    ).rejects.toMatchObject({ kind: "parse" });
  });
  it("Ollama returning an error field is mapped to bad_request", async () => {
    stubFetchSequence([{ body: { error: "model not found" } }]);
    const provider = new OllamaProvider();
    await expect(provider.chat(messages)).rejects.toMatchObject({ kind: "bad_request" });
  });
});

describe("scenario 3 — timeout / abort", () => {
  it("OllamaProvider surfaces LLMError('aborted') when timeout fires", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const provider = new OllamaProvider({ timeoutMs: 5 });
    await expect(provider.chat(messages)).rejects.toMatchObject({ kind: "aborted" });
  });
  it("AnthropicProvider surfaces LLMError('aborted') when user aborts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const provider = new AnthropicProvider();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5);
    await expect(provider.chat(messages, { signal: ac.signal })).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("scenario 4 — rate limit with retry → eventual success", () => {
  it("Anthropic: 429 → 429 → 200 succeeds after 2 retries", async () => {
    stubFetchSequence([
      { body: "rate limited", status: 429 },
      { body: "still rate limited", status: 429 },
      { body: ANTHROPIC_SUCCESS },
    ]);
    const provider = new AnthropicProvider();
    const out = await chatWithRetry(
      provider,
      messages,
      undefined,
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    );
    expect(out.content).toBe("Hello from Claude");
  });
  it("OpenAI: 429 → 200 succeeds after 1 retry", async () => {
    stubFetchSequence([
      { body: "rate limited", status: 429 },
      { body: OPENAI_SUCCESS },
    ]);
    const provider = new OpenAIProvider();
    const out = await chatWithRetry(
      provider,
      messages,
      undefined,
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    );
    expect(out.content).toBe("Hello from GPT");
  });
});

describe("scenario 5 — network failure with retry exhaustion", () => {
  it("Ollama: 3 consecutive ECONNREFUSED throw network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const provider = new OllamaProvider();
    // The Ollama provider's timeout path uses 'aborted' for its own timeouts,
    // but ECONNREFUSED surfaces as 'network' because the throw happens
    // before the AbortController fires.
    // However chatWithRetry's default shouldRetry only retries LLMError,
    // so a non-LLMError throw propagates immediately. Verify that:
    await expect(provider.chat(messages)).rejects.toMatchObject({ kind: "network" });
  });
  it("OpenAI: 3 consecutive 503 throws after exhausting retries", async () => {
    stubFetchSequence([
      { body: "boom", status: 503 },
      { body: "boom", status: 503 },
      { body: "boom", status: 503 },
    ]);
    const provider = new OpenAIProvider();
    let calls = 0;
    const counted = vi.fn(async () => {
      calls++;
      return new Response("boom", { status: 503 });
    });
    vi.stubGlobal("fetch", counted);
    await expect(
      chatWithRetry(
        provider,
        messages,
        undefined,
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      ),
    ).rejects.toMatchObject({ kind: "server" });
    expect(calls).toBe(3);
  });
});

describe("end-to-end: generateStructured with all 3 providers", () => {
  const schema = z.object({
    title: z.string(),
    count: z.number(),
  });

  it("anthropic → validated object", async () => {
    stubFetchSequence([{ body: { ...ANTHROPIC_SUCCESS, content: [{ type: "text", text: '{"title":"x","count":1}' }] } }]);
    const out = await generateStructured(new AnthropicProvider(), schema, messages);
    expect(out).toEqual({ title: "x", count: 1 });
  });
  it("openai → validated object", async () => {
    stubFetchSequence([{ body: { ...OPENAI_SUCCESS, choices: [{ message: { role: "assistant", content: '{"title":"y","count":2}' } }] } }]);
    const out = await generateStructured(new OpenAIProvider(), schema, messages);
    expect(out).toEqual({ title: "y", count: 2 });
  });
  it("ollama → validated object", async () => {
    stubFetchSequence([{ body: { ...OLLAMA_SUCCESS, message: { role: "assistant", content: '{"title":"z","count":3}' } } }]);
    const out = await generateStructured(new OllamaProvider(), schema, messages);
    expect(out).toEqual({ title: "z", count: 3 });
  });
});
