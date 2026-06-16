/**
 * Recipe Executor — V6 / V7 / V9 of Direction C
 *
 * Runs a RecipeManifest step-by-step, capturing stdout/stderr/exit code
 * per step. Supports:
 *   - Sequential execution (V6)
 *   - Parallel groups via step.parallel === true (V7)
 *   - Conditional execution via step.when (V7)
 *   - Automatic rollback on failure via step.onFailure (V9)
 *
 * The executor is intentionally dependency-free: shell steps call
 * child_process.spawn synchronously (Promise-wrapped). file-edit /
 * test / lint are interpreted as shell commands prefixed with the right
 * runner (e.g. file-edit becomes a `printf >> FILE_PATH`).
 *
 * The state machine is exposed for tests and for the UI (V12).
 */
import { spawn } from "node:child_process";
import { interpolate } from "./variables.js";
import type { RecipeManifest, Step } from "./recipe-schema.js";

/** Status of a step. */
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/** Run state of a single step. */
export interface StepRun {
  step: Step;
  status: StepStatus;
  /** stdout (best-effort, may be truncated for long output). */
  stdout: string;
  stderr: string;
  /** exit code (0 == success). undefined if not yet run. */
  exitCode?: number;
  /** When the step started (epoch ms). */
  startedAt?: number;
  /** When the step finished (epoch ms). */
  finishedAt?: number;
  /** Sub-id of the parent recipe run. */
  parentRecipeId: string;
  /** Index in the recipe's step list. */
  index: number;
  /** If this step was rolled back, the onFailure step's run. */
  rollback?: StepRun;
}

/** Overall run state for a recipe. */
export interface RecipeRun {
  recipeId: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "succeeded" | "failed" | "rolled-back" | "cancelled";
  stepRuns: StepRun[];
  /** The values supplied for variables. */
  variableValues: Record<string, string>;
}

/** Options for `runRecipe`. */
export interface RunOptions {
  variableValues: Record<string, string>;
  env?: Record<string, string>;
  context?: Record<string, string>;
  /** When true, dry-run: validate each step without executing. */
  dryRun?: boolean;
  /** Maximum execution time per step (ms). Default 60_000. */
  perStepTimeoutMs?: number;
}

/** Internal: convert a step into the shell command to spawn. */
function stepToShellCommand(step: Step, resolvedCommand: string): string {
  switch (step.kind) {
    case "file-edit":
      // Use a printf to append a marker comment. (Real implementations
      // would do something smarter, but this is enough for V6 plumbing.)
      return `printf '%s\\n' "// ADR marker for ${resolvedCommand}" >> ${resolvedCommand}`;
    case "shell":
      return resolvedCommand;
    case "git":
      return `git ${resolvedCommand}`;
    case "test":
      return resolvedCommand;
    case "lint":
      return resolvedCommand;
  }
}

/** Run a single shell command and capture stdout/stderr/exit code. */
function runShellCommand(
  command: string,
  options: { timeoutMs: number; cwd?: string; env?: Record<string, string> } = { timeoutMs: 60_000 },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, cwd: options.cwd, env: options.env ?? process.env });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, options.timeoutMs);
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: killed ? -1 : (code ?? -1),
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: -1,
      });
    });
  });
}

/** V7 — Evaluate a `when` expression against the current run state.
 *  Currently supports a tiny grammar:
 *    "true" / "false"             — literal
 *    "status:success" / "status:failed" — overall recipe status
 *    "exit:N"                     — exit code of step N
 *    "var:NAME" / "novar:NAME"     — input variable truthy / missing
 */
export function evaluateWhen(
  expr: string,
  state: { status: string; exitCodes: number[]; variables: Record<string, string> },
): boolean {
  const trimmed = expr.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "status:success") return state.status === "succeeded";
  if (trimmed === "status:failed") return state.status === "failed";
  const exit = trimmed.match(/^exit:(\d+)$/);
  if (exit) return state.exitCodes[Number(exit[1])] === 0;
  if (trimmed.startsWith("var:")) {
    const name = trimmed.slice(4);
    return Boolean(state.variables[name]);
  }
  if (trimmed.startsWith("novar:")) {
    const name = trimmed.slice(6);
    return !state.variables[name];
  }
  // Unknown expression → false (safer than throwing)
  return false;
}

/** V9 — Run the rollback chain for a failed run.
 *  Returns an array of StepRun objects in reverse order of the original
 *  steps. Each rollback step is run in dry-run mode unless `execute` is true.
 */
