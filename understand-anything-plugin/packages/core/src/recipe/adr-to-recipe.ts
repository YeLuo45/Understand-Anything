/**
 * ADR → Procedure translator — V2 of Direction C
 *
 * Turns an `ArchitectureDecisionRecord` into a `RecipeManifest` draft.
 * The translation is heuristic:
 *   - title → recipe title
 *   - decision → first step (a "shell" step echoing the decision)
 *   - linkedNodeIds → 1 file-edit step per file (using comment markers)
 *   - tags → recipe tags (plus "from-adr:<id>")
 *
 * The output is a *draft* — the user can edit it before running.
 */
import type { ArchitectureDecisionRecord } from "../types.js";
import {
  recipeId,
  type RecipeManifest,
  type Step,
  type Variable,
} from "./recipe-schema.js";

/** Build a draft RecipeManifest from an ADR. */
export function adrToRecipe(adr: ArchitectureDecisionRecord): RecipeManifest {
  const id = recipeId(`adr:${adr.id}:${adr.title}`);
  const baseTags = ["from-adr", `adr:${adr.id}`, ...adr.tags];

  const variables: Variable[] = [];
  // For each linked file, add a file-path variable so the recipe is
  // editable before running (user can override the target).
  const fileVar: Record<string, Variable> = {};
  for (const nid of adr.linkedNodeIds) {
    if (!nid.startsWith("file:")) continue;
    const path = nid.slice(5);
    const v: Variable = {
      id: `FILE_${path.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`,
      label: `File: ${path}`,
      kind: "file-picker",
      defaultValue: path,
      required: true,
    };
    variables.push(v);
    fileVar[nid] = v;
  }

  const steps: Step[] = [];
  // First step: a shell step that echoes the decision (so the user sees
  // it on screen).
  steps.push({
    id: "echo-decision",
    kind: "shell",
    title: `Print decision: ${adr.title}`,
    description: adr.decision.slice(0, 240),
    command: `echo ${shellQuote(`ADR ${adr.id} — ${adr.title}`)}`,
    estimatedSeconds: 1,
  });
  // For each linked file, add a file-edit step with a comment marker.
  for (const nid of adr.linkedNodeIds) {
    if (!nid.startsWith("file:")) continue;
    const v = fileVar[nid];
    if (!v) continue;
    steps.push({
      id: `edit-${nid.replace(/[^a-zA-Z0-9]/g, "_")}`,
      kind: "file-edit",
      title: `Apply change to ${nid}`,
      command: `${v.id}`,
      description: `Mark ${nid} so future agents know which decision it belongs to.`,
      estimatedSeconds: 5,
    });
  }
  // Final step: a test step that asserts no breakage.
  steps.push({
    id: "run-tests",
    kind: "test",
    title: "Run tests",
    command: "pnpm vitest run --reporter=basic",
    estimatedSeconds: 60,
  });

  const complexity: RecipeManifest["complexity"] =
    adr.linkedNodeIds.length > 4
      ? "hard"
      : adr.linkedNodeIds.length > 1
        ? "medium"
        : "easy";

  return {
    id,
    title: `Apply: ${adr.title}`,
    description: `Auto-derived from ADR ${adr.id}: ${adr.decision.slice(0, 120)}`,
    sourceAdrId: adr.id,
    tags: baseTags,
    complexity,
    variables,
    steps,
    createdAt: new Date().toISOString(),
  };
}

/** Quote a string for safe inclusion in a POSIX shell command. */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** V2 — Convert N ADRs to N recipes (1:1 mapping). */
export function adrsToRecipes(
  adrs: ReadonlyArray<ArchitectureDecisionRecord>,
): RecipeManifest[] {
  return adrs.map(adrToRecipe);
}