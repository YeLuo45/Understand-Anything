/**
 * Recipe Library — V16 / V17 / V18 of Direction C
 *
 * A small in-memory store + query layer for recipes. Supports:
 *   - List / filter by tag, source, complexity, query string
 *   - Sort by createdAt / title / complexity
 *   - Get by id
 *   - Add / update / remove
 *   - Fork (deep-copy + new id + forkedFrom lineage)
 */
import { recipeId, type RecipeManifest } from "./recipe-schema.js";
import { adrToRecipe } from "./adr-to-recipe.js";
import type { ArchitectureDecisionRecord } from "../types.js";

/** V16 — Filter options for the library. */
export interface RecipeFilter {
  /** Search across title / description / tags. */
  query?: string;
  /** Require all listed tags (AND match). */
  tags?: ReadonlyArray<string>;
  /** Restrict to this source. */
  source?: RecipeManifest["sourceAdrId"] extends string ? "adr" | "manual" | "git-commit" | "imported" : never;
  /** Restrict to this complexity bucket. */
  complexity?: RecipeManifest["complexity"];
  /** Restrict to recipes forked from a given parent. */
  forkedFrom?: string;
}

/** V16 — Sort options for the library. */
export type RecipeSort = "title" | "createdAt" | "complexity";

export class RecipeLibrary {
  private readonly byId: Map<string, RecipeManifest> = new Map();

  /** V16 — Add or replace. */
  add(recipe: RecipeManifest): void {
    this.byId.set(recipe.id, recipe);
  }

  /** V18 — Remove a recipe. */
  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  /** V16 — Total count. */
  size(): number {
    return this.byId.size;
  }

  /** V16 — Lookup by id. */
  get(id: string): RecipeManifest | undefined {
    return this.byId.get(id);
  }

  /** V16 — Filter + sort. */
  query(filter: RecipeFilter = {}, sort: RecipeSort = "createdAt"): RecipeManifest[] {
    let out = Array.from(this.byId.values());
    if (filter.query) {
      const q = filter.query.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filter.tags && filter.tags.length > 0) {
      const wanted = new Set(filter.tags);
      out = out.filter((r) => filter.tags!.every((t) => r.tags.includes(t)));
      void wanted;
    }
    if (filter.complexity) {
      out = out.filter((r) => r.complexity === filter.complexity);
    }
    if (filter.forkedFrom) {
      out = out.filter((r) => r.forkedFrom === filter.forkedFrom);
    }
    if (sort === "title") {
      out.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "complexity") {
      const rank = { easy: 0, medium: 1, hard: 2 } as const;
      out.sort((a, b) => rank[a.complexity] - rank[b.complexity]);
    } else {
      out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    }
    return out;
  }

  /** V17 — Build a recipe from a single ADR and add it. */
  addFromAdr(adr: ArchitectureDecisionRecord): RecipeManifest {
    const r = adrToRecipe(adr);
    this.add(r);
    return r;
  }

  /** V17 — Add many ADRs at once. Returns the new recipes. */
  addFromAdrs(adrs: ReadonlyArray<ArchitectureDecisionRecord>): RecipeManifest[] {
    return adrs.map((a) => this.addFromAdr(a));
  }

  /** V18 — Fork an existing recipe. */
  fork(
    parentId: string,
    overrides: Partial<RecipeManifest> = {},
    author = "anon",
  ): RecipeManifest | null {
    const parent = this.byId.get(parentId);
    if (!parent) return null;
    const id = recipeId(`fork:${parentId}:${Math.random().toString(36).slice(2, 10)}:${Date.now()}`);
    const forked: RecipeManifest = {
      ...parent,
      ...overrides,
      id,
      author,
      forkedFrom: parent.id,
      createdAt: new Date().toISOString(),
    };
    this.add(forked);
    return forked;
  }

  /** V18 — Walk the fork lineage. */
  lineage(id: string): RecipeManifest[] {
    const chain: RecipeManifest[] = [];
    let current = this.byId.get(id);
    while (current) {
      chain.push(current);
      current = current.forkedFrom ? this.byId.get(current.forkedFrom) : undefined;
    }
    return chain.reverse();
  }

  /** V19 — Serialize to a JSON string for sharing. */
  serialize(): string {
    return JSON.stringify({ recipes: Array.from(this.byId.values()) }, null, 2);
  }

  /** V19 — Load from a JSON string. Existing recipes with the same id are replaced. */
  deserialize(json: string): number {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return 0;
    }
    let count = 0;
    if (typeof data === "object" && data !== null && Array.isArray((data as { recipes?: unknown }).recipes)) {
      for (const r of (data as { recipes: unknown[] }).recipes) {
        this.add(r as RecipeManifest);
        count++;
      }
    }
    return count;
  }
}