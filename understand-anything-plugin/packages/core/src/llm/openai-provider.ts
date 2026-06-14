/**
 * OpenAI provider — V3 of Direction A R2
 *
 * Implements `LLMProvider` against the OpenAI Chat Completions API
 * (https://api.openai.com/v1/chat/completions). Compatible with any
 * OpenAI-API-compatible endpoint (e.g. Azure OpenAI, Together, Groq)
 * by passing `baseUrl`.
 */
import {
  LLMError,
  classifyStatus,
  parseRetryAfter,
  type ChatMessage,
  type ChatOptions,
  type ChatCompletion,
  type LLMProvider,
} from "./llm-client.js";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Optional organisation header. */
  organization?: string;
}

function toOpenAI(messages: readonly ChatMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}> {
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => {
      const out: { role: "system" | "user" | "assistant"; content: string; name?: string } = {
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      };
      if (m.name) out.name = m.name;
      return out;
    });
}

/** OpenAI SSE event shape. */
interface OpenAIChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: { content?: string; role?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  readonly defaultModel: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly organization: string | undefined;

  constructor(config: OpenAIProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.defaultModel = config.model ?? OPENAI_DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
    this.organization = config.organization ?? process.env.OPENAI_ORGANIZATION;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async chat(
    messages: readonly ChatMessage[],
    options?: ChatOptions & { model?: string },
  ): Promise<ChatCompletion> {
    if (!this.apiKey) {
      throw new LLMError({
        kind: "auth",
        message: "OPENAI_API_KEY is not set",
        provider: this.id,
      });
    }
    const body = JSON.stringify({
      model: options?.model ?? this.defaultModel,
      messages: toOpenAI(messages),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stop: options?.stop,
      stream: Boolean(options?.onChunk),
    });
    const url = `${this.baseUrl}/v1/chat/completions`;
    const started = Date.now();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization) headers["openai-organization"] = this.organization;
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body, signal: options?.signal });
    } catch (err) {
      if (options?.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new LLMError({
          kind: "aborted",
          message: "OpenAI request aborted",
          provider: this.id,
        });
      }
      throw new LLMError({
        kind: "network",
        message: `fetch to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
        provider: this.id,
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError({
        kind: classifyStatus(res.status),
        message: `OpenAI ${res.status}: ${text.slice(0, 300)}`,
        provider: this.id,
        status: res.status,
        retryAfterSec: parseRetryAfter(res, 1),
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
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string; role: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const text = (data.choices?.[0]?.message?.content) ?? "";
    return {
      content: text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
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
        message: "OpenAI returned no body for streaming request",
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
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const lines = ev.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as OpenAIChunk;
            if (parsed.model) resolvedModel = parsed.model;
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? inputTokens;
              outputTokens = parsed.usage.completion_tokens ?? outputTokens;
            }
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              content += delta.content;
              onChunk(delta.content);
            }
          } catch {
            // ignore non-JSON lines
          }
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
