/**
 * Recipe model tests — V5 of Direction C
 *
 * Covers:
 *  - Zod schema: valid manifests accepted, invalid ones rejected
 *  - ADR → Recipe translation: id is stable, tags include adr:* + from-adr,
 *    every linkedNodeIds becomes a file-edit step + FILE_* variable,
 *    final step is a test step
 *  - Step templates: each kind has a default duration, command validator
 *  - Variables: validation, kind inference, pattern matching, dropdown
 *    membership, multi-line length limit
 *  - Interpolation: $NAME / ${env:NAME} / ${input:NAME} / ${ctx:NAME}
 */
import { describe, it, expect } from "vitest";
import {
  RecipeManifestSchema,
  StepSchema,
  VariableSchema,
  StepKindSchema,
  VariableKindSchema,
  validateRecipe,
  recipeId,
  summarizeRecipe,
  type RecipeManifest,
} from "../recipe-schema";
import { adrToRecipe, adrsToRecipes } from "../adr-to-recipe";
import {
  validateStepCommand,
  withDefaultDuration,
  DEFAULT_DURATION,
} from "../step-templates";
import {
  validateVariable,
  inferKind,
  interpolate,
  validateAllVariables,
} from "../variables";
import type { ArchitectureDecisionRecord } from "../../types";

function makeAdr(overrides: Partial<ArchitectureDecisionRecord> = {}): ArchitectureDecisionRecord {
  return {
    id: "adr:0001",
    title: "Use Zod",
    status: "accepted",
    context: "ctx",
    decision: "Use Zod 3.x for runtime validation.",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "2026-06-14",
    source: "git-commit",
    tags: ["validation"],
    linkedNodeIds: ["file:src/schema.ts", "file:src/index.ts"],
    complexity: "moderate",
    ...overrides,
  };
}

describe("V1 — RecipeManifestSchema", () => {
  it("accepts a minimal valid manifest", () => {
    const r: RecipeManifest = {
      id: "recipe:0001",
      title: "t",
      description: "d",
      tags: [],
      complexity: "easy",
      variables: [],
      steps: [
        { id: "s1", kind: "shell", title: "t", command: "echo hi" },
      ],
    };
    expect(validateRecipe(r)).toEqual([]);
  });
  it("rejects a manifest with no steps", () => {
    const r = {
      id: "recipe:0002",
      title: "t",
      description: "d",
      tags: [],
      complexity: "easy",
      variables: [],
      steps: [],
    };
    expect(validateRecipe(r)).not.toEqual([]);
  });
  it("rejects a manifest with unknown step kind", () => {
    const r = {
      id: "recipe:0003",
      title: "t",
      description: "d",
      tags: [],
      complexity: "easy",
      variables: [],
      steps: [{ id: "s", kind: "unknown", title: "t", command: "x" }],
    };
    expect(validateRecipe(r)).not.toEqual([]);
  });
  it("accepts all 5 step kinds", () => {
    for (const kind of ["file-edit", "shell", "git", "test", "lint"] as const) {
      const r: RecipeManifest = {
        id: `recipe:${kind}`,
        title: "t",
        description: "d",
        tags: [],
        complexity: "easy",
        variables: [],
        steps: [{ id: "s", kind, title: "t", command: "x" }],
      };
      expect(validateRecipe(r)).toEqual([]);
    }
  });
  it("accepts all 4 variable kinds", () => {
    for (const kind of ["text", "dropdown", "file-picker", "multi-line"] as const) {
      const r: RecipeManifest = {
        id: `recipe:${kind}`,
        title: "t",
        description: "d",
        tags: [],
        complexity: "easy",
        variables: [{ id: "v", label: "l", kind }],
        steps: [{ id: "s", kind: "shell", title: "t", command: "x" }],
      };
      expect(validateRecipe(r)).toEqual([]);
    }
  });
  it("accepts a recursive onFailure step (lazy schema)", () => {
    const r = {
      id: "recipe:r",
      title: "t",
      description: "d",
      tags: [],
      complexity: "easy",
      variables: [],
      steps: [
        {
          id: "s1",
          kind: "shell",
          title: "t",
          command: "x",
          onFailure: {
            id: "s2",
            kind: "shell",
            title: "undo",
            command: "undo x",
          },
        },
      ],
    };
    expect(validateRecipe(r)).toEqual([]);
  });
});

describe("V1 — recipeId helper", () => {
  it("returns an 8-char hex after 'recipe:'", () => {
    expect(recipeId("hello")).toMatch(/^recipe:[0-9a-f]{8}$/);
  });
  it("is deterministic", () => {
    expect(recipeId("x")).toBe(recipeId("x"));
  });
  it("differs for different inputs", () => {
    expect(recipeId("a")).not.toBe(recipeId("b"));
  });
});

