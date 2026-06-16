/**
 * Recipe export tests — V21 / V22 / V23 / V25 of Direction C
 */
import { describe, it, expect } from "vitest";
import {
  recipeToMarkdown,
  recipeToPrComment,
  recipeToJson,
  recipeToYaml,
  recipeFromJson,
  recipeBundleToJson,
  recipeBundleFromJson,
} from "../recipe-export";
import type { RecipeManifest } from "../recipe-schema";

function makeRecipe(overrides: Partial<RecipeManifest> = {}): RecipeManifest {
  return {
    id: "recipe:t1",
    title: "Apply Foo",
    description: "Applies the Foo decision",
    tags: ["foo", "apply"],
    complexity: "medium",
    author: "alice",
    sourceAdrId: "adr:42",
    variables: [
      { id: "FILE", label: "File", kind: "file-picker", defaultValue: "src/foo.ts" },
    ],
    steps: [
      { id: "s1", kind: "shell", title: "Print decision", command: "echo hello" },
      { id: "s2", kind: "file-edit", title: "Edit src/foo.ts", command: "FILE" },
      { id: "s3", kind: "test", title: "Run tests", command: "pnpm test", estimatedSeconds: 30 },
    ],
    ...overrides,
  };
}

describe("V21 — recipeToMarkdown", () => {
  it("starts with a level-1 title", () => {
    const md = recipeToMarkdown(makeRecipe());
    expect(md).toMatch(/^# Runbook/);
    expect(md).toContain("Apply Foo");
  });
  it("includes complexity and author metadata", () => {
    const md = recipeToMarkdown(makeRecipe());
    expect(md).toContain("**Complexity**: medium");
    expect(md).toContain("**Author**: alice");
  });
  it("includes the source ADR link", () => {
    const md = recipeToMarkdown(makeRecipe({ sourceAdrId: "adr:007" }));
    expect(md).toContain("**Source ADR**: adr:007");
  });
  it("renders a variables table", () => {
    const md = recipeToMarkdown(makeRecipe());
    expect(md).toContain("## Variables");
    expect(md).toContain("| ID | Label | Kind | Default | Required |");
    expect(md).toContain("| `FILE` | File | file-picker | src/foo.ts | yes |");
  });
  it("renders a 'no variables' line when empty", () => {
    const md = recipeToMarkdown(makeRecipe({ variables: [] }));
    expect(md).toContain("No variables needed");
  });
  it("renders each step with kind and command", () => {
    const md = recipeToMarkdown(makeRecipe());
    expect(md).toContain("### 1. Print decision");
    expect(md).toContain("### 2. Edit src/foo.ts");
    expect(md).toContain("### 3. Run tests");
    expect(md).toContain("- **Kind**: `shell`");
    expect(md).toContain("- **Command**: `echo hello`");
  });
  it("renders the rollback section when present", () => {
    const md = recipeToMarkdown(
      makeRecipe({
        rollback: [
          { id: "u1", kind: "shell", title: "Undo", command: "echo undo" },
        ],
      }),
    );
    expect(md).toContain("## Rollback");
    expect(md).toContain("`echo undo`");
  });
  it("renders the forkedFrom line when present", () => {
    const md = recipeToMarkdown(makeRecipe({ forkedFrom: "recipe:p" }));
    expect(md).toContain("**Forked from**: `recipe:p`");
  });
});

describe("V22 — recipeToPrComment", () => {
  it("starts with the 'How was this tested?' header", () => {
    const c = recipeToPrComment(makeRecipe());
    expect(c).toMatch(/^### 🛠 How was this tested\?/);
  });
  it("includes the recipe summary line", () => {
    const c = recipeToPrComment(makeRecipe());
    expect(c).toContain("Apply Foo — 3 steps, 1 variables");
  });
  it("lists the first 4 steps", () => {
    const c = recipeToPrComment(makeRecipe());
    expect(c).toContain("`shell`: Print decision");
    expect(c).toContain("`file-edit`: Edit src/foo.ts");
    expect(c).toContain("`test`: Run tests");
  });
  it("truncates after 4 steps", () => {
    const r = makeRecipe({
      steps: Array.from({ length: 10 }).map((_, i) => ({
        id: `s${i}`,
        kind: "shell" as const,
        title: `Step ${i}`,
        command: `echo ${i}`,
      })),
    });
    const c = recipeToPrComment(r);
    expect(c).toContain("… and 6 more steps");
  });
  it("respects the maxLen truncation", () => {
    const c = recipeToPrComment(makeRecipe(), 50);
    expect(c.length).toBeLessThanOrEqual(50);
    expect(c).toContain("...");
  });
});

describe("V23 — recipeToJson / recipeFromJson", () => {
  it("round-trips through JSON", () => {
    const r = makeRecipe();
    const json = recipeToJson(r);
    const back = recipeFromJson(json);
    expect(back).toEqual(r);
  });
  it("is a valid JSON string", () => {
    const json = recipeToJson(makeRecipe());
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("V23 — recipeToYaml", () => {
  it("starts with id and title scalars", () => {
    const yaml = recipeToYaml(makeRecipe());
    expect(yaml).toMatch(/^id: recipe:t1/m);
    // The title contains a space, so YAML will quote it.
    expect(yaml).toMatch(/title: "Apply Foo"/);
  });
  it("renders arrays with the - syntax", () => {
    const yaml = recipeToYaml(makeRecipe({ tags: ["a", "b"] }));
    expect(yaml).toContain("tags:");
    expect(yaml).toContain("  - a");
    expect(yaml).toContain("  - b");
  });
  it("quotes strings with special characters", () => {
    const yaml = recipeToYaml(makeRecipe({ title: "Foo: bar" }));
    expect(yaml).toMatch(/title: "Foo: bar"/);
  });
  it("emits nested variables as a list of maps", () => {
    const yaml = recipeToYaml(makeRecipe());
    expect(yaml).toContain("variables:");
    expect(yaml).toContain("  - id: FILE");
    expect(yaml).toContain("    kind: file-picker");
  });
  it("emits nested steps with onFailure as a sub-map", () => {
    const yaml = recipeToYaml(
      makeRecipe({
        steps: [
          {
            id: "s",
            kind: "shell",
            title: "t",
            command: "x",
            onFailure: {
              id: "u",
              kind: "shell",
              title: "undo",
              command: "undo x",
            },
          },
        ],
      }),
    );
    expect(yaml).toContain("onFailure:");
    expect(yaml).toContain("undo x");
  });
});

describe("V23 — recipeBundleToJson / recipeBundleFromJson", () => {
  it("round-trips a bundle of N recipes", () => {
    const a = makeRecipe({ id: "a" });
    const b = makeRecipe({ id: "b", title: "B" });
    const json = recipeBundleToJson([a, b]);
    const back = recipeBundleFromJson(json);
    expect(back).toHaveLength(2);
    expect(back.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("returns [] for an empty bundle", () => {
    const json = recipeBundleToJson([]);
    expect(recipeBundleFromJson(json)).toEqual([]);
  });
  it("returns [] for malformed input", () => {
    expect(recipeBundleFromJson("{}")).toEqual([]);
    expect(recipeBundleFromJson("not json")).toEqual([]);
  });
});