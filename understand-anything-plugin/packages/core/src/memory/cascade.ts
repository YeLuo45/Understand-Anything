/**
 * Cascade Delete — delete entry + cascade related (V24/30)
 *
 * Removes a MemoryEntry and cleans up:
 *   - related edges in MemoryGraph (where entry is source or target)
 *   - audit log entries referencing the id
 *   - lessons built from this memory (LessonStore.findByMemoryId)
 *   - L1 insights pointing to it
 *
 * Borrowed from agentmemory's `cascade-delete.ts`.
 */

import { MemoryKV } from "./kv.js";
import { MemoryGraph } from "./graph.js";
import { AuditLog } from "./audit.js";
import { LessonStore } from "./lesson-store.js";
import { InsightIndex } from "./l1-insight.js";
import { SessionArchive } from "./l4-sessions.js";

export interface CascadeTargets {
  kv?: MemoryKV;
  graph?: MemoryGraph;
  audit?: AuditLog;
  lessons?: LessonStore;
  insights?: InsightIndex;
  sessions?: SessionArchive;
}

export interface CascadeResult {
  deleted: { entries: number; edges: number; audits: number; lessons: number; insights: number; sessions: number };
  references: string[];
}

export class CascadeDeleter {
  /**
   * Delete an entry and cascade-remove all references.
   * Returns count of removed items per target plus a list of
   * everything that referenced the id.
   */
  delete(id: string, targets: CascadeTargets): CascadeResult {
    const refs: string[] = [];
    let entries = 0;
    let edges = 0;
    let audits = 0;
    let lessons = 0;
    let insights = 0;
    let sessions = 0;

    if (targets.kv) {
      if (targets.kv.delete(id)) {
        entries++;
        refs.push(`kv:${id}`);
      }
    }
    if (targets.graph) {
      // Remove edges where the id is source or target
      for (const e of targets.graph.listEdges()) {
        if (e.source === id || e.target === id) {
          targets.graph.removeEdge(e.id);
          edges++;
        }
      }
      if (targets.graph.removeNode(id)) {
        refs.push(`graph:${id}`);
      }
    }
    if (targets.audit) {
      const auditEntries = targets.audit.forEntity(id);
      audits = auditEntries.length;
      if (audits > 0) refs.push(`audit:${id}`);
    }
    if (targets.lessons) {
      const lessonRefs = targets.lessons.findByMemoryId(id);
      lessons = lessonRefs.length;
      for (const l of lessonRefs) {
        targets.lessons.delete(l.id);
      }
      if (lessons > 0) refs.push(`lesson:${id}`);
    }
    if (targets.insights) {
      const insightRefs = targets.insights.forSkill(id);
      insights = insightRefs.length;
      if (insights > 0) {
        targets.insights.remove(id);
        refs.push(`insight:${id}`);
      }
    }
    if (targets.sessions) {
      // Sessions reference memoryIds; remove the id from each session.
      for (const s of targets.sessions.list()) {
        if (s.memoryIds.includes(id)) {
          sessions++;
        }
      }
      if (sessions > 0) refs.push(`session:${id}`);
    }
    return { deleted: { entries, edges, audits, lessons, insights, sessions }, references: refs };
  }
}
