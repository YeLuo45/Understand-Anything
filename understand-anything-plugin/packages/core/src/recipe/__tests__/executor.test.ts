/**
 * Recipe executor tests — V6 / V7 / V9 / V10 of Direction C
 */
import { describe, it, expect } from "vitest";
import {
  evaluateWhen,
  runRecipe,
  rollbackRecipe,
  type RecipeRun,
  type RunOptions,
} from "../executor";
import type { RecipeManifest } from "../recipe-schema";

function makeRecipe(overrides: Partial<RecipeManifest> = {}): RecipeManifest {
  return {
    id: "recipe:test",
    title: "Test Recipe",
    description: "d",
    tags: [],
    complexity: "easy",
    variables: [],
    steps: [
      { id: "s1", kind: "shell", title: "echo", command: "echo hello" },
      { id: "s2", kind: "shell", title: "echo2", command: "echo world" },
    ],
    ...overrides,
  };
}

describe("V6 — runRecipe (sequential)", () => {
  it("runs all steps and reports succeeded", async () => {
    const r = await runRecipe(makeRecipe(), { variableValues: {} });
    expect(r.status).toBe("succeeded");
    expect(r.stepRuns).toHaveLength(2);
    expect(r.stepRuns.every((s) => s.status === "succeeded")).toBe(true);
  });
  it("captures stdout per step", async () => {
    const r = await runRecipe(makeRecipe(), { variableValues: {} });
    expect(r.stepRuns[0]!.stdout).toContain("hello");
    expect(r.stepRuns[1]!.stdout).toContain("world");
  });
  it("sets startedAt and finishedAt", async () => {
    const r = await runRecipe(makeRecipe(), { variableValues: {} });
    expect(r.startedAt).toBeGreaterThan(0);
    expect(r.finishedAt).toBeGreaterThan(r.startedAt);
  });
  it("marks failed steps with non-zero exitCode", async () => {
    const recipe = makeRecipe({
      steps: [{ id: "s1", kind: "shell", title: "fails", command: "exit 7" }],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.status).toBe("failed");
    expect(r.stepRuns[0]!.exitCode).toBe(7);
  });
  it("stops running further steps after a failure", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "s1", kind: "shell", title: "fails", command: "exit 1" },
        { id: "s2", kind: "shell", title: "never", command: "echo should-not-run" },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.stepRuns).toHaveLength(1);
    expect(r.status).toBe("failed");
  });
  it("dry-run does not execute but reports succeeded", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "s1", kind: "shell", title: "fails", command: "exit 99" },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {}, dryRun: true });
    expect(r.status).toBe("succeeded");
    expect(r.stepRuns[0]!.stdout).toContain("[dry-run]");
  });
  it("resolves $VAR from variableValues", async () => {
    const recipe = makeRecipe({
      steps: [{ id: "s1", kind: "shell", title: "echo", command: "echo $NAME" }],
    });
    const r = await runRecipe(recipe, { variableValues: { NAME: "alice" } });
    expect(r.stepRuns[0]!.stdout).toContain("alice");
  });
});

describe("V7 — parallel + conditional steps", () => {
  it("runs consecutive parallel:true steps in one wave", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "a", kind: "shell", title: "a", command: "echo a", parallel: true },
        { id: "b", kind: "shell", title: "b", command: "echo b", parallel: true },
        { id: "c", kind: "shell", title: "c", command: "echo c", parallel: true },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.stepRuns).toHaveLength(3);
    expect(r.status).toBe("succeeded");
  });
  it("mixes parallel and sequential waves", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "a", kind: "shell", title: "a", command: "echo a" },
        { id: "b", kind: "shell", title: "b", command: "echo b", parallel: true },
        { id: "c", kind: "shell", title: "c", command: "echo c", parallel: true },
        { id: "d", kind: "shell", title: "d", command: "echo d" },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.stepRuns).toHaveLength(4);
  });
  it("skips steps whose `when` evaluates to false", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "a", kind: "shell", title: "a", command: "echo a" },
        { id: "b", kind: "shell", title: "b", command: "echo b", when: "var:NEVER" },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.stepRuns[1]!.status).toBe("skipped");
    expect(r.stepRuns[1]!.stdout).toContain("[skipped]");
  });
});

describe("V7 — evaluateWhen", () => {
  it("handles true / false", () => {
    expect(evaluateWhen("true", emptyState())).toBe(true);
    expect(evaluateWhen("false", emptyState())).toBe(false);
  });
  it("handles status:success / status:failed", () => {
    expect(evaluateWhen("status:success", { ...emptyState(), status: "succeeded" })).toBe(true);
    expect(evaluateWhen("status:failed", { ...emptyState(), status: "failed" })).toBe(true);
  });
  it("handles exit:N", () => {
    const s = { ...emptyState(), exitCodes: [0, 7] };
    expect(evaluateWhen("exit:0", s)).toBe(true);
    expect(evaluateWhen("exit:1", s)).toBe(false);
  });
  it("handles var:NAME / novar:NAME", () => {
    const s = { ...emptyState(), variables: { X: "yes" } };
    expect(evaluateWhen("var:X", s)).toBe(true);
    expect(evaluateWhen("var:Y", s)).toBe(false);
    expect(evaluateWhen("novar:X", s)).toBe(false);
    expect(evaluateWhen("novar:Y", s)).toBe(true);
  });
  it("returns false for unknown expressions (safe default)", () => {
    expect(evaluateWhen("???", emptyState())).toBe(false);
  });
});

describe("V9 — rollbackRecipe", () => {
  it("returns [] for a run with no onFailure steps", async () => {
    const recipe = makeRecipe();
    const run: RecipeRun = await runRecipe(recipe, { variableValues: {} });
    const rb = await rollbackRecipe(run, false);
    expect(rb).toEqual([]);
  });
  it("runs onFailure in reverse order", async () => {
    const recipe = makeRecipe({
      steps: [
        { id: "s1", kind: "shell", title: "s1", command: "echo 1", onFailure: { id: "u1", kind: "shell", title: "u1", command: "echo u1" } },
        { id: "s2", kind: "shell", title: "s2", command: "echo 2", onFailure: { id: "u2", kind: "shell", title: "u2", command: "echo u2" } },
      ],
    });
    // Manually craft a failed run with both stepRuns marked failed.
    const run = await runRecipe(recipe, { variableValues: {} });
    run.status = "failed";
    run.stepRuns[0]!.status = "failed";
    run.stepRuns[1]!.status = "failed";
    const rb = await rollbackRecipe(run, false);
    expect(rb).toHaveLength(2);
    expect(rb[0]!.step.id).toBe("u2"); // reverse order
    expect(rb[1]!.step.id).toBe("u1");
  });
});

describe("V9 — automatic rollback on failure", () => {
  it("flips status to rolled-back when all onFailures succeed", async () => {
    const recipe = makeRecipe({
      steps: [
        {
          id: "s1",
          kind: "shell",
          title: "fails",
          command: "exit 5",
          onFailure: { id: "u1", kind: "shell", title: "undo", command: "echo undone" },
        },
      ],
    });
    const r = await runRecipe(recipe, { variableValues: {} });
    expect(r.status).toBe("rolled-back");
    expect(r.stepRuns[0]!.rollback?.status).toBe("succeeded");
  });
});

function emptyState() {
  return { status: "succeeded", exitCodes: [] as number[], variables: {} as Record<string, string> };
}