export async function rollbackRecipe(
  run: RecipeRun,
  execute = false,
): Promise<StepRun[]> {
  const recipe = run.stepRuns.length > 0
    ? null
    : null; // rollback uses step.onFailure rather than a separate array
  const out: StepRun[] = [];
  // Walk stepRuns in REVERSE order; if a step had an onFailure, run it.
  for (let i = run.stepRuns.length - 1; i >= 0; i--) {
    const stepRun = run.stepRuns[i]!;
    if (stepRun.step.onFailure) {
      const rbRun: StepRun = {
        step: stepRun.step.onFailure,
        status: "pending",
        stdout: "",
        stderr: "",
        parentRecipeId: run.recipeId,
        index: i,
      };
      if (execute) {
        const result = await runShellCommand(
          stepToShellCommand(stepRun.step.onFailure, stepRun.step.onFailure.command),
          { timeoutMs: 60_000 },
        );
        rbRun.status = result.exitCode === 0 ? "succeeded" : "failed";
        rbRun.exitCode = result.exitCode;
        rbRun.stdout = result.stdout;
        rbRun.stderr = result.stderr;
        rbRun.startedAt = Date.now();
        rbRun.finishedAt = Date.now();
      } else {
        rbRun.status = "skipped";
      }
      stepRun.rollback = rbRun;
      out.push(rbRun);
    }
  }
  void recipe;
  return out;
}

/** Run a single step (async). */
async function runStep(
  step: Step,
  index: number,
  ctx: { input: Record<string, string>; env?: Record<string, string>; context?: Record<string, string>; dryRun?: boolean; timeoutMs: number },
  recipeId: string,
): Promise<StepRun> {
  const resolved = interpolate(step.command, ctx);
  const run: StepRun = {
    step,
    status: "running",
    stdout: "",
    stderr: "",
    parentRecipeId: recipeId,
    index,
    startedAt: Date.now(),
  };
  if (ctx.dryRun) {
    run.status = "succeeded";
    run.stdout = `[dry-run] would execute: ${stepToShellCommand(step, resolved)}`;
    run.finishedAt = Date.now();
    return run;
  }
  const result = await runShellCommand(stepToShellCommand(step, resolved), {
    timeoutMs: ctx.timeoutMs,
    env: ctx.env,
  });
  run.stdout = result.stdout;
  run.stderr = result.stderr;
  run.exitCode = result.exitCode;
  run.finishedAt = Date.now();
  run.status = result.exitCode === (step.expectedExitCode ?? 0) ? "succeeded" : "failed";
  return run;
}

/** V6/V7/V9 — Run a recipe. Returns the full RecipeRun. */
export async function runRecipe(
  recipe: RecipeManifest,
  options: RunOptions,
): Promise<RecipeRun> {
  const startedAt = Date.now();
  const run: RecipeRun = {
    recipeId: recipe.id,
    startedAt,
    status: "running",
    stepRuns: [],
    variableValues: options.variableValues,
  };
  const ctx = {
    input: options.variableValues,
    env: options.env,
    context: options.context,
    dryRun: options.dryRun,
    timeoutMs: options.perStepTimeoutMs ?? 60_000,
  };
  // Partition steps into sequential waves. A new wave starts whenever a
  // step has parallel:false OR is the last one.
  const waves: Step[][] = [];
  let current: Step[] = [];
  for (const s of recipe.steps) {
    current.push(s);
    if (!s.parallel) {
      waves.push(current);
      current = [];
    }
  }
  if (current.length > 0) waves.push(current);
  const exitCodes: number[] = [];
  for (const wave of waves) {
    // V7 — Evaluate `when` for each step in the wave; skip when false.
    const eligible = wave.filter((s) =>
      s.when
        ? evaluateWhen(s.when, {
            status: run.status,
            exitCodes,
            variables: options.variableValues,
          })
        : true,
    );
    const skipped = wave.filter(
      (s) => s.when && !eligible.includes(s),
    );
    for (const s of skipped) {
      run.stepRuns.push({
        step: s,
        status: "skipped",
        stdout: `[skipped] when="${s.when}"`,
        stderr: "",
        parentRecipeId: recipe.id,
        index: run.stepRuns.length,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });
    }
    const promises = eligible.map((step, i) =>
      runStep(step, run.stepRuns.length + i, ctx, recipe.id),
    );
    const results = await Promise.all(promises);
    run.stepRuns.push(...results);
    for (const r of results) {
      exitCodes.push(r.exitCode ?? -1);
      if (r.status === "failed") {
        run.status = "failed";
        run.finishedAt = Date.now();
        // V9 — automatically run rollback
        const rbRuns = await rollbackRecipe(run, !options.dryRun);
        if (rbRuns.length > 0 && rbRuns.every((rb) => rb.status === "succeeded")) {
          run.status = "rolled-back";
        }
        return run;
      }
    }
  }
  run.status = "succeeded";
  run.finishedAt = Date.now();
  return run;
}