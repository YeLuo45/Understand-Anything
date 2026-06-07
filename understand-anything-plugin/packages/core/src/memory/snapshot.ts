/**
 * Snapshot Engine — point-in-time backup (V28/30)
 *
 * Captures a full snapshot of a MemoryKV at a given timestamp.
 * Supports list, get, and restore-to-empty.
 *
 * Borrowed from agentmemory's `snapshot.ts`.
 */

import { MemoryKV } from "./kv.js";
import type { MemoryEntry } from "./schema.js";

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  entries: MemoryEntry[];
  size: number;
}

export interface SnapshotOptions {
  name?: string;
  now?: () => string;
}

export class SnapshotEngine {
  private snapshots = new Map<string, Snapshot>();
  private now: () => string;
  private counter = 0;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  capture(kv: MemoryKV, opts: SnapshotOptions = {}): Snapshot {
    this.counter++;
    const snap: Snapshot = {
      id: `snap_${this.counter}`,
      name: opts.name ?? `snapshot_${this.counter}`,
      createdAt: this.now(),
      entries: kv.list(),
      size: kv.size(),
    };
    this.snapshots.set(snap.id, snap);
    return snap;
  }

  get(id: string): Snapshot | undefined {
    return this.snapshots.get(id);
  }

  list(): Snapshot[] {
    return [...this.snapshots.values()];
  }

  /** Restore snapshot into an empty KV. */
  restore(id: string, target: MemoryKV): number {
    const snap = this.snapshots.get(id);
    if (!snap) return 0;
    target.clear();
    for (const e of snap.entries) {
      target.put({
        id: e.id,
        content: e.content,
        scope: e.scope,
        tags: e.tags,
        metadata: e.metadata,
        summary: e.summary,
        source: e.source,
        confidence: e.confidence,
        expiresAt: e.expiresAt,
      });
    }
    return snap.entries.length;
  }

  delete(id: string): boolean {
    return this.snapshots.delete(id);
  }

  clear(): void {
    this.snapshots.clear();
  }
}
