/**
 * Variable system — V4 of Direction C
 *
 * Variables are typed placeholders the user fills in before running a
 * recipe. The system supports 4 input kinds (text / dropdown /
 * file-picker / multi-line) and interpolation via $name or
 * ${kind:name} for resolving against env / input / ctx.
 */
import type { Variable, VariableKind } from "./recipe-schema.js";

/** Validate a variable's value against its kind + constraints. */
export function validateVariable(
  v: Variable,
  value: string | undefined,
): string[] {
  const errors: string[] = [];
  const finalValue = value ?? v.defaultValue;
  if (v.required !== false && (finalValue === undefined || finalValue === "")) {
    errors.push(`Variable ${v.id} is required`);
    return errors;
  }
  if (finalValue === undefined) return errors;
  if (v.kind === "dropdown") {
    if (v.options && !v.options.includes(finalValue)) {
      errors.push(`Variable ${v.id} must be one of: ${v.options.join(", ")}`);
    }
  }
  if (v.pattern) {
    try {
      const re = new RegExp(v.pattern);
      if (!re.test(finalValue)) {
        errors.push(`Variable ${v.id} does not match pattern ${v.pattern}`);
      }
    } catch {
      // invalid pattern — skip silently (user error)
    }
  }
  if (v.kind === "multi-line" && finalValue.length > 10_000) {
    errors.push(`Variable ${v.id} exceeds the 10KB limit`);
  }
  if (v.kind === "text" && finalValue.length > 1_000) {
    errors.push(`Variable ${v.id} exceeds the 1KB text limit`);
  }
  return errors;
}

/** V4 — Detect the variable kind from a value's shape (best-effort). */
export function inferKind(value: string): VariableKind {
  if (value.includes("\n")) return "multi-line";
  if (value.includes("/") || value.includes("\\")) return "file-picker";
  return "text";
}

/** V8 — Resolve a template string against a variable context.
 *  Supports:
 *    $NAME        — input variable (or env as fallback)
 *    ${env:NAME}   — process.env.NAME
 *    ${input:NAME} — input variable (explicit)
 *    ${ctx:NAME}   — context object (caller-supplied)
 *
 *  `input` is the required caller-supplied map; pass {} if there are no
 *  user inputs. `env` defaults to process.env when available.
 */
export function interpolate(
  template: string,
  ctx: {
    input: Record<string, string>;
    env?: Record<string, string>;
    context?: Record<string, string>;
  },
): string {
  const env = ctx.env ?? (typeof process !== "undefined" ? (process.env as Record<string, string>) : {});
  const context = ctx.context ?? {};
  // First: ${kind:NAME} forms
  let out = template.replace(/\$\{(\w+):(\w+)\}/g, (_, kind: string, name: string) => {
    if (kind === "env") return env[name] ?? "";
    if (kind === "input") return ctx.input[name] ?? "";
    if (kind === "ctx") return context[name] ?? "";
    return "";
  });
  // Then: $NAME (word chars only) — input first, env fallback
  out = out.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name: string) =>
    ctx.input[name] ?? env[name] ?? "",
  );
  return out;
}

/** V4 — Validate all variables in a recipe against a value map. */
export function validateAllVariables(
  variables: ReadonlyArray<Variable>,
  values: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const v of variables) {
    errors.push(...validateVariable(v, values[v.id]));
  }
  return errors;
}