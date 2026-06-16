/**
 * AGENTS.md tests — V13 + V14 of Direction B
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderAdrSection, renderAgentsMd, writeAgentsMd } from "../agents-md";
import type { ArchitectureDecisionRecord } from "../../types";

const ZOD: ArchitectureDecisionRecord = {
  id: "adr:1",
  title: "Use Zod for runtime validation",
  status: "accepted",
  context: "We need runtime validation for external API payloads.",
  decision: "Adopt Zod 3.x as the single source of truth for runtime schemas.",
  consequences: { positive: ["Type-safe"], negative: ["+50KB"] },
  alternatives: [
    { name: "Yup", whyRejected: "Worse TS DX", pros: [], cons: [] },
  ],
  date: "2026-06-14",
  source: "git-commit",
  tags: ["validation"],
  linkedNodeIds: ["file:src/schema.ts"],
  complexity: "moderate",
  tradeoffScore: 0.7,
};

const VITE: ArchitectureDecisionRecord = {
  id: "adr:2",
  title: "Adopt Vite for dev server",
  status: "accepted",
  context: "Slow Webpack HMR",
  decision: "Migrate to Vite",
  consequences: { positive: ["10x HMR"], negative: [] },
  alternatives: [],
  date: "2026-05-20",
  source: "git-commit",
  tags: ["build"],
  linkedNodeIds: ["file:vite.config.ts"],
  complexity: "moderate",
  tradeoffScore: 0.85,
};

describe("V13 — renderAdrSection", () => {
  it("renders the title as a heading", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toMatch(/^###\s+Use Zod/);
  });
  it("includes status / source / date metadata", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toContain("**Status**: `accepted`");
    expect(md).toContain("**Source**: `git-commit`");
    expect(md).toContain("**Date**: 2026-06-14");
  });
  it("includes tradeoff when present", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toContain("**Tradeoff**: 0.70");
  });
  it("omits tradeoff when undefined", () => {
    const d: ArchitectureDecisionRecord = { ...ZOD, tradeoffScore: undefined };
    const md = renderAdrSection(d);
    expect(md).not.toContain("**Tradeoff**");
  });
  it("includes context and decision", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toContain("**Context**");
    expect(md).toContain("We need runtime validation");
    expect(md).toContain("**Decision**");
    expect(md).toContain("Adopt Zod 3.x");
  });
  it("lists alternatives", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toContain("**Alternatives considered**");
    expect(md).toContain("**Yup**");
    expect(md).toContain("Worse TS DX");
  });
  it("omits alternatives section when empty", () => {
    const md = renderAdrSection(VITE);
    expect(md).not.toContain("**Alternatives considered**");
  });
  it("lists affects (linked files) with file: prefix stripped", () => {
    const md = renderAdrSection(ZOD);
    expect(md).toContain("**Affects**");
    expect(md).toContain("`src/schema.ts`");
    expect(md).not.toContain("`file:src/schema.ts`");
  });
  it("omits affects section when no links", () => {
    const d: ArchitectureDecisionRecord = { ...ZOD, linkedNodeIds: [] };
    const md = renderAdrSection(d);
    expect(md).not.toContain("**Affects**");
  });
});

describe("V13 — renderAgentsMd", () => {
  it("renders the header with project name and timestamp", () => {
    const md = renderAgentsMd([ZOD, VITE], {
      projectName: "demo",
      generatedAt: "2026-06-14T00:00:00Z",
    });
    expect(md).toContain("# AGENTS.md — demo");
    expect(md).toContain("at 2026-06-14T00:00:00Z");
  });
  it("includes a summary table", () => {
    const md = renderAgentsMd([ZOD, VITE]);
    expect(md).toContain("## Summary");
    expect(md).toContain("| # | Title | Status | Source | Tradeoff |");
    expect(md).toContain("| 1 | Use Zod");
    expect(md).toContain("| 2 | Adopt Vite");
  });
  it("escapes pipe characters in titles", () => {
    const d: ArchitectureDecisionRecord = { ...ZOD, title: "Choose A | B" };
    const md = renderAgentsMd([d]);
    expect(md).toContain("Choose A \\| B");
  });
  it("respects onlySources filter", () => {
    const md = renderAgentsMd([ZOD, VITE], { onlySources: ["manual"] });
    // Both ADRs are git-commit; the filter should drop them.
    expect(md).toContain("No decisions recorded");
  });
  it("respects maxRecords cap", () => {
    const md = renderAgentsMd([ZOD, VITE], { maxRecords: 1 });
    expect(md).toContain("| 1 | Use Zod");
    expect(md).not.toContain("| 2 | Adopt Vite");
  });
  it("renders a friendly empty state when no decisions", () => {
    const md = renderAgentsMd([]);
    expect(md).toContain("No decisions recorded yet");
    expect(md).toContain("/understand-decisions");
  });
  it("includes a Decisions section with one section per ADR", () => {
    const md = renderAgentsMd([ZOD, VITE]);
    const headings = md.match(/^###\s+/gm) ?? [];
    expect(headings).toHaveLength(2);
  });
});

describe("V14 — writeAgentsMd integration", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ua-agents-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes a real file and returns the path + bytes", async () => {
    const out = join(tmp, "AGENTS.md");
    const res = await writeAgentsMd(out, [ZOD, VITE], { projectName: "p" });
    expect(res.path).toBe(out);
    expect(res.bytes).toBeGreaterThan(0);
    const text = await readFile(out, "utf8");
    expect(text).toContain("# AGENTS.md — p");
    expect(text).toContain("Use Zod");
    expect(text).toContain("Adopt Vite");
  });
  it("creates parent directories as needed", async () => {
    const out = join(tmp, "nested", "sub", "AGENTS.md");
    const res = await writeAgentsMd(out, [ZOD]);
    expect(res.path).toBe(out);
  });
  it("overwrites an existing file", async () => {
    const out = join(tmp, "AGENTS.md");
    await writeAgentsMd(out, [ZOD]);
    await writeAgentsMd(out, [VITE]);
    const text = await readFile(out, "utf8");
    expect(text).toContain("Adopt Vite");
    expect(text).not.toContain("Use Zod");
  });
});