describe("V1 — summarizeRecipe", () => {
  it("shows var / step counts", () => {
    const r: RecipeManifest = {
      id: "recipe:0001",
      title: "Apply X",
      description: "d",
      tags: [],
      complexity: "easy",
      variables: [{ id: "v1", label: "l", kind: "text" }, { id: "v2", label: "l", kind: "text" }],
      steps: [
        { id: "s1", kind: "shell", title: "t", command: "x" },
        { id: "s2", kind: "test", title: "t", command: "y" },
      ],
    };
    expect(summarizeRecipe(r)).toContain("2 vars");
    expect(summarizeRecipe(r)).toContain("2 steps");
  });
});

describe("V2 — adrToRecipe", () => {
  it("generates a stable recipe id", () => {
    const a = adrToRecipe(makeAdr());
    const b = adrToRecipe(makeAdr());
    expect(a.id).toBe(b.id);
  });
  it("includes the adr id in the tags", () => {
    const r = adrToRecipe(makeAdr({ id: "adr:42" }));
    expect(r.tags).toContain("from-adr");
    expect(r.tags).toContain("adr:adr:42");
  });
  it("creates one file-edit step per linked file", () => {
    const r = adrToRecipe(
      makeAdr({ linkedNodeIds: ["file:a.ts", "file:b.ts"] }),
    );
    const editSteps = r.steps.filter((s) => s.kind === "file-edit");
    expect(editSteps).toHaveLength(2);
  });
  it("creates one FILE_* variable per linked file", () => {
    const r = adrToRecipe(makeAdr({ linkedNodeIds: ["file:src/a.ts"] }));
    expect(r.variables.some((v) => v.id.startsWith("FILE_") && v.kind === "file-picker")).toBe(true);
  });
  it("ends with a test step", () => {
    const r = adrToRecipe(makeAdr());
    expect(r.steps.at(-1)?.kind).toBe("test");
  });
  it("starts with an echo shell step that quotes the title safely", () => {
    const r = adrToRecipe(makeAdr({ title: `it's a "test"` }));
    expect(r.steps[0]!.kind).toBe("shell");
    // Echo command includes the (escaped) title
    expect(r.steps[0]!.command).toContain("ADR adr:0001");
  });
  it("infers complexity from link count", () => {
    expect(adrToRecipe(makeAdr({ linkedNodeIds: [] })).complexity).toBe("easy");
    expect(adrToRecipe(makeAdr({ linkedNodeIds: ["file:a.ts"] })).complexity).toBe("easy");
    expect(adrToRecipe(makeAdr({ linkedNodeIds: ["file:a.ts", "file:b.ts"] })).complexity).toBe("medium");
    expect(
      adrToRecipe(
        makeAdr({ linkedNodeIds: ["file:a.ts", "file:b.ts", "file:c.ts", "file:d.ts", "file:e.ts"] }),
      ).complexity,
    ).toBe("hard");
  });
  it("ignores non-file linkedNodeIds", () => {
    const r = adrToRecipe(
      makeAdr({ linkedNodeIds: ["file:src/a.ts", "module:foo"] }),
    );
    expect(r.variables).toHaveLength(1);
    const editSteps = r.steps.filter((s) => s.kind === "file-edit");
    expect(editSteps).toHaveLength(1);
  });
});

describe("V2 — adrsToRecipes batch", () => {
  it("produces 1 recipe per ADR", () => {
    const recipes = adrsToRecipes([makeAdr({ id: "a" }), makeAdr({ id: "b" })]);
    expect(recipes).toHaveLength(2);
    expect(recipes.map((r) => r.sourceAdrId)).toEqual(["a", "b"]);
  });
  it("returns [] for empty input", () => {
    expect(adrsToRecipes([])).toEqual([]);
  });
});

describe("V3 — StepKindSchema / VariableKindSchema", () => {
  it("StepKindSchema accepts all 5 kinds", () => {
    for (const k of ["file-edit", "shell", "git", "test", "lint"]) {
      expect(StepKindSchema.parse(k)).toBe(k);
    }
  });
  it("StepKindSchema rejects unknown kinds", () => {
    expect(() => StepKindSchema.parse("nope")).toThrow();
  });
  it("VariableKindSchema accepts all 4 kinds", () => {
    for (const k of ["text", "dropdown", "file-picker", "multi-line"]) {
      expect(VariableKindSchema.parse(k)).toBe(k);
    }
  });
  it("VariableKindSchema rejects unknown kinds", () => {
    expect(() => VariableKindSchema.parse("nope")).toThrow();
  });
});

describe("V3 — validateStepCommand", () => {
  it("file-edit requires a path or FILE_ variable", () => {
    expect(
      validateStepCommand({ id: "s", kind: "file-edit", title: "t", command: "x" }),
    ).toHaveLength(1);
    expect(
      validateStepCommand({ id: "s", kind: "file-edit", title: "t", command: "/abs/path" }),
    ).toEqual([]);
    expect(
      validateStepCommand({ id: "s", kind: "file-edit", title: "t", command: "FILE_X" }),
    ).toEqual([]);
  });
  it("git step must start with a known subcommand", () => {
    expect(
      validateStepCommand({ id: "s", kind: "git", title: "t", command: "nope arg" }),
    ).toHaveLength(1);
    expect(
      validateStepCommand({ id: "s", kind: "git", title: "t", command: "commit -m 'x'" }),
    ).toEqual([]);
  });
  it("test/lint must have at least 3 chars", () => {
    expect(
      validateStepCommand({ id: "s", kind: "test", title: "t", command: "x" }),
    ).toHaveLength(1);
    expect(
      validateStepCommand({ id: "s", kind: "test", title: "t", command: "pnpm test" }),
    ).toEqual([]);
  });
});

