/**
 * LLM client interface — V1 of Direction A R2 "Why 深化"
 *
 * Tiny, dependency-free abstraction over different LLM providers.
 * The 3 providers (Anthropic, OpenAI, Ollama) all implement this same
 * shape; the rest of the system can talk to any of them interchangeably.
 *
 * Design goals:
 *   - Zero external deps in this file (so the core package stays small).
 *   - `node:fetch` (Node 18+) is used for HTTP; runtime requires Node 18+.
 *   - Streaming is supported via a callback (avoid pulling in an SSE lib).
 *   - Errors are normalised to `LLMError` so callers can branch on
 *     rate-limit / auth / network without inspecting provider-specific shapes.
 */
import type { ZodTypeAny, z } from "zod";

/** A single message in a chat conversation. */
export interface ChatMessage {
  /** "system" | "user" | "assistant" | "tool". */
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Optional name for multi-agent flows. */
  name?: string;
}

/** Per-call options. */
export interface ChatOptions {
  /** Sampling temperature in [0, 2]. Provider may clamp. */
  temperature?: number;
  /** Max output tokens. Provider may clamp. */
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
  /** Optional callback for streaming. If absent, we wait for the full reply. */
  onChunk?: (chunk: string) => void;
  /** Abort signal (uses standard Web API shape). */
  signal?: AbortSignal;
}

/** Successful completion. */
export interface ChatCompletion {
  content: string;
  /** Provider-reported usage; field shape varies. Always set to a sane default. */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Provider name (e.g. "anthropic"). */
  provider: string;
  /** Provider model id (e.g. "claude-3-5-sonnet-20241022"). */
  model: string;
  /** Wall-clock latency in ms. */
  latencyMs: number;
}

/** Provider capability surface. */
export interface LLMProvider {
  /** Stable id, e.g. "anthropic", "openai", "ollama". */
  readonly id: string;
  /** Human-friendly display name. */
  readonly displayName: string;
  /** Default model id (used when the caller does not pass one). */
  readonly defaultModel: string;
  /** Send a chat completion. */
  chat(
    messages: readonly ChatMessage[],
    options?: ChatOptions & { model?: string },
  ): Promise<ChatCompletion>;
  /** Whether the provider is configured (e.g. API key present). */
  isConfigured(): boolean;
}

/** Normalised error categories callers can branch on. */
export type LLMErrorKind =
  | "auth"        // 401 / 403
  | "rate_limit"  // 429
  | "not_found"   // 404 (e.g. wrong model id)
  | "bad_request" // 400 (incl. context-length, invalid params)
  | "server"      // 5xx
  | "network"     // fetch failed / DNS / TLS
  | "aborted"     // user abort
  | "parse"       // could not parse provider response
  | "unknown";

/** Normalised error. */
export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly provider: string;
  readonly status?: number;
  readonly retryAfterSec?: number;
  constructor(opts: {
    kind: LLMErrorKind;
    message: string;
    provider: string;
    status?: number;
    retryAfterSec?: number;
  }) {
    super(opts.message);
    this.name = "LLMError";
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

/** Map a numeric HTTP status to an LLMErrorKind. */
export function classifyStatus(status: number): LLMErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 400) return "bad_request";
  if (status >= 500 && status < 600) return "server";
  return "unknown";
}

/** Extract retry-after seconds from a Response object (header or default). */
export function parseRetryAfter(res: Response, fallback = 1): number {
  const h = res.headers.get("retry-after");
  if (!h) return fallback;
  const n = Number(h);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 60);
}

/**
 * Retry policy: exponential backoff with jitter, max 3 attempts. Only
 * retries on transient errors (rate_limit, server, network). Auth and
 * bad_request are not retried — they are caller bugs.
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRY: Required<Omit<RetryOptions, "shouldRetry">> & {
  shouldRetry: NonNullable<RetryOptions["shouldRetry"]>;
} = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  shouldRetry: (err, _attempt) => {
    if (err instanceof LLMError) {
      return err.kind === "rate_limit" || err.kind === "server" || err.kind === "network";
    }
    return false;
  },
};

/** Sleep helper. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LLMError({ kind: "aborted", message: "aborted", provider: "" }));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new LLMError({ kind: "aborted", message: "aborted", provider: "" }));
      },
      { once: true },
    );
  });
}

/** Exponential backoff with jitter. */
function backoff(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt);
  // Full jitter — uniform [0, exp)
  return Math.floor(Math.random() * exp);
}

