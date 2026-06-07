/**
 * Memory Orchestrator — final integration engine (V30/30)
 *
 * Wires together L0-L4 + crystallize + hybrid search + audit + retention.
 * Computes a single `mastery` metric summarizing the health of the entire
 * memory subsystem, with weighted contributions from each layer.
 *
 *   mastery = 0.20 * l0Health
 *           + 0.10 * l1Health
 *           + 0.25 * l2Health
 *           + 0.25 * l3Health
 *           + 0.10 * l4Health
 *           + 0.10 * crystallizeHealth
 *
 * Each `*Health` is 0..1.
 */

import { MemoryKV } from "./kv.js";
import { MetaRulesEngine } from "./l0-rules.js";
import { InsightIndex } from "./l1-insight.js";
import { GlobalFactsStore } from "./l2-facts.js";
import { TaskSkillsStore } from "./l3-skills.js";
import { SessionArchive } from "./l4-sessions.js";
import { LessonStore } from "./lesson-store.js";
import { AuditLog } from "./audit.js";

export interface OrchestratorState {
  kv: MemoryKV;
  l0: MetaRulesEngine;
  l1: InsightIndex;
  l2: GlobalFactsStore;
  l3: TaskSkillsStore;
  l4: SessionArchive;
  lessons: LessonStore;
  audit: AuditLog;
}

export interface OrchestratorReport {
  mastery: number;
  layerHealth: {
    l0: number;
    l1: number;
    l2: number;
    l3: number;
    l4: number;
    crystallize: number;
  };
  stats: {
    memories: number;
    rules: number;
    insights: number;
    facts: number;
    skills: number;
    sessions: number;
    lessons: number;
    auditEntries: number;
  };
  recommendations: string[];
}

const WEIGHTS = {
  l0: 0.20,
  l1: 0.10,
  l2: 0.25,
  l3: 0.25,
  l4: 0.10,
  crystallize: 0.10,
} as const;

export class MemoryOrchestrator {
  state: OrchestratorState;

  constructor(state: OrchestratorState) {
    this.state = state;
  }

  /** l0Health: fraction of rules that are valid (always 1 if any rules). */
  l0Health(): number {
    const n = this.state.l0.size();
    if (n === 0) return 0;
    return 1;
  }

  /** l1Health: insights / (skills × 3) — saturated when 3+ insights per skill. */
  l1Health(): number {
    const skills = this.state.l3.size();
    if (skills === 0) return 0;
    const insights = this.state.l1.total();
    return Math.min(1, insights / (skills * 3));
  }

  /** l2Health: facts / 10, capped at 1. */
  l2Health(): number {
    return Math.min(1, this.state.l2.size() / 10);
  }

  /** l3Health: skills / 5, capped at 1. */
  l3Health(): number {
    return Math.min(1, this.state.l3.size() / 5);
  }

  /** l4Health: sessions / 5, capped at 1. */
  l4Health(): number {
    return Math.min(1, this.state.l4.size() / 5);
  }

  /** crystallizeHealth: lessons / sessions, capped at 1. */
  crystallizeHealth(): number {
    const sessions = this.state.l4.size();
    if (sessions === 0) return this.state.lessons.size() > 0 ? 1 : 0;
    return Math.min(1, this.state.lessons.size() / sessions);
  }

  mastery(): number {
    return (
      WEIGHTS.l0 * this.l0Health() +
      WEIGHTS.l1 * this.l1Health() +
      WEIGHTS.l2 * this.l2Health() +
      WEIGHTS.l3 * this.l3Health() +
      WEIGHTS.l4 * this.l4Health() +
      WEIGHTS.crystallize * this.crystallizeHealth()
    );
  }

  stats(): OrchestratorReport["stats"] {
    return {
      memories: this.state.kv.size(),
      rules: this.state.l0.size(),
      insights: this.state.l1.total(),
      facts: this.state.l2.size(),
      skills: this.state.l3.size(),
      sessions: this.state.l4.size(),
      lessons: this.state.lessons.size(),
      auditEntries: this.state.audit.size(),
    };
  }

  recommendations(): string[] {
    const out: string[] = [];
    const s = this.stats();
    if (s.rules === 0) out.push("Define at least one L0 meta rule (red-line constraints).");
    if (s.skills > 0 && s.insights < s.skills) {
      out.push(`Add L1 insights for ${s.skills - s.insights} skills missing routing.`);
    }
    if (s.facts < 5) out.push("Capture more L2 global facts (user prefs, env config).");
    if (s.skills < 3) out.push("Crystallize at least 3 reusable L3 skills.");
    if (s.sessions < 3) out.push("Archive at least 3 L4 session records for replay.");
    if (s.lessons === 0 && s.sessions >= 3) {
      out.push("Run auto-crystallize to distill L4 sessions into L3 lessons.");
    }
    if (s.auditEntries === 0) out.push("Enable audit logging for full traceability.");
    return out;
  }

  report(): OrchestratorReport {
    return {
      mastery: this.mastery(),
      layerHealth: {
        l0: this.l0Health(),
        l1: this.l1Health(),
        l2: this.l2Health(),
        l3: this.l3Health(),
        l4: this.l4Health(),
        crystallize: this.crystallizeHealth(),
      },
      stats: this.stats(),
      recommendations: this.recommendations(),
    };
  }

  /** Initialize with a fresh empty state. */
  static createEmpty(): MemoryOrchestrator {
    return new MemoryOrchestrator({
      kv: new MemoryKV(),
      l0: new MetaRulesEngine(),
      l1: new InsightIndex(),
      l2: new GlobalFactsStore(),
      l3: new TaskSkillsStore(),
      l4: new SessionArchive(),
      lessons: new LessonStore(),
      audit: new AuditLog(),
    });
  }
}
