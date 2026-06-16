/**
 * Recipe export — V21 / V22 / V23 of Direction C
 *
 * Render a `RecipeManifest` to a portable artifact:
 *   - V21 — Markdown runbook (variables table + steps + rollback)
 *   - V22 — PR comment snippet ("how was this tested")
 *   - V23 — JSON / YAML serialization for sharing
 *
 * All formats are pure functions of the RecipeManifest; the export
 * target is decided by the caller.
 */
import type { RecipeManifest, Step, Variable } from "./recipe-schema.js";

/** V21 — Render a runbook.md. */
export function recipeToMarkdown(recipe: RecipeManifest): string {
  const lines: string[] = [];
  lines.push(`# Runbook — ${recipe.title}`);
  lines.push("");
  lines.push(`> ${recipe.description}`);
  lines.push("");
  lines.push(`**Complexity**: ${recipe.complexity}`);
  if (recipe.author) lines.push(`**Author**: ${recipe.author}`);
  if (recipe.forkedFrom) lines.push(`**Forked from**: \`${recipe.forkedFrom}\``);
  if (recipe.sourceAdrId) lines.push(`**Source ADR**: ${recipe.sourceAdrId}`);
  if (recipe.createdAt) lines.push(`**Created**: ${recipe.createdAt}`);
  lines.push("");
  lines.push("## Variables");
  lines.push("");
  if (recipe.variables.length === 0) {
    lines.push("_No variables needed._");
  } else {
    lines.push("| ID | Label | Kind | Default | Required |");
    lines.push("|---|---|---|---|---|");
    for (const v of recipe.variables) {
      lines.push(
        `| \`${v.id}\` | ${v.label} | ${v.kind} | ${v.defaultValue ?? "—"} | ${v.required !== false ? "yes" : "no"} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  recipe.steps.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title}`);
    lines.push("");
    lines.push(`- **Kind**: \`${s.kind}\``);
    lines.push(`- **Command**: \`${s.command}\``);
    if (s.expectedExitCode !== undefined) lines.push(`- **Expected exit**: ${s.expectedExitCode}`);
    if (s.parallel) lines.push("- **Parallel**: yes");
    if (s.when) lines.push(`- **When**: \`${s.when}\``);
    if (s.estimatedSeconds !== undefined) lines.push(`- **ETA**: ${s.estimatedSeconds}s`);
    if (s.description) lines.push("");
    lines.push(s.description ?? "");
    if (s.onFailure) {
      lines.push("");
      lines.push(`_Rollback: ${s.onFailure.title} (\`${s.onFailure.command}\`)_`);
    }
    lines.push("");
  });
  if (recipe.rollback && recipe.rollback.length > 0) {
    lines.push("## Rollback");
    lines.push("");
    recipe.rollback.forEach((s, i) => lines.push(`${i + 1}. \`${s.command}\``));
    lines.push("");
  }
  return lines.join("\n");
}

/** V22 — Render a short PR comment snippet. */
export function recipeToPrComment(recipe: RecipeManifest, maxLen = 800): string {
  const summary = `${recipe.title} — ${recipe.steps.length} steps, ${recipe.variables.length} variables`;
  const stepBullets = recipe.steps
    .slice(0, 4)
    .map((s) => `- \`${s.kind}\`: ${s.title}`)
    .join("\n");
  let out = `### 🛠 How was this tested?\n\nApplied the **${summary}** recipe:\n\n${stepBullets}\n`;
  if (recipe.steps.length > 4) out += `- _… and ${recipe.steps.length - 4} more steps_\n`;
  out += `\n_Full runbook available in \`runbook.md` + "`._\n";
  if (out.length > maxLen) {
    out = out.slice(0, maxLen - 3) + "...";
  }
  return out;
}

/** V23 — JSON serialization (canonical). */
export function recipeToJson(recipe: RecipeManifest): string {
  return JSON.stringify(recipe, null, 2);
}

/** V23 — YAML serialization (minimal hand-rolled). Supports: string, number,
 * boolean, null, arrays of primitives, nested objects. Values that aren't
 * primitives get JSON-stringified as a quoted multi-line scalar. */
