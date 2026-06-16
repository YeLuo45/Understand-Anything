/**
 * Recipe data model — V1 of Direction C (feature/20260616-c)
 *
 * A "Recipe" is a runnable procedure derived from an ADR. Each
 * Recipe contains:
 *   - Metadata (id, title, description, tags, source)
 *   - A list of Variables the user must fill in before running
 *   - A list of Steps (file-edit / shell / git / test / lint)
 *   - An optional rollback chain (Steps to undo, executed in reverse)
 *
 * Procedures can be:
 *   - Auto-derived from ADRs (V2)
 *   - Hand-written by users
 *   - Inferred from commits (V17 — git archaeology)
 */
import { z } from "zod";

/** V3 — Step kind enum. */
export const StepKindSchema = z.enum([
  "file-edit",
  "shell",
  "git",
  "test",
  "lint",
]);
export type StepKind = z.infer<typeof StepKindSchema>;

/** V4 — Variable kind enum. */
export const VariableKindSchema = z.enum([
  "text",
  "dropdown",
  "file-picker",
  "multi-line",
]);
export type VariableKind = z.infer<typeof VariableKindSchema>;

/** V4 — A single variable the user must fill in. */
export interface Variable {
  id: string;
  label: string;
  description?: string;
  kind: VariableKind;
  /** Default value (literal text). May reference other variables via $name. */
  defaultValue?: string;
  /** For dropdown kind: the list of valid choices. */
  options?: string[];
  /** For text / multi-line: regular expression the value must match. */
  pattern?: string;
  /** Whether the variable is required. Default: true. */
  required?: boolean;
}
export const VariableSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: VariableKindSchema,
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  required: z.boolean().optional().default(true),
});

/** V3 — A single step in a recipe. */
export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  description?: string;
  /** For file-edit: target file path. For shell: command. For git: git args. For test/lint: filter. */
  command: string;
  /** Expected exit code (default 0). */
  expectedExitCode?: number;
  /** Whether this step can run in parallel with its siblings. */
  parallel?: boolean;
  /** Conditional: only run if expression evaluates to truthy. */
  when?: string;
  /** On-failure undo step (rolls back this step). */
  onFailure?: Step;
  /** Estimated duration in seconds (for ETA / V14 progress bar). */
  estimatedSeconds?: number;
}
export const StepSchema = z.object({
  id: z.string().min(1),
  kind: StepKindSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  command: z.string().min(1),
  expectedExitCode: z.number().int().optional().default(0),
  parallel: z.boolean().optional().default(false),
  when: z.string().optional(),
  onFailure: z.lazy(() => StepSchema).optional(),
  estimatedSeconds: z.number().int().nonnegative().optional(),
});

/** V1 — The full Recipe / Procedure manifest. */
export interface RecipeManifest {
  id: string;
  title: string;
  description: string;
  /** Original ADR id (if derived from an ADR). */
  sourceAdrId?: string;
  /** Tags for the library search (V16). */
  tags: string[];
  /** "easy" | "medium" | "hard" — coarse difficulty. */
  complexity: "easy" | "medium" | "hard";
  /** Variables to fill in before running. */
  variables: Variable[];
  /** Steps in execution order. */
  steps: Step[];
  /** Optional rollback chain (Steps to undo the procedure). */
  rollback?: Step[];
  /** Author / fork metadata (V18). */
  author?: string;
  /** Parent recipe id if this was forked. */
  forkedFrom?: string;
  /** ISO timestamp. */
  createdAt?: string;
}
export const RecipeManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  sourceAdrId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  complexity: z.enum(["easy", "medium", "hard"]),
  variables: z.array(VariableSchema).default([]),
  steps: z.array(StepSchema).min(1),
  rollback: z.array(StepSchema).optional(),
  author: z.string().optional(),
  forkedFrom: z.string().optional(),
  createdAt: z.string().optional(),
});

/** FNV-1a 8-char hex id from a string. */
export function recipeId(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `recipe:${h.toString(16).padStart(8, "0")}`;
}

/** Validate a recipe manifest; returns [] if ok, error list otherwise. */
export function validateRecipe(r: unknown): string[] {
  const result = RecipeManifestSchema.safeParse(r);
  if (result.success) return [];
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

/** Pretty-print a recipe manifest as a single-line summary. */
export function summarizeRecipe(r: RecipeManifest): string {
  const varCount = r.variables.length;
  const stepCount = r.steps.length;
  const rollback = r.rollback ? ` + ${r.rollback.length} rollback` : "";
  return `[${r.id}] ${r.title} (${varCount} vars, ${stepCount} steps${rollback})`;
}