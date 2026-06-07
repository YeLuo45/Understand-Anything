/**
 * Export / Import Engine — versioned serialization (V25/30)
 *
 * Exports a MemoryKV (and optionally other stores) to a versioned
 * JSON snapshot. Supports round-trip with version checking.
 *
 * Borrowed from agentmemory's `export-import.ts` function.
 */

import { MemoryKV } from "./kv.js";
import { LessonStore } from "./lesson-store.js";
import type { MemoryEntry } from "./schema.js";
import type { Lesson } from "./crystallize.js";

export const EXPORT_VERSION = "0.9.0";

export const SUPPORTED_VERSIONS: string[] = ["0.9.0"];

export interface ExportData {
  version: string;
  exportedAt: string;
  memories?: MemoryEntry[];
  lessons?: Lesson[];
}

export interface ExportOptions {
  scope?: string;
  includeLessons?: boolean;
  now?: () => string;
}

export class ExportImportEngine {
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  export(kv: MemoryKV, lessons?: LessonStore, opts: ExportOptions = {}): ExportData {
    const filter: { scope?: string } = opts.scope ? { scope: opts.scope } : {};
    return {
      version: EXPORT_VERSION,
      exportedAt: this.now(),
      memories: kv.list(filter),
      lessons: opts.includeLessons ? lessons?.list() : undefined,
    };
  }

  import(kv: MemoryKV, data: ExportData): { memories: number; lessons: number } {
    if (!SUPPORTED_VERSIONS.includes(data.version)) {
      throw new Error(`Unsupported export version: ${data.version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}`);
    }
    let memories = 0;
    let lessons = 0;
    if (data.memories) {
      for (const m of data.memories) {
        // Strip id and let KV regenerate to avoid collisions
        kv.put({
          content: m.content,
          scope: m.scope,
          tags: m.tags,
          metadata: m.metadata,
          summary: m.summary,
          source: m.source,
          confidence: m.confidence,
        });
        memories++;
      }
    }
    // Lesson restore would be handled by caller; we count without restoring here
    if (data.lessons) lessons = data.lessons.length;
    return { memories, lessons };
  }

  toJson(data: ExportData): string {
    return JSON.stringify(data, null, 2);
  }

  fromJson(json: string): ExportData {
    const parsed = JSON.parse(json) as ExportData;
    if (!parsed.version) {
      throw new Error("Import: missing version field");
    }
    if (!SUPPORTED_VERSIONS.includes(parsed.version)) {
      throw new Error(`Import: unsupported version ${parsed.version}`);
    }
    return parsed;
  }
}
