/**
 * Crystallize Pattern Engine — aggregate memories into structured Lessons (V12/30)
 *
 * Takes a set of related MemoryEntry records and produces a Lesson:
 *   - auto-detects common tags
 *   - extracts a summary from the most-accessed entry
 *   - assigns confidence (mean of source confidences)
 *   - tracks basedOn[] for traceability
 *
 * Borrowed from agentmemory's `crystallize` function.
 */

import type { MemoryEntry } from "./schema.js";

export type LessonType = "lesson" | "skill" | "pattern";

export interface Lesson {
  id: string;
  type: LessonType;
  title: string;
  summary: string;
  content: string;             // structured markdown
  basedOn: string[];           // source memory IDs
  confidence: number;          // 0..1
  tags: string[];
  examples: Example[];
  createdAt: string;
  version: number;             // starts at 1
}

export interface Example {
  memoryId: string;
  excerpt: string;
}

export interface CrystallizeOptions {
  id?: string;
  type?: LessonType;
  title?: string;
  contentTemplate?: (entries: MemoryEntry[], tags: string[]) => string;
  minMemoryCount?: number;
  now?: () => string;
}

export class Crystallizer {
  private now: () => string;
  private counter = 0;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  crystallize(entries: MemoryEntry[], opts: CrystallizeOptions = {}): Lesson {
    const minCount = opts.minMemoryCount ?? 1;
    if (entries.length < minCount) {
      throw new Error(`Need at least ${minCount} memories to crystallize, got ${entries.length}`);
    }
    const tags = this._commonTags(entries);
    const top = this._topByAccess(entries);
    const confidence = this._meanConfidence(entries);
    const title = opts.title ?? this._autoTitle(top, tags);
    const content = opts.contentTemplate
      ? opts.contentTemplate(entries, tags)
      : this._defaultContent(entries, tags);
    this.counter++;
    return {
      id: opts.id ?? `lesson_${this.counter}`,
      type: opts.type ?? "lesson",
      title,
      summary: top.summary ?? top.content.slice(0, 120),
      content,
      basedOn: entries.map((e) => e.id),
      confidence,
      tags,
      examples: entries.slice(0, 5).map((e) => ({ memoryId: e.id, excerpt: e.content.slice(0, 80) })),
      createdAt: this.now(),
      version: 1,
    };
  }

  /** Increment version of an existing lesson (consolidation). */
  consolidate(existing: Lesson, additional: MemoryEntry[]): Lesson {
    const merged: MemoryEntry[] = [
      ...additional,
    ];
    return {
      ...existing,
      basedOn: [...existing.basedOn, ...merged.map((e) => e.id)],
      examples: [
        ...existing.examples,
        ...merged.slice(0, 5).map((e) => ({ memoryId: e.id, excerpt: e.content.slice(0, 80) })),
      ],
      version: existing.version + 1,
    };
  }

  private _commonTags(entries: MemoryEntry[]): string[] {
    if (entries.length === 0) return [];
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    const threshold = Math.ceil(entries.length / 2);
    return [...counts.entries()].filter(([_, n]) => n >= threshold).map(([t]) => t);
  }

  private _topByAccess(entries: MemoryEntry[]): MemoryEntry {
    return [...entries].sort((a, b) => b.accessCount - a.accessCount)[0]!;
  }

  private _meanConfidence(entries: MemoryEntry[]): number {
    if (entries.length === 0) return 0;
    const sum = entries.reduce((s, e) => s + e.confidence, 0);
    return sum / entries.length;
  }

  private _autoTitle(top: MemoryEntry, tags: string[]): string {
    if (tags.length > 0) return `${tags[0]} insight`;
    return top.summary ?? top.content.slice(0, 40);
  }

  private _defaultContent(entries: MemoryEntry[], tags: string[]): string {
    const lines: string[] = [
      `# Lesson from ${entries.length} memories`,
      ``,
      `**Tags**: ${tags.join(", ") || "(none)"}`,
      ``,
      `## Key excerpts`,
    ];
    for (const e of entries.slice(0, 3)) {
      lines.push(`- (${e.id}) ${e.content.slice(0, 100)}`);
    }
    return lines.join("\n");
  }
}
