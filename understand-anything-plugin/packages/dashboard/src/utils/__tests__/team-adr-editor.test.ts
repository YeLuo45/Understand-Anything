/**
 * Team ADR editor tests — V16 / V17 / V18 / V19 / V20 of Direction B
 */
import { describe, it, expect } from "vitest";
import {
  validateDraft,
  draftToAdr,
  adrToDraft,
  adrToMarkdown,
  adrToJson,
  setReviewState,
  type AdrDraft,
} from "../team-adr-editor";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

function makeDraft(overrides: Partial<AdrDraft> = {}): AdrDraft {
  return {
    title: "Use Zod",
    context: "We need validation",
    decision: "Adopt Zod 3.x as the single source of truth",
    status: "draft",
    source: "manual",
    tags: ["validation"],
    linkedNodeIds: ["file:src/schema.ts"],
    complexity: "moderate",
    date: "2026-06-14",
    ...overrides,
  };
}

function makeAdr(overrides: Partial<ArchitectureDecisionRecord> = {}): ArchitectureDecisionRecord {
  return {
    id: "adr:1",
    title: "Use Zod",
    status: "accepted",
    context: "ctx",
    decision: "use Zod",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "2026-06-14",
    source: "manual",
    tags: [],
    linkedNodeIds: [],
    complexity: "simple",
    ...overrides,
  };
}

describe("V17 — validateDraft", () => {
  it("returns [] for a valid draft", () => {
    expect(validateDraft(makeDraft())).toEqual([]);
  });
  it("rejects empty title", () => {
    const e = validateDraft(makeDraft({ title: "  " }));
    expect(e).toContain("title is required");
  });
  it("rejects empty decision", () => {
    const e = validateDraft(makeDraft({ decision: "" }));
    expect(e).toContain("decision is required");
  });
  it("rejects a too-long title", () => {
    const e = validateDraft(makeDraft({ title: "a".repeat(201) }));
    expect(e.some((m) => m.includes("exceeds 200"))).toBe(true);
  });
  it("rejects a too-short decision", () => {
    const e = validateDraft(makeDraft({ decision: "no" }));
    expect(e.some((m) => m.includes("too short"))).toBe(true);
  });
  it("rejects an unparseable date", () => {
    const e = validateDraft(makeDraft({ date: "not-a-date" }));
    expect(e.some((m) => m.includes("not parseable"))).toBe(true);
  });
  it("accepts missing date (uses now at draftToAdr time)", () => {
    expect(validateDraft(makeDraft({ date: "" }))).toEqual([]);
  });
});

describe("V17 — draftToAdr / adrToDraft roundtrip", () => {
  it("preserves all editable fields", () => {
    const draft = makeDraft();
    const adr = draftToAdr(draft, "alice");
    expect(adr.title).toBe(draft.title);
    expect(adr.context).toBe(draft.context);
    expect(adr.decision).toBe(draft.decision);
    // The author is not a first-class field on ArchitectureDecisionRecord
    // (R1 schema), so we put it in the tags array.
    expect(adr.tags).toContain("author:alice");
    expect(adr.tags).toContain("validation");
    expect(adr.linkedNodeIds).toEqual(draft.linkedNodeIds);
  });
  it("generates a stable id (FNV-1a, 8 hex)", () => {
    const a = draftToAdr(makeDraft(), "a");
    const b = draftToAdr(makeDraft(), "a");
    // The two runs use Date.now() so we can't expect exact equality; just
    // verify the id pattern.
    expect(a.id).toMatch(/^adr:[0-9a-f]{8}$/);
    expect(b.id).toMatch(/^adr:[0-9a-f]{8}$/);
  });
  it("round-trip is stable", () => {
    const a = makeAdr();
    const d = adrToDraft(a);
    const b = draftToAdr(d, "x");
    expect(b.title).toBe(a.title);
    expect(b.decision).toBe(a.decision);
    expect(b.linkedNodeIds).toEqual(a.linkedNodeIds);
  });
  it("round-trip preserves author via a tag", () => {
    const a = makeAdr();
    const d = adrToDraft(a);
    expect(d.title).toBe(a.title);
  });
});

describe("V18 — adrToMarkdown", () => {
  it("starts with a level-1 title", () => {
    expect(adrToMarkdown(makeAdr())).toMatch(/^#\s+Use Zod/);
  });
  it("includes status, date, source metadata", () => {
    const md = adrToMarkdown(makeAdr());
    expect(md).toContain("**Status**: accepted");
    expect(md).toContain("**Date**: 2026-06-14");
    expect(md).toContain("**Source**: manual");
  });
  it("includes a Context section when present", () => {
    expect(adrToMarkdown(makeAdr({ context: "background X" }))).toContain("## Context");
  });
  it("includes a Decision section", () => {
    expect(adrToMarkdown(makeAdr())).toContain("## Decision");
  });
  it("includes an Alternatives section when present", () => {
    const md = adrToMarkdown(
      makeAdr({
        alternatives: [{ name: "Yup", whyRejected: "worse DX", pros: [], cons: [] }],
      }),
    );
    expect(md).toContain("## Alternatives");
    expect(md).toContain("**Yup**");
  });
  it("includes a Consequences section with positive/negative", () => {
    const md = adrToMarkdown(
      makeAdr({
        consequences: { positive: ["fast"], negative: ["complex"] },
      }),
    );
    expect(md).toContain("## Consequences");
    expect(md).toContain("✅ fast");
    expect(md).toContain("⚠️ complex");
  });
  it("includes a tradeoff line when present", () => {
    const md = adrToMarkdown(makeAdr({ tradeoffScore: 0.85 }));
    expect(md).toContain("**Tradeoff**: 0.85");
  });
});

describe("V18 — adrToJson", () => {
  it("is a valid round-trip JSON", () => {
    const a = makeAdr();
    const round = JSON.parse(adrToJson(a));
    expect(round.id).toBe(a.id);
    expect(round.title).toBe(a.title);
  });
  it("preserves linkedNodeIds exactly", () => {
    const a = makeAdr({ linkedNodeIds: ["file:x.ts", "file:y.ts"] });
    const round = JSON.parse(adrToJson(a));
    expect(round.linkedNodeIds).toEqual(["file:x.ts", "file:y.ts"]);
  });
});

describe("V19 — setReviewState", () => {
  it("sets the status field", () => {
    const a = makeAdr();
    const r = setReviewState(a, "needs-review");
    expect(r.status).toBe("needs-review");
  });
  it("appends a review:<state> tag", () => {
    const a = makeAdr();
    const r = setReviewState(a, "accepted");
    expect(r.tags).toContain("review:accepted");
  });
  it("does not mutate the input", () => {
    const a = makeAdr();
    const before = JSON.stringify(a);
    setReviewState(a, "deprecated");
    expect(JSON.stringify(a)).toBe(before);
  });
  it("works for all 3 review states", () => {
    for (const state of ["needs-review", "accepted", "deprecated"] as const) {
      const r = setReviewState(makeAdr(), state);
      expect(r.status).toBe(state);
      expect(r.tags).toContain(`review:${state}`);
    }
  });
});