/**
 * Wrap a `chat` invocation with the default retry policy.
 * Returns the same `ChatCompletion` (or throws `LLMError`).
 */
export async function chatWithRetry(
  provider: LLMProvider,
  messages: readonly ChatMessage[],
  options?: ChatOptions & { model?: string },
  retry?: RetryOptions,
): Promise<ChatCompletion> {
  const r = { ...DEFAULT_RETRY, ...(retry ?? {}) };
  let lastErr: unknown;
  for (let attempt = 0; attempt < r.maxAttempts; attempt++) {
    try {
      return await provider.chat(messages, options);
    } catch (err) {
      lastErr = err;
      if (!r.shouldRetry(err, attempt) || attempt === r.maxAttempts - 1) throw err;
      const delay = backoff(attempt, r.baseDelayMs, r.maxDelayMs);
      await sleep(delay, options?.signal);
    }
  }
  throw lastErr;
}

/**
 * Generate a structured object from the LLM using a Zod schema.
 * Combines: build a JSON-only system prompt, call chat(), parse, validate.
 * Returns the validated, typed object.
 */
export async function generateStructured<T extends ZodTypeAny>(
  provider: LLMProvider,
  schema: T,
  messages: readonly ChatMessage[],
  options?: ChatOptions & { model?: string },
): Promise<z.infer<T>> {
  const sysMsg: ChatMessage = {
    role: "system",
    content:
      "You are a JSON API. Respond with a single JSON object matching the user's schema. " +
      "Do NOT include any other text, code fences, or commentary.",
  };
  const userMsg: ChatMessage = {
    role: "user",
    content:
      `Produce a JSON object matching this schema:\n` +
      JSON.stringify(extractShape(schema), null, 2) +
      `\n\nFor this request:\n` +
      (messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n") || "(empty)"),
  };
  const reply = await chatWithRetry(provider, [sysMsg, userMsg], options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.content);
  } catch (err) {
    throw new LLMError({
      kind: "parse",
      provider: provider.id,
      message: `LLM output was not JSON: ${
        err instanceof Error ? err.message : String(err)
      }. Output: ${reply.content.slice(0, 200)}`,
    });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LLMError({
      kind: "parse",
      provider: provider.id,
      message: `LLM JSON did not match schema: ${result.error.issues[0]?.message ?? "unknown"}`,
    });
  }
  return result.data;
}

/**
 * Extract a JSON-Schema-ish shape from a Zod schema so the LLM has
 * something to read. We do a best-effort walk — supports Zod 3 and 4
 * (the internal `_def` ↔ `def` name changed in Zod 4).
 */
function extractShape(schema: ZodTypeAny): Record<string, unknown> {
  // Zod 4 stores internals on `def`; Zod 3 used `_def`. Support both.
  const def = (schema as unknown as { def?: unknown; _def?: unknown }).def
    ?? (schema as unknown as { _def?: unknown })._def;
  const t = (def as { type?: string; typeName?: string } | undefined)?.type
    ?? (def as { typeName?: string } | undefined)?.typeName;
  if (t === "string" || t === "ZodString") return { type: "string" };
  if (t === "number" || t === "ZodNumber") return { type: "number" };
  if (t === "boolean" || t === "ZodBoolean") return { type: "boolean" };
  if (t === "enum" || t === "ZodEnum") {
    const values = (def as { entries?: Record<string, string>; options?: readonly string[] });
    const opts = values.entries
      ? Object.values(values.entries)
      : (values.options ?? []);
    return { type: "string", enum: [...opts] };
  }
  if (t === "array" || t === "ZodArray") {
    const inner = (def as { element?: ZodTypeAny; type?: ZodTypeAny }).element
      ?? (def as { type?: ZodTypeAny }).type;
    return { type: "array", items: inner ? extractShape(inner) : {} };
  }
  if (t === "object" || t === "ZodObject") {
    const shape = (def as { shape?: Record<string, ZodTypeAny> | (() => Record<string, ZodTypeAny>) }).shape;
    const resolved = typeof shape === "function" ? shape() : shape ?? {};
    const out: Record<string, unknown> = { type: "object", properties: {} };
    for (const [k, v] of Object.entries(resolved)) {
      (out.properties as Record<string, unknown>)[k] = extractShape(v);
    }
    return out;
  }
  if (t === "optional" || t === "ZodOptional") {
    const inner = (def as { innerType?: ZodTypeAny }).innerType;
    return inner ? extractShape(inner) : {};
  }
  return {};
}
