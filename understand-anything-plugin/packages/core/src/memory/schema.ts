/**
 * Memory Layer — Schema, Lifecycle, Fingerprint (Direction A V1/30)
 *
 * Borrowed from agentmemory + generic-agent: persistent knowledge graph
 * with confidence decay, lifecycle state machine, fingerprint-based dedup.
 *
 * Iter 1/30 of 30 — establishes core types used by all subsequent memory
 * engines (KV store, L0-L4 layers, crystallize, hybrid search, etc.).
 */

/** Lifecycle states a memory entry can occupy. */
export type MemoryLifecycle =
  | "active"        // default state
  | "consolidated"  // already aggregated into a Lesson
  | "stale"         // long time no access
  | "evicted"       // removed from primary store
  | "archived";     // preserved but excluded from search

export const LIFECYCLE_VALUES: ReadonlyArray<MemoryLifecycle> = [
  "active",
  "consolidated",
  "stale",
  "evicted",
  "archived",
] as const;

/** Core record stored in the memory KV. */
export interface MemoryEntry {
  id: string;
  fingerprint: string;
  content: string;
  summary?: string;
  confidence: number;        // 0..1
  lifecycle: MemoryLifecycle;
  tags: string[];
  scope: string;             // isolation scope (default / project-A / user-1)
  metadata: Record<string, unknown>;
  createdAt: string;         // ISO timestamp
  lastAccessedAt: string;
  accessCount: number;
  expiresAt?: string;
  relatedIds: string[];
  source?: string;           // which hook / function / agent created it
}

/** Minimal input required to mint a new MemoryEntry. */
export interface CreateMemoryInput {
  content: string;
  scope?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  summary?: string;
  source?: string;
  expiresAt?: string;
  confidence?: number;
}

/** Stable, fast (non-cryptographic) 64-bit hash for content fingerprinting. */
export function fingerprintId(content: string): string {
  // FNV-1a 64-bit — same algorithm used by ii engine for dedup keys.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < content.length; i++) {
    hash ^= BigInt(content.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Validate a confidence value is in [0, 1]. */
export function isValidConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Validate lifecycle string is one of the allowed enum values. */
export function isValidLifecycle(value: string): value is MemoryLifecycle {
  return (LIFECYCLE_VALUES as readonly string[]).includes(value);
}

/** Terminal lifecycle values — excluded from primary search. */
export function isTerminal(lifecycle: MemoryLifecycle): boolean {
  return lifecycle === "evicted" || lifecycle === "archived";
}

/** Legal lifecycle transitions per state-machine rules. */
const TRANSITIONS: Record<MemoryLifecycle, ReadonlyArray<MemoryLifecycle>> = {
  active: ["consolidated", "stale", "evicted", "archived"],
  consolidated: ["active", "stale", "evicted", "archived"],
  stale: ["active", "evicted", "archived"],
  evicted: ["archived"],
  archived: ["evicted"],
};

export function canTransition(from: MemoryLifecycle, to: MemoryLifecycle): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Mint a new MemoryEntry. Throws on invalid input. */
export function createMemoryEntry(
  id: string,
  input: CreateMemoryInput,
  now: () => string = () => new Date().toISOString(),
): MemoryEntry {
  if (!input.content || input.content.length === 0) {
    throw new Error("createMemoryEntry: content is required");
  }
  const confidence = input.confidence ?? 0.5;
  if (!isValidConfidence(confidence)) {
    throw new Error(`createMemoryEntry: confidence must be in [0, 1], got ${confidence}`);
  }
  const ts = now();
  return {
    id,
    fingerprint: fingerprintId(input.content),
    content: input.content,
    summary: input.summary,
    confidence,
    lifecycle: "active",
    tags: input.tags ?? [],
    scope: input.scope ?? "default",
    metadata: input.metadata ?? {},
    createdAt: ts,
    lastAccessedAt: ts,
    accessCount: 0,
    expiresAt: input.expiresAt,
    relatedIds: [],
    source: input.source,
  };
}

/** Mark an entry as accessed (increments count, updates timestamp, returns new entry). */
export function touchAccess(entry: MemoryEntry, now: () => string = () => new Date().toISOString()): MemoryEntry {
  return {
    ...entry,
    accessCount: entry.accessCount + 1,
    lastAccessedAt: now(),
  };
}

/** Compute effective score for ranking (confidence × freshness). */
export function effectiveScore(entry: MemoryEntry, now: () => string = () => new Date().toISOString()): number {
  if (isTerminal(entry.lifecycle)) return 0;
  const ts = new Date(now()).getTime();
  const last = new Date(entry.lastAccessedAt).getTime();
  const ageMs = Math.max(0, ts - last);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const freshness = 1 / (1 + ageDays / 30);  // half-life ~30 days
  return entry.confidence * freshness;
}
