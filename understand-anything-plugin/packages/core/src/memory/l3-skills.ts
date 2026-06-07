/**
 * L3 Task Skills / SOPs Engine — reusable workflows (V10/30)
 *
 * Each skill is a complete, self-contained workflow definition:
 *   - id, name, description
 *   - steps: ordered list of named steps
 *   - trigger keywords for L1 routing
 *   - version + useCount for popularity tracking
 *
 * Borrowed from generic-agent's L3 layer (plan_sop, supervisor_sop, etc).
 */

export interface SkillStep {
  order: number;
  name: string;
  description?: string;
  optional?: boolean;
}

export interface TaskSkill {
  id: string;
  name: string;
  description: string;
  steps: SkillStep[];
  triggers: string[];
  version: number;
  useCount: number;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  steps: Omit<SkillStep, "order">[] & { order?: never } | SkillStep[];
  triggers?: string[];
}

export class TaskSkillsStore {
  private byId = new Map<string, TaskSkill>();
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  size(): number {
    return this.byId.size;
  }

  add(input: CreateSkillInput): TaskSkill {
    const id = `skill_${this.byId.size + 1}`;
    const steps: SkillStep[] = (input.steps as SkillStep[]).map((s, i) => ({
      order: s.order ?? i + 1,
      name: s.name,
      description: s.description,
      optional: s.optional,
    })).sort((a, b) => a.order - b.order);
    const skill: TaskSkill = {
      id,
      name: input.name,
      description: input.description,
      steps,
      triggers: input.triggers ?? [],
      version: 1,
      useCount: 0,
      createdAt: this.now(),
    };
    this.byId.set(id, skill);
    return skill;
  }

  get(id: string): TaskSkill | undefined {
    return this.byId.get(id);
  }

  recordUse(id: string): TaskSkill | undefined {
    const skill = this.byId.get(id);
    if (!skill) return undefined;
    const updated: TaskSkill = {
      ...skill,
      useCount: skill.useCount + 1,
      lastUsedAt: this.now(),
    };
    this.byId.set(id, updated);
    return updated;
  }

  /** Find skills by trigger keyword (case-insensitive substring match). */
  findByTrigger(keyword: string): TaskSkill[] {
    const k = keyword.toLowerCase();
    return [...this.byId.values()].filter((s) =>
      s.triggers.some((t) => t.toLowerCase().includes(k)),
    );
  }

  list(): TaskSkill[] {
    return [...this.byId.values()];
  }

  delete(id: string): boolean {
    return this.byId.delete(id);
  }

  clear(): void {
    this.byId.clear();
  }
}
