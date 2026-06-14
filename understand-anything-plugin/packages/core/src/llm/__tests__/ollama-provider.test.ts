/**
 * Ollama provider tests — V4 of Direction A R2
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OllamaProvider } from "../ollama-provider";
import { LLMError } from "../llm-client";

function mockFetchOnce(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const fn = vi.fn(async () => new Response(text, { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => { void 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("OllamaProvider — configuration", () => {
  it("is always configured (local server assumed)", () => {
    expect(new OllamaProvider().isConfigured()).toBe(true);
  });
  it("default model is llama3.2", () => {
    expect(new OllamaProvider().defaultModel).toBe("llama3.2");
    expect(new OllamaProvider().id).toBe("ollama");
  });
  it("accepts a custom baseUrl", () => {
    const p = new OllamaProvider({ baseUrl: "http://gpu-host.local:11434" });
    expect(p.isConfigured()).toBe(true);
  });
});

describe("OllamaProvider — chat()", () => {
  it("returns a completion on a normal response", async () => {
    const fetchMock = mockFetchOnce({
      model: "llama3.2",
      message: { role: "assistant", content: "pong" },
      done: true,
      prompt_eval_count: 5,
      eval_count: 3,
    });
    const p = new OllamaProvider();
    const out = await p.chat([{ role: "user", content: "ping" }]);
    expect(out.content).toBe("pong");
    expect(out.usage.inputTokens).toBe(5);
    expect(out.usage.outputTokens).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
  });

  it("uses custom model when overridden", async () => {
    const fetchMock = mockFetchOnce({
      model: "qwen2.5:7b",
      message: { role: "assistant", content: "ok" },
      done: true,
    });
    const p = new OllamaProvider();
    await p.chat([{ role: "user", content: "x" }], { model: "qwen2.5:7b" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("qwen2.5:7b");
  });

  it("drops tool-role messages (Ollama does not support them)", async () => {
    const fetchMock = mockFetchOnce({
      model: "m",
      message: { role: "assistant", content: "ok" },
      done: true,
    });
    const p = new OllamaProvider();
    await p.chat([
      { role: "tool", content: "irrelevant" },
      { role: "user", content: "go" },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages).toEqual([{ role: "user", content: "go" }]);
  });

  it("throws bad_request when Ollama returns an error field", async () => {
    mockFetchOnce({ error: "model 'foo' not found" });
    const p = new OllamaProvider();
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({
      kind: "bad_request",
      message: "model 'foo' not found",
    });
  });

  it("classifies 404 as not_found and 500 as server", async () => {
    const cases: Array<[number, string]> = [
      [404, "not_found"],
      [500, "server"],
    ];
    for (const [status, kind] of cases) {
      mockFetchOnce("err", { status });
      const p = new OllamaProvider();
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
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const p = new OllamaProvider();
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "network" });
  });

  it("emits streamed chunks via onChunk (NDJSON)", async () => {
    const ndjson =
      '{"model":"llama3.2","message":{"role":"assistant","content":"He"},"done":false}\n' +
      '{"model":"llama3.2","message":{"role":"assistant","content":"llo"},"done":false}\n' +
      '{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":4,"eval_count":3}\n';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(ndjson, { status: 200, headers: { "content-type": "application/x-ndjson" } })));
    const chunks: string[] = [];
    const p = new OllamaProvider();
    const out = await p.chat([{ role: "user", content: "x" }], { onChunk: (c) => chunks.push(c) });
    expect(chunks).toEqual(["He", "llo"]);
    expect(out.content).toBe("Hello");
    expect(out.usage.inputTokens).toBe(4);
    expect(out.usage.outputTokens).toBe(3);
  });

  it("aborts and surfaces LLMError('aborted') when timeout fires", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      // Listen for the abort signal
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (!signal) { reject(new Error("no signal")); return; }
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }));
    const p = new OllamaProvider({ timeoutMs: 5 });
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "aborted" });
  });
});
