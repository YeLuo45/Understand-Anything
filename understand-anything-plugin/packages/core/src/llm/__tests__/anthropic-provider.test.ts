/**
 * Anthropic provider tests — V2 of Direction A R2
 *
 * Uses `vi.stubGlobal('fetch', mockFn)` to test against a fake Anthropic
 * endpoint. No real API key is needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnthropicProvider } from "../anthropic-provider";
import { LLMError } from "../llm-client";

type FetchArgs = [string, RequestInit];
type FetchMock = { mock: { calls: any[] }; (...args: any[]): any };

function mockFetchOnce(body: unknown, init?: { status?: number; contentType?: string }) {
  const status = init?.status ?? 200;
  const contentType = init?.contentType ?? "application/json";
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fn = vi.fn(async () => {
    return new Response(text, { status, headers: { "content-type": contentType } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function getLastCall(fetchMock: FetchMock): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as FetchArgs | undefined;
  if (!call) throw new Error("no fetch calls");
  return { url: call[0], init: call[1] };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key-anthropic";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("AnthropicProvider — configuration", () => {
  it("isConfigured() returns true when API key is present", () => {
    const p = new AnthropicProvider({ apiKey: "x" });
    expect(p.isConfigured()).toBe(true);
  });
  it("isConfigured() returns false when API key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const p = new AnthropicProvider();
    expect(p.isConfigured()).toBe(false);
  });
  it("default model is claude-3-5-sonnet-20241022", () => {
    const p = new AnthropicProvider();
    expect(p.defaultModel).toBe("claude-3-5-sonnet-20241022");
    expect(p.id).toBe("anthropic");
  });
  it("accepts a custom model and baseUrl", () => {
    const p = new AnthropicProvider({
      apiKey: "x",
      model: "claude-3-haiku-20240307",
      baseUrl: "https://proxy.example.com",
    });
    expect(p.defaultModel).toBe("claude-3-haiku-20240307");
  });
});

describe("AnthropicProvider — chat()", () => {
  it("throws auth error when API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "user", content: "hi" }]),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  it("sends a properly-shaped request and returns a completion", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "Hello there!" }],
      usage: { input_tokens: 12, output_tokens: 5 },
      model: "claude-3-5-sonnet-20241022",
    });
    const p = new AnthropicProvider();
    const out = await p.chat([{ role: "user", content: "hi" }]);
    expect(out.content).toBe("Hello there!");
    expect(out.usage.inputTokens).toBe(12);
    expect(out.usage.outputTokens).toBe(5);
    expect(out.provider).toBe("anthropic");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = getLastCall(fetchMock);
    expect(url).toContain("/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key-anthropic");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.stream).toBe(false);
  });

  it("merges system messages into the system field", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "m",
    });
    const p = new AnthropicProvider();
    await p.chat([
      { role: "system", content: "Be terse." },
      { role: "user", content: "hi" },
    ]);
    const { init } = getLastCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("Be terse.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("joins multiple system messages with double newlines", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: {},
      model: "m",
    });
    const p = new AnthropicProvider();
    await p.chat([
      { role: "system", content: "S1" },
      { role: "system", content: "S2" },
      { role: "user", content: "hi" },
    ]);
    const { init } = getLastCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("S1\n\nS2");
  });

  it("drops tool-role messages (not supported by this thin wrapper)", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: {},
      model: "m",
    });
    const p = new AnthropicProvider();
    await p.chat([
      { role: "tool", content: "tool output" },
      { role: "user", content: "hi" },
    ]);
    const { init } = getLastCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws bad_request when only system messages are provided", async () => {
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "system", content: "no user" }]),
    ).rejects.toMatchObject({ kind: "bad_request" });
  });

  it("classifies 401 as auth, 429 as rate_limit, 5xx as server", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth"],
      [403, "auth"],
      [429, "rate_limit"],
      [500, "server"],
      [503, "server"],
    ];
    for (const [status, expectedKind] of cases) {
      mockFetchOnce("oops", { status });
      const p = new AnthropicProvider();
      try {
        await p.chat([{ role: "user", content: "x" }]);
        expect.fail(`expected error for status ${status}`);
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).kind).toBe(expectedKind);
        expect((err as LLMError).status).toBe(status);
      }
    }
  });

  it("wraps fetch network failure as LLMError('network')", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "user", content: "x" }]),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("surfaces LLMError('aborted') when the user aborts the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5);
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "user", content: "x" }], { signal: ac.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });
  });

  it("passes temperature / maxTokens / stop through to the body", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: {},
      model: "m",
    });
    const p = new AnthropicProvider();
    await p.chat([{ role: "user", content: "x" }], {
      temperature: 0.2,
      maxTokens: 256,
      stop: ["\n\n"],
      model: "claude-3-haiku-20240307",
    });
    const { init } = getLastCall(fetchMock);
    const body = JSON.parse(init.body as string);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(256);
    expect(body.stop_sequences).toEqual(["\n\n"]);
    expect(body.model).toBe("claude-3-haiku-20240307");
  });

  it("emits streamed chunks via onChunk when provided", async () => {
    const sse =
      "event: message_start\n" +
      "data: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-3-5-sonnet-20241022\",\"usage\":{\"input_tokens\":7,\"output_tokens\":0}}}\n\n" +
      "event: content_block_delta\n" +
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello \"}}\n\n" +
      "event: content_block_delta\n" +
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"world\"}}\n\n" +
      "event: message_delta\n" +
      "data: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":2}}\n\n" +
      "event: message_stop\n" +
      "data: {\"type\":\"message_stop\"}\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );
    const chunks: string[] = [];
    const p = new AnthropicProvider();
    const out = await p.chat(
      [{ role: "user", content: "hi" }],
      { onChunk: (c) => chunks.push(c) },
    );
    expect(chunks).toEqual(["Hello ", "world"]);
    expect(out.content).toBe("Hello world");
    expect(out.usage.inputTokens).toBe(7);
    expect(out.usage.outputTokens).toBe(2);
    expect(out.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("throws LLMError('parse') on a 200 with non-JSON content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("OK plain text", { status: 200, headers: { "content-type": "text/plain" } }),
      ),
    );
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "user", content: "x" }]),
    ).rejects.toMatchObject({ kind: "parse" });
  });

  it("streams gracefully when the body is missing (returns parse error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );
    const p = new AnthropicProvider();
    await expect(
      p.chat([{ role: "user", content: "x" }], { onChunk: () => {} }),
    ).rejects.toMatchObject({ kind: "parse" });
  });
});
