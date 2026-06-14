/**
 * Anthropic Claude provider — V2 of Direction A R2
 *
 * Implements `LLMProvider` against Anthropic's Messages API
 * (https://api.anthropic.com/v1/messages). Uses Node 18+ global `fetch`.
 *
 * The provider:
 *  - Reads ANTHROPIC_API_KEY from the env by default
 *  - Defaults to claude-3-5-sonnet-20241022
 *  - Translates HTTP errors into LLMError with the right `kind`
 *  - Streams via `onChunk` (newline-delimited `event: ...\ndata: ...`)
 *  - Returns usage with input/output token counts
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

const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicProviderConfig {
  /** API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model id. Default: claude-3-5-sonnet-20241022. */
  model?: string;
  /** Base URL (for proxies). Default: https://api.anthropic.com. */
  baseUrl?: string;
  /** Max tokens for output. Default: 1024. */
  maxTokens?: number;
}

/** Convert our ChatMessage[] to Anthropic's { system, messages[] } shape. */
function toAnthropic(messages: readonly ChatMessage[]): {
  system: string;
  msgs: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const sysParts: string[] = [];
  const msgs: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") sysParts.push(m.content);
    else if (m.role === "user") msgs.push({ role: "user", content: m.content });
    else if (m.role === "assistant") msgs.push({ role: "assistant", content: m.content });
    // 'tool' is not natively supported in this thin wrapper; users can
    // surface tool output as user/assistant content if needed.
  }
  return { system: sysParts.join("\n\n"), msgs };
}

/** Anthropic SSE event shape. */
interface AnthropicEvent {
  type: string;
  delta?: { type?: string; text?: string };
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic Claude";
  readonly defaultModel: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly maxTokens: number;

  constructor(config: AnthropicProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.defaultModel = config.model ?? ANTHROPIC_DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    this.maxTokens = config.maxTokens ?? 1024;
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
        message: "ANTHROPIC_API_KEY is not set",
        provider: this.id,
      });
    }
    const { system, msgs } = toAnthropic(messages);
    if (msgs.length === 0) {
      throw new LLMError({
        kind: "bad_request",
        message: "no user/assistant messages provided",
        provider: this.id,
      });
    }
    const body = JSON.stringify({
      model: options?.model ?? this.defaultModel,
      system,
      messages: msgs,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature,
      stop_sequences: options?.stop,
      stream: Boolean(options?.onChunk),
    });
    const url = `${this.baseUrl}/v1/messages`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body,
        signal: options?.signal,
      });
    } catch (err) {
      // Distinguish user-aborted from network failure.
      if (options?.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new LLMError({
          kind: "aborted",
          message: "Anthropic request aborted",
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
        message: `Anthropic ${res.status}: ${text.slice(0, 300)}`,
        provider: this.id,
        status: res.status,
        retryAfterSec: parseRetryAfter(res, 1),
      });
    }
    // Some Anthropic endpoints / proxies return text bodies; detect that
    // and surface a parse error before the JSON step.
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json") && !ct.includes("event-stream") && !options?.onChunk) {
      const text = await res.text().catch(() => "");
      throw new LLMError({
        kind: "parse",
        message: `Anthropic returned non-JSON body: ${text.slice(0, 200)}`,
        provider: this.id,
      });
    }
    if (options?.onChunk) {
      return await this.handleStreaming(res, options.onChunk, started, options?.model);
    }
    return await this.handleJson(res, started, options?.model);
  }

  private async handleJson(
    res: Response,
    started: number,
    model: string | undefined,
  ): Promise<ChatCompletion> {
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return {
      content: text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
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
    model: string | undefined,
  ): Promise<ChatCompletion> {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new LLMError({
        kind: "parse",
        message: "Anthropic returned no body for streaming request",
        provider: this.id,
      });
    }
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let resolvedModel = model ?? this.defaultModel;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // Split on SSE event boundary.
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const lines = ev.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as AnthropicEvent;
            if (parsed.message?.model) resolvedModel = parsed.message.model;
            if (parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens ?? 0;
              outputTokens = parsed.message.usage.output_tokens ?? 0;
            }
            // Anthropic puts `usage` at the top level on `message_delta`
            // events (only output_tokens is reported there).
            const topUsage = (parsed as { usage?: { output_tokens?: number } }).usage;
            if (topUsage?.output_tokens !== undefined) {
              outputTokens = topUsage.output_tokens;
            }
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              content += parsed.delta.text;
              onChunk(parsed.delta.text);
            }
          } catch {
            // ignore non-JSON keep-alive lines
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
