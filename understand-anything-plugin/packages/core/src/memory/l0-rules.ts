/**
 * L0 Meta Rules Engine — red-line constraints (V7/30)
 *
 * System-level rules that are always in context. Cannot be removed or
 * overridden by user actions. Borrowed from generic-agent's L0 layer.
 *
 * Rules have:
 *   - id
 *   - description
 *   - check(context) → boolean  (returns true if action is allowed)
 *   - severity: "block" | "warn" | "log"
 */

export type RuleSeverity = "block" | "warn" | "log";

export interface MetaRule {
  id: string;
  description: string;
  severity: RuleSeverity;
  check: (context: Record<string, unknown>) => boolean;
  addedAt: string;
}

export interface RuleViolation {
  ruleId: string;
  severity: RuleSeverity;
  description: string;
  context: Record<string, unknown>;
  ts: string;
}

export class MetaRulesEngine {
  private rules = new Map<string, MetaRule>();
  private now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  add(rule: Omit<MetaRule, "addedAt">): MetaRule {
    const full: MetaRule = { ...rule, addedAt: this.now() };
    this.rules.set(rule.id, full);
    return full;
  }

  remove(id: string): boolean {
    return this.rules.delete(id);
  }

  get(id: string): MetaRule | undefined {
    return this.rules.get(id);
  }

  list(): MetaRule[] {
    return [...this.rules.values()];
  }

  size(): number {
    return this.rules.size;
  }

  validate(context: Record<string, unknown>): RuleViolation[] {
    const violations: RuleViolation[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.check(context)) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          description: rule.description,
          context,
          ts: this.now(),
        });
      }
    }
    return violations;
  }

  /** Returns the first blocking violation, if any. */
  firstBlocker(context: Record<string, unknown>): RuleViolation | undefined {
    return this.validate(context).find((v) => v.severity === "block");
  }
}
