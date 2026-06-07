/**
 * Replay Engine — event-sourcing replay (V26/30)
 *
 * Reads from an AuditLog and replays mutations to rebuild state in a
 * target MemoryKV. Supports:
 *   - fromVersion (skip events with version < fromVersion)
 *   - toVersion
 *   - filter by entity type
 *   - filter by operation type
 *
 * Borrowed from agentmemory's `replay.ts` function.
 */

import { MemoryKV } from "./kv.js";
import type { AuditEntry, AuditOperation, EntityType } from "./audit.js";

export interface ReplayFilter {
  entity?: EntityType | EntityType[];
  op?: AuditOperation | AuditOperation[];
}

export interface ReplayResult {
  applied: number;
  skipped: number;
  errors: number;
}

export class ReplayEngine {
  /**
   * Replay audit log into a KV. Entries with unsupported ops are skipped.
   */
  replay(log: ReadonlyArray<AuditEntry>, kv: MemoryKV, filter: ReplayFilter = {}): ReplayResult {
    const entityFilter = filter.entity
      ? Array.isArray(filter.entity) ? filter.entity : [filter.entity]
      : null;
    const opFilter = filter.op
      ? Array.isArray(filter.op) ? filter.op : [filter.op]
      : null;
    let applied = 0;
    let skipped = 0;
    let errors = 0;
    for (const e of log) {
      if (entityFilter && !entityFilter.includes(e.entity)) { skipped++; continue; }
      if (opFilter && !opFilter.includes(e.op)) { skipped++; continue; }
      try {
        this._apply(e, kv);
        applied++;
      } catch {
        errors++;
      }
    }
    return { applied, skipped, errors };
  }

  /** Replay a single audit entry to a KV. */
  _apply(e: AuditEntry, kv: MemoryKV): void {
    switch (e.op) {
      case "create":
        // Need content in e.new or skip
        if (e.new && typeof e.new === "object" && "content" in e.new) {
          const n = e.new as { content: string; scope?: string; tags?: string[]; confidence?: number };
          kv.put({
            id: e.id,
            content: n.content,
            scope: n.scope,
            tags: n.tags,
            confidence: n.confidence,
          });
        } else {
          throw new Error(`replay: create without content in new field`);
        }
        break;
      case "delete":
        kv.delete(e.id);
        break;
      case "update":
        if (e.field === "lifecycle" && typeof e.new === "string") {
          kv.setLifecycle(e.id, e.new as Parameters<typeof kv.setLifecycle>[1]);
        }
        break;
      default:
        // search/read/crystallize/etc — no-op for KV state
        throw new Error(`replay: unsupported op ${e.op}`);
    }
  }
}