export function recipeToYaml(recipe: RecipeManifest): string {
  const lines: string[] = [];
  lines.push(`id: ${yamlScalar(recipe.id)}`);
  lines.push(`title: ${yamlScalar(recipe.title)}`);
  lines.push(`description: ${yamlScalar(recipe.description)}`);
  if (recipe.sourceAdrId) lines.push(`sourceAdrId: ${yamlScalar(recipe.sourceAdrId)}`);
  lines.push(`complexity: ${recipe.complexity}`);
  if (recipe.author) lines.push(`author: ${yamlScalar(recipe.author)}`);
  if (recipe.forkedFrom) lines.push(`forkedFrom: ${yamlScalar(recipe.forkedFrom)}`);
  if (recipe.createdAt) lines.push(`createdAt: ${yamlScalar(recipe.createdAt)}`);
  lines.push("tags:");
  for (const t of recipe.tags) lines.push(`  - ${yamlScalar(t)}`);
  lines.push("variables:");
  for (const v of recipe.variables) {
    lines.push(`  - id: ${yamlScalar(v.id)}`);
    lines.push(`    label: ${yamlScalar(v.label)}`);
    if (v.description) lines.push(`    description: ${yamlScalar(v.description)}`);
    lines.push(`    kind: ${v.kind}`);
    if (v.defaultValue) lines.push(`    defaultValue: ${yamlScalar(v.defaultValue)}`);
    if (v.options) {
      lines.push(`    options:`);
      for (const o of v.options) lines.push(`      - ${yamlScalar(o)}`);
    }
    if (v.pattern) lines.push(`    pattern: ${yamlScalar(v.pattern)}`);
    if (v.required === false) lines.push(`    required: false`);
  }
  lines.push("steps:");
  for (const s of recipe.steps) {
    lines.push(`  - id: ${yamlScalar(s.id)}`);
    lines.push(`    kind: ${s.kind}`);
    lines.push(`    title: ${yamlScalar(s.title)}`);
    if (s.description) lines.push(`    description: ${yamlScalar(s.description)}`);
    lines.push(`    command: ${yamlScalar(s.command)}`);
    if (s.expectedExitCode !== undefined && s.expectedExitCode !== 0) lines.push(`    expectedExitCode: ${s.expectedExitCode}`);
    if (s.parallel) lines.push(`    parallel: true`);
    if (s.when) lines.push(`    when: ${yamlScalar(s.when)}`);
    if (s.estimatedSeconds !== undefined) lines.push(`    estimatedSeconds: ${s.estimatedSeconds}`);
    if (s.onFailure) {
      lines.push(`    onFailure:`);
      lines.push(`      id: ${yamlScalar(s.onFailure.id)}`);
      lines.push(`      kind: ${s.onFailure.kind}`);
      lines.push(`      title: ${yamlScalar(s.onFailure.title)}`);
      lines.push(`      command: ${yamlScalar(s.onFailure.command)}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** Quote a YAML string scalar if needed.
 *  - Short identifiers (alphanum, `-`, `_`, `.`, `/`) are emitted bare.
 *  - Anything else gets JSON-quoted (double-quoted string with escapes).
 */
function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9_./\-:]+$/.test(value)) return value;
  return JSON.stringify(value);
}

/** V23 — Parse the JSON form back into a RecipeManifest shape. */
export function recipeFromJson(json: string): RecipeManifest {
  return JSON.parse(json) as RecipeManifest;
}

/** V23 — Group several recipes into a bundle JSON for sharing. */
export function recipeBundleToJson(
  recipes: ReadonlyArray<RecipeManifest>,
): string {
  return JSON.stringify({ recipes: [...recipes] }, null, 2);
}

/** V23 — Parse a bundle back. Returns [] on malformed JSON. */
export function recipeBundleFromJson(json: string): RecipeManifest[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof data === "object" && data !== null && Array.isArray((data as { recipes?: unknown }).recipes)) {
    return (data as { recipes: RecipeManifest[] }).recipes;
  }
  return [];
}

// unused-import warning prevention
void ({} as Step);
void ({} as Variable);