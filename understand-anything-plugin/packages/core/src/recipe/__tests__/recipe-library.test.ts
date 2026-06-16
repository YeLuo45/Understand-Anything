/**
 * Recipe Library tests — V16 / V17 / V18 / V20 of Direction C
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RecipeLibrary } from "../recipe-library";
import { recipeId } from "../recipe-schema";
import type { RecipeManifest } from "../recipe-schema";
import type { ArchitectureDecisionRecord } from "../../types";

function makeRecipe(overrides: Partial<RecipeManifest> = {}): RecipeManifest {
  return {
    id: `recipe:${Math.random().toString(36).slice(2, 10)}`,
    title: "Test",
    description: "d",
    tags: ["test"],
    complexity: "easy",
    variables: [],
    steps: [{ id: "s1", kind: "shell", title: "t", command: "x" }],
    ...overrides,
  };
}

function makeAdr(overrides: Partial<ArchitectureDecisionRecord> = {}): ArchitectureDecisionRecord {
  return {
    id: "adr:1",
    title: "X",
    status: "accepted",
    context: "ctx",
    decision: "use X",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "2026-06-14",
    source: "git-commit",
    tags: ["foo"],
    linkedNodeIds: ["file:a.ts"],
    complexity: "simple",
    ...overrides,
  };
}

describe("V16 — RecipeLibrary basic ops", () => {
  let lib: RecipeLibrary;
  beforeEach(() => {
    lib = new RecipeLibrary();
  });

  it("starts empty", () => {
    expect(lib.size()).toBe(0);
  });
  it("adds and retrieves a recipe", () => {
    const r = makeRecipe();
    lib.add(r);
    expect(lib.size()).toBe(1);
    expect(lib.get(r.id)?.title).toBe(r.title);
  });
  it("removes a recipe", () => {
    const r = makeRecipe();
    lib.add(r);
    expect(lib.remove(r.id)).toBe(true);
    expect(lib.size()).toBe(0);
  });
  it("returns false when removing a missing recipe", () => {
    expect(lib.remove("nope")).toBe(false);
  });
});

describe("V16 — query: search + filter", () => {
  let lib: RecipeLibrary;
  beforeEach(() => {
    lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "r1", title: "Apply Foo", tags: ["ui"] }));
    lib.add(makeRecipe({ id: "r2", title: "Apply Bar", tags: ["api", "ui"] }));
    lib.add(makeRecipe({ id: "r3", title: "Reset DB", tags: ["db"], complexity: "medium" }));
    lib.add(makeRecipe({ id: "r4", title: "Foo Reset", tags: ["ui"], complexity: "hard" }));
  });

  it("returns all when no filter", () => {
    expect(lib.query()).toHaveLength(4);
  });
  it("filters by free-text query", () => {
    const out = lib.query({ query: "foo" });
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(["r1", "r4"]);
  });
  it("filters by required tags (AND)", () => {
    const out = lib.query({ tags: ["ui", "api"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("r2");
  });
  it("filters by complexity", () => {
    const out = lib.query({ complexity: "hard" });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("r4");
  });
  it("sorts by title", () => {
    const out = lib.query({}, "title");
    expect(out.map((r) => r.title)).toEqual(["Apply Bar", "Apply Foo", "Foo Reset", "Reset DB"]);
  });
  it("sorts by complexity", () => {
    const out = lib.query({}, "complexity");
    expect(out[0]!.id).toBe("r1"); // easy first
    expect(out[out.length - 1]!.id).toBe("r4"); // hard last
  });
  it("sorts by createdAt (default)", () => {
    const lib2 = new RecipeLibrary();
    lib2.add(makeRecipe({ id: "old", createdAt: "2020-01-01" }));
    lib2.add(makeRecipe({ id: "new", createdAt: "2026-01-01" }));
    const out = lib2.query({}, "createdAt");
    expect(out[0]!.id).toBe("old");
    expect(out[1]!.id).toBe("new");
  });
});

describe("V17 — RecipeLibrary.addFromAdr", () => {
  it("builds a recipe from an ADR", () => {
    const lib = new RecipeLibrary();
    const r = lib.addFromAdr(makeAdr());
    expect(r.title).toContain("X");
    expect(r.sourceAdrId).toBe("adr:1");
    expect(lib.size()).toBe(1);
  });
  it("addFromAdrs returns N recipes for N ADRs", () => {
    const lib = new RecipeLibrary();
    const recipes = lib.addFromAdrs([
      makeAdr({ id: "a1" }),
      makeAdr({ id: "a2" }),
      makeAdr({ id: "a3" }),
    ]);
    expect(recipes).toHaveLength(3);
  });
});

describe("V18 — RecipeLibrary.fork", () => {
  it("forks an existing recipe", () => {
    const lib = new RecipeLibrary();
    const parent = makeRecipe({ id: "p1", title: "Original" });
    lib.add(parent);
    const forked = lib.fork("p1", { title: "My fork" }, "alice");
    expect(forked).not.toBeNull();
    expect(forked!.title).toBe("My fork");
    expect(forked!.forkedFrom).toBe("p1");
    expect(forked!.author).toBe("alice");
  });
  it("returns null when parent is missing", () => {
    const lib = new RecipeLibrary();
    expect(lib.fork("nope")).toBeNull();
  });
  it("generates a unique id for the fork", () => {
    const lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "p1" }));
    const a = lib.fork("p1");
    const b = lib.fork("p1");
    expect(a!.id).not.toBe(b!.id);
  });
});

describe("V18 — RecipeLibrary.lineage", () => {
  it("walks back through forks", () => {
    const lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "root", title: "Root" }));
    lib.fork("root", { title: "Fork1" }, "alice");
    const fork2 = lib.fork(
      lib.query({ query: "Fork1" })[0]!.id,
      { title: "Fork2" },
      "bob",
    );
    const chain = lib.lineage(fork2!.id);
    expect(chain.map((r) => r.title)).toEqual(["Root", "Fork1", "Fork2"]);
    expect(chain[0]!.author).toBeUndefined();
    expect(chain[1]!.author).toBe("alice");
    expect(chain[2]!.author).toBe("bob");
  });
  it("returns [self] for a non-forked recipe", () => {
    const lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "lone" }));
    expect(lib.lineage("lone")).toHaveLength(1);
  });
});

describe("V19 — RecipeLibrary.serialize / deserialize", () => {
  it("serializes all recipes to a JSON string", () => {
    const lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "r1" }));
    lib.add(makeRecipe({ id: "r2" }));
    const s = lib.serialize();
    expect(s).toContain("r1");
    expect(s).toContain("r2");
    expect(() => JSON.parse(s)).not.toThrow();
  });
  it("deserializes JSON back into recipes", () => {
    const lib1 = new RecipeLibrary();
    lib1.add(makeRecipe({ id: "r1" }));
    lib1.add(makeRecipe({ id: "r2" }));
    const json = lib1.serialize();

    const lib2 = new RecipeLibrary();
    const count = lib2.deserialize(json);
    expect(count).toBe(2);
    expect(lib2.size()).toBe(2);
  });
  it("deserialize ignores malformed input gracefully", () => {
    const lib = new RecipeLibrary();
    expect(lib.deserialize("not json")).toBe(0);
  });
  it("deserialize handles a non-array recipes field", () => {
    const lib = new RecipeLibrary();
    expect(lib.deserialize(JSON.stringify({ recipes: "not an array" }))).toBe(0);
  });
});

describe("V20 — RecipeLibrary helpers", () => {
  it("uses recipeId() for forked IDs", () => {
    const lib = new RecipeLibrary();
    lib.add(makeRecipe({ id: "p" }));
    const fork = lib.fork("p");
    expect(fork!.id).toMatch(/^recipe:[0-9a-f]{8}$/);
    expect(fork!.id).not.toBe(recipeId("p"));
  });
});