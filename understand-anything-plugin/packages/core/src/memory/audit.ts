/**
 * Audit Log Engine — JSON Lines structured change log (V14/30)
 *
 * Every mutation in the memory layer appends an AuditEntry. Supports
 * field-level granularity: each field change is one entry.
 *
 * Format (one JSON object per line):
 *   { ts, op, entity, id, field, old, new, actor, checksum_after }
 *
 * Borrowed from agentmemory's audit log design.
 */

export type AuditOperation =
  | "create"
  | "update"
  | "delete"
  | "read"
  | "search"
  | "crystallize"
  | "consolidate"
  | "snapshot"
  | "export"
  | "import"
  | "evict"
  | "restore";

export type EntityType = "memory" | "lesson" | "skill" | "fact" | "rule" | "insight" | "session" | "graph";

export interface AuditEntry {
  ts: string;
  op: AuditOperation;
  entity: EntityType;
  id: string;
  field?: string;
  old?: unknown;
  new?: unknown;
  actor?: string;
  checksum_after?: string;
}

export interface AppendOptions {
  field?: string;
  old?: unknown;
  new?: unknown;
  actor?: string;
  checksum_after?: string;
}

export class AuditLog {
  private entries: AuditEntry[] = [];
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  size(): number {
    return this.entries.length;
  }

  append(op: AuditOperation, entity: EntityType, id: string, opts: AppendOptions = {}): AuditEntry {
    const entry: AuditEntry = {
      ts: this.now(),
      op,
      entity,
      id,
      field: opts.field,
      old: opts.old,
      new: opts.new,
      actor: opts.actor,
      checksum_after: opts.checksum_after,
    };
    this.entries.push(entry);
    return entry;
  }

  /** All entries for a given entity id, in chronological order. */
  forEntity(id: string): AuditEntry[] {
    return this.entries.filter((e) => e.id === id);
  }

  /** All entries of a given operation type. */
  forOp(op: AuditOperation): AuditEntry[] {
    return this.entries.filter((e) => e.op === op);
  }

  /** Most recent N entries (default: all). */
  recent(limit?: number): AuditEntry[] {
    if (!limit) return [...this.entries];
    return this.entries.slice(-limit);
  }

  /** Last entry for a given entity (regardless of op). */
  lastFor(id: string): AuditEntry | undefined {
    let last: AuditEntry | undefined;
    for (const e of this.entries) {
      if (e.id === id) last = e;
    }
    return last;
  }

  /** Serialize to JSON Lines. */
  toJsonl(): string {
    return this.entries.map((e) => JSON.stringify(e)).join("\n");
  }

  /** Restore from JSON Lines. */
  static fromJsonl(jsonl: string, now: () => string = () => new Date().toISOString()): AuditLog {
    const log = new AuditLog(now);
    for (const line of jsonl.split("\n")) {
      if (!line.trim()) continue;
      log.entries.push(JSON.parse(line) as AuditEntry);
    }
    return log;
  }

  clear(): void {
    this.entries = [];
  }
}
