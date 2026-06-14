/**
 * Ollama provider — V4 of Direction A R2
 *
 * Implements `LLMProvider` against the Ollama HTTP API
 * (https://ollama.com). Ollama exposes an OpenAI-compatible
 * /v1/chat/completions endpoint as of 0.1.14+, but here we use the
 * native /api/chat endpoint for two reasons:
 *   - it returns NDJSON streaming, simpler to parse than SSE
 *   - it doesn't require an API key (local install)
 *
 * Configuration:
 *   - baseUrl defaults to http://localhost:11434
 *   - no API key required (isConfigured() is always true)
 *   - default model: llama3.2
 */
import {
  LLMError,
  classifyStatus,
  type ChatMessage,
  type ChatOptions,
  type ChatCompletion,
  type LLMProvider,
} from "./llm-client.js";

const OLLAMA_DEFAULT_MODEL = "llama3.2";
const OLLAMA_DEFAULT_URL = "http://localhost:11434";

export interface OllamaProviderConfig {
  model?: string;
  baseUrl?: string;
  /** Request timeout in ms. Default: 120000. */
  timeoutMs?: number;
}

function toOllama(messages: readonly ChatMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));
}

/** Ollama chat response shape. */
interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly displayName = "Ollama (local)";
  readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OllamaProviderConfig = {}) {
    this.defaultModel = config.model ?? OLLAMA_DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl ?? OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  isConfigured(): boolean {
    // Ollama is local; we assume the server is reachable. isConfigured()
    // returning true lets the user attempt a call; if the server is down
    // the chat() call will surface a 'network' error.
    return true;
  }

  async chat(
    messages: readonly ChatMessage[],
    options?: ChatOptions & { model?: string },
  ): Promise<ChatCompletion> {
    const body = JSON.stringify({
      model: options?.model ?? this.defaultModel,
      messages: toOllama(messages),
      stream: Boolean(options?.onChunk),
      options: {
        temperature: options?.temperature,
        num_predict: options?.maxTokens,
        stop: options?.stop,
      },
    });
    const url = `${this.baseUrl}/api/chat`;
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    options?.signal?.addEventListener("abort", () => ac.abort(), { once: true });
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = ac.signal.aborted;
      throw new LLMError({
        kind: isAbort ? "aborted" : "network",
        message: `Ollama fetch to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
        provider: this.id,
      });
    }
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError({
        kind: classifyStatus(res.status),
        message: `Ollama ${res.status}: ${text.slice(0, 300)}`,
        provider: this.id,
        status: res.status,
      });
    }
    if (options?.onChunk) return this.handleStreaming(res, options.onChunk, started);
    return this.handleJson(res, started, options?.model);
  }

  private async handleJson(
    res: Response,
    started: number,
    model: string | undefined,
  ): Promise<ChatCompletion> {
    const data = (await res.json()) as OllamaChatResponse;
    if (data.error) {
      throw new LLMError({
        kind: "bad_request",
        message: data.error,
        provider: this.id,
      });
    }
    return {
      content: data.message?.content ?? "",
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      provider: this.id,
      model: model ?? data.model ?? this.defaultModel,
      latencyMs: Date.now() - started,
    };
  }

  private async handleStreaming(
    res: Response,
    onChunk: (chunk: string) => void,
    started: number,
  ): Promise<ChatCompletion> {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new LLMError({
        kind: "parse",
        message: "Ollama returned no body for streaming request",
        provider: this.id,
      });
    }
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let resolvedModel = this.defaultModel;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // NDJSON: one JSON object per line.
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as OllamaChatResponse;
          if (parsed.error) {
            throw new LLMError({
              kind: "bad_request",
              message: parsed.error,
              provider: this.id,
            });
          }
          if (parsed.model) resolvedModel = parsed.model;
          if (parsed.message?.content) {
            content += parsed.message.content;
            onChunk(parsed.message.content);
          }
          if (typeof parsed.prompt_eval_count === "number") {
            inputTokens = parsed.prompt_eval_count;
          }
          if (typeof parsed.eval_count === "number") {
            outputTokens = parsed.eval_count;
          }
        } catch (err) {
          if (err instanceof LLMError) throw err;
          // ignore non-JSON lines
        }
      }
    }
    return {
      content,
      usage: { inputTokens, outputTokens },
      provider: this.id,
      model: resolvedModel,
      latencyMs: Date.now() - started,
    };
  }
}
