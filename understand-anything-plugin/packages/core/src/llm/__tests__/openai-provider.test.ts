/**
 * OpenAI provider tests — V3 of Direction A R2
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenAIProvider } from "../openai-provider";
import { LLMError } from "../llm-client";

function mockFetchOnce(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fn = vi.fn(async () => new Response(text, { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe("OpenAIProvider — configuration", () => {
  it("isConfigured() reflects the API key", () => {
    expect(new OpenAIProvider().isConfigured()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    expect(new OpenAIProvider().isConfigured()).toBe(false);
  });
  it("default model is gpt-4o-mini", () => {
    expect(new OpenAIProvider().defaultModel).toBe("gpt-4o-mini");
    expect(new OpenAIProvider().id).toBe("openai");
  });
  it("accepts a custom model and baseUrl", () => {
    const p = new OpenAIProvider({ model: "gpt-4o", baseUrl: "https://api.example.com" });
    expect(p.defaultModel).toBe("gpt-4o");
  });
});

describe("OpenAIProvider — chat()", () => {
  it("returns a completion on a normal response", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { role: "assistant", content: "pong" } }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      model: "gpt-4o-mini",
    });
    const p = new OpenAIProvider();
    const out = await p.chat([{ role: "user", content: "ping" }]);
    expect(out.content).toBe("pong");
    expect(out.usage.inputTokens).toBe(4);
    expect(out.usage.outputTokens).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("includes bearer auth header", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: {},
      model: "m",
    });
    const p = new OpenAIProvider();
    await p.chat([{ role: "user", content: "x" }]);
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("includes organization header when configured", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: {},
      model: "m",
    });
    const p = new OpenAIProvider({ organization: "org-test" });
    await p.chat([{ role: "user", content: "x" }]);
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["openai-organization"]).toBe("org-test");
  });

  it("filters tool-role messages (OpenAI needs tool_calls API, not raw tool role)", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: {},
      model: "m",
    });
    const p = new OpenAIProvider();
    await p.chat([
      { role: "tool", content: "result", name: "search" },
      { role: "user", content: "go" },
    ]);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0]?.[1].body as string);
    expect(body.messages).toEqual([{ role: "user", content: "go" }]);
  });

  it("classifies 401/429/5xx correctly", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth"],
      [429, "rate_limit"],
      [500, "server"],
    ];
    for (const [status, kind] of cases) {
      mockFetchOnce("err", { status });
      const p = new OpenAIProvider();
      try {
        await p.chat([{ role: "user", content: "x" }]);
        expect.fail();
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe(kind);
      }
    }
  });

  it("wraps network errors as LLMError('network')", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ETIMEDOUT"); }));
    const p = new OpenAIProvider();
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "network" });
  });

  it("emits streamed chunks via onChunk", async () => {
    const sse =
      "data: {\"id\":\"x\",\"model\":\"gpt-4o-mini\",\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"He\"}}]}\n\n" +
      "data: {\"id\":\"x\",\"model\":\"gpt-4o-mini\",\"choices\":[{\"delta\":{\"content\":\"llo\"}}]}\n\n" +
      "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\n" +
      "data: [DONE]\n\n";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })));
    const chunks: string[] = [];
    const p = new OpenAIProvider();
    const out = await p.chat([{ role: "user", content: "x" }], { onChunk: (c) => chunks.push(c) });
    expect(chunks).toEqual(["He", "llo"]);
    expect(out.content).toBe("Hello");
    expect(out.usage.inputTokens).toBe(3);
    expect(out.usage.outputTokens).toBe(2);
  });
});
