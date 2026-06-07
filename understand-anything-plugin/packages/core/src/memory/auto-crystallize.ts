/**
 * AutoCrystallizer — auto-distill repeated patterns into L3 SOPs (V29/30)
 *
 * Monitors a MemoryKV and automatically:
 *   - detects clusters of related memories (by shared tags)
 *   - when a cluster reaches threshold size, auto-crystallizes a Lesson
 *   - reports a recommendation (does NOT auto-write, only suggests)
 *
 * Borrowed from agentmemory's `crystallize.ts` with a threshold trigger.
 */

import { MemoryKV } from "./kv.js";
import { Crystallizer, type Lesson, type LessonType } from "./crystallize.js";
import { LessonStore } from "./lesson-store.js";
import type { MemoryEntry } from "./schema.js";

export interface AutoCrystallizeConfig {
  /** Minimum number of memories sharing tags to trigger distillation. */
  threshold: number;
  /** Tags to consider for clustering (others are ignored). */
  watchTags?: string[];
  /** Min confidence average to consider a cluster crystallizable. */
  minAvgConfidence?: number;
  /** Default lesson type. */
  defaultType?: LessonType;
}

export const DEFAULT_AUTO_CONFIG: Required<AutoCrystallizeConfig> = {
  threshold: 3,
  watchTags: [],
  minAvgConfidence: 0.5,
  defaultType: "lesson",
};

export interface ClusterReport {
  tag: string;
  memoryCount: number;
  avgConfidence: number;
  shouldCrystallize: boolean;
  suggestedLesson?: Lesson;
}

export class AutoCrystallizer {
  private config: AutoCrystallizeConfig;
  private cry: Crystallizer;
  private store: LessonStore;

  constructor(store: LessonStore = new LessonStore(), config: AutoCrystallizeConfig = DEFAULT_AUTO_CONFIG) {
    this.config = { ...DEFAULT_AUTO_CONFIG, ...config };
    this.cry = new Crystallizer();
    this.store = store;
  }

  /** Analyze a KV and return a list of cluster reports. */
  analyze(kv: MemoryKV): ClusterReport[] {
    const watch = new Set(this.config.watchTags);
    const clusters = new Map<string, MemoryEntry[]>();
    for (const entry of kv.list()) {
      if (entry.lifecycle !== "active") continue;
      for (const tag of entry.tags) {
        if (watch.size > 0 && !watch.has(tag)) continue;
        const arr = clusters.get(tag) ?? [];
        arr.push(entry);
        clusters.set(tag, arr);
      }
    }
    const reports: ClusterReport[] = [];
    for (const [tag, entries] of clusters) {
      const avgConf = entries.reduce((s, e) => s + e.confidence, 0) / entries.length;
      const should = entries.length >= this.config.threshold && avgConf >= (this.config.minAvgConfidence ?? 0);
      let lesson: Lesson | undefined;
      if (should) {
        lesson = this.cry.crystallize(entries, { type: this.config.defaultType });
      }
      reports.push({
        tag,
        memoryCount: entries.length,
        avgConfidence: avgConf,
        shouldCrystallize: should,
        suggestedLesson: lesson,
      });
    }
    return reports.sort((a, b) => b.memoryCount - a.memoryCount);
  }

  /** Auto-crystallize all clusters that meet the threshold. */
  autoCrystallizeAll(kv: MemoryKV): Lesson[] {
    const reports = this.analyze(kv);
    const out: Lesson[] = [];
    for (const r of reports) {
      if (r.shouldCrystallize && r.suggestedLesson) {
        this.store.add(r.suggestedLesson);
        out.push(r.suggestedLesson);
      }
    }
    return out;
  }

  getStore(): LessonStore {
    return this.store;
  }
}