describe("V3 — DEFAULT_DURATION / withDefaultDuration", () => {
  it("has an entry per kind", () => {
    for (const k of ["file-edit", "shell", "git", "test", "lint"] as const) {
      expect(DEFAULT_DURATION[k]).toBeGreaterThan(0);
    }
  });
  it("applies the default when estimatedSeconds is missing", () => {
    const step = { id: "s", kind: "shell" as const, title: "t", command: "x" };
    const fixed = withDefaultDuration(step);
    expect(fixed.estimatedSeconds).toBe(DEFAULT_DURATION.shell);
  });
  it("does not override an existing estimatedSeconds", () => {
    const step = { id: "s", kind: "shell" as const, title: "t", command: "x", estimatedSeconds: 99 };
    expect(withDefaultDuration(step).estimatedSeconds).toBe(99);
  });
});

describe("V4 — validateVariable", () => {
  it("text without pattern accepts any string", () => {
    expect(
      validateVariable({ id: "v", label: "l", kind: "text" }, "hello"),
    ).toEqual([]);
  });
  it("required variable rejects empty value when no default", () => {
    expect(
      validateVariable({ id: "v", label: "l", kind: "text" }, undefined),
    ).toContain("Variable v is required");
  });
  it("respects default value when value is undefined", () => {
    expect(
      validateVariable(
        { id: "v", label: "l", kind: "text", defaultValue: "d" },
        undefined,
      ),
    ).toEqual([]);
  });
  it("dropdown rejects values not in options", () => {
    const v = {
      id: "v", label: "l", kind: "dropdown" as const,
      options: ["a", "b", "c"],
    };
    expect(validateVariable(v, "x")).toHaveLength(1);
    expect(validateVariable(v, "a")).toEqual([]);
  });
  it("pattern matching works", () => {
    const v = {
      id: "v", label: "l", kind: "text" as const,
      pattern: "^[0-9]+$",
    };
    expect(validateVariable(v, "abc")).toHaveLength(1);
    expect(validateVariable(v, "123")).toEqual([]);
  });
  it("multi-line enforces the 10KB limit", () => {
    const v = { id: "v", label: "l", kind: "multi-line" as const };
    expect(validateVariable(v, "a".repeat(10_001))).toHaveLength(1);
    expect(validateVariable(v, "a".repeat(10_000))).toEqual([]);
  });
  it("text enforces the 1KB limit", () => {
    const v = { id: "v", label: "l", kind: "text" as const };
    expect(validateVariable(v, "a".repeat(1001))).toHaveLength(1);
    expect(validateVariable(v, "a".repeat(1000))).toEqual([]);
  });
});

describe("V4 — inferKind", () => {
  it("multi-line when value contains \\n", () => {
    expect(inferKind("a\nb")).toBe("multi-line");
  });
  it("file-picker when value contains / or \\", () => {
    expect(inferKind("a/b")).toBe("file-picker");
    expect(inferKind("a\\b")).toBe("file-picker");
  });
  it("text otherwise", () => {
    expect(inferKind("abc")).toBe("text");
  });
});

describe("V8 — interpolate (V4 ships the helper, V8 adds tests)", () => {
  it("resolves $NAME against input", () => {
    expect(interpolate("hello $NAME", { input: { NAME: "world" } })).toBe("hello world");
  });
  it("resolves ${env:NAME} against env", () => {
    expect(interpolate("home=$HOME", { input: {}, env: { HOME: "/root" } })).toBe("home=/root");
  });
  it("resolves ${input:NAME}", () => {
    expect(interpolate("name=${input:NAME}", { input: { NAME: "alice" } })).toBe("name=alice");
  });
  it("resolves ${ctx:NAME}", () => {
    expect(interpolate("key=${ctx:KEY}", { input: {}, context: { KEY: "v" } })).toBe("key=v");
  });
  it("falls back to empty string for unknown variable", () => {
    expect(interpolate("hello $UNKNOWN", { input: {} })).toBe("hello ");
  });
  it("handles multiple variables in one string", () => {
    expect(
      interpolate("$A-$B", { input: { A: "x", B: "y" } }),
    ).toBe("x-y");
  });
});

describe("V4 — validateAllVariables", () => {
  it("aggregates errors across all variables", () => {
    const vars = [
      { id: "a", label: "l", kind: "text" as const },
      { id: "b", label: "l", kind: "text" as const },
    ];
    expect(validateAllVariables(vars, {})).toHaveLength(2);
    expect(validateAllVariables(vars, { a: "x", b: "y" })).toEqual([]);
  });
});