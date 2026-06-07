/**
 * LessonStore — persistence for crystallized lessons (V13/30)
 *
 * Wraps Crystallizer with a queryable index. Supports:
 *   - list by type (lesson / skill / pattern)
 *   - get by id
 *   - version tracking
 *   - basedOn lookup (find all lessons built from a given memoryId)
 */

import { Crystallizer, type Lesson, type LessonType } from "./crystallize.js";
import type { MemoryEntry } from "./schema.js";

export class LessonStore {
  private byId = new Map<string, Lesson>();
  private byMemory = new Map<string, Set<string>>();  // memoryId → lessonIds
  private cry: Crystallizer;

  constructor(cry: Crystallizer = new Crystallizer()) {
    this.cry = cry;
  }

  size(): number {
    return this.byId.size;
  }

  add(lesson: Lesson): void {
    this.byId.set(lesson.id, lesson);
    for (const m of lesson.basedOn) {
      let s = this.byMemory.get(m);
      if (!s) {
        s = new Set();
        this.byMemory.set(m, s);
      }
      s.add(lesson.id);
    }
  }

  crystallizeFromMemories(entries: MemoryEntry[], type: LessonType = "lesson"): Lesson {
    const lesson = this.cry.crystallize(entries, { type });
    this.add(lesson);
    return lesson;
  }

  get(id: string): Lesson | undefined {
    return this.byId.get(id);
  }

  list(type?: LessonType): Lesson[] {
    const all = [...this.byId.values()];
    if (!type) return all;
    return all.filter((l) => l.type === type);
  }

  /** Find all lessons that reference a given memory ID. */
  findByMemoryId(memoryId: string): Lesson[] {
    const ids = this.byMemory.get(memoryId);
    if (!ids) return [];
    return [...ids].map((id) => this.byId.get(id)!).filter(Boolean);
  }

  delete(id: string): boolean {
    const lesson = this.byId.get(id);
    if (!lesson) return false;
    for (const m of lesson.basedOn) {
      const s = this.byMemory.get(m);
      if (s) {
        s.delete(id);
        if (s.size === 0) this.byMemory.delete(m);
      }
    }
    return this.byId.delete(id);
  }

  clear(): void {
    this.byId.clear();
    this.byMemory.clear();
  }
}
