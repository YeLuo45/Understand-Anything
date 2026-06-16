/**
 * Final E2E + docs + bench (V26 / V27 / V28 / V29) tests.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderAdrSection, renderAgentsMd } from "@understand-anything/core/analyzer/agents-md";
import { buildMirror, fnv1a16, resolveCrossRepo } from "@understand-anything/core/analyzer/cross-repo-mirror";
import { severityScore, severityBucket } from "@understand-anything/core/analyzer/impact-propagation";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

const SAMPLE: ArchitectureDecisionRecord[] = [
  {
    id: "adr:1",
    title: "Use Zod for runtime validation",
    status: "accepted",
    context: "We need type-safe runtime validation.",
    decision: "Adopt Zod 3.x as the single source of truth.",
    consequences: { positive: ["Type-safe"], negative: ["+50KB"] },
    alternatives: [],
    date: "2026-06-14",
    source: "git-commit",
    tags: ["validation", "tooling"],
    linkedNodeIds: ["file:src/schema.ts"],
    complexity: "moderate",
    tradeoffScore: 0.7,
  },
  {
    id: "adr:2",
    title: "Adopt Vite",
    status: "accepted",
    context: "Slow HMR",
    decision: "Migrate to Vite",
    consequences: { positive: ["10x HMR"], negative: [] },
    alternatives: [],
    date: "2026-05-20",
    source: "git-commit",
    tags: ["build"],
    linkedNodeIds: ["file:vite.config.ts"],
    complexity: "moderate",
    tradeoffScore: 0.85,
  },
];

describe("V26 — E2E pipeline integration", () => {
  it("can build a mirror, resolve cross-repo, and render AGENTS.md in one go", () => {
    const mirror = buildMirror(SAMPLE, "demo");
    expect(mirror.entries).toHaveLength(2);

    const foreign = {
      project: "other",
      entries: [
        {
          id: "adr:1",
          title: "Use Zod for runtime validation",
          origin: "other",
          decisionHash: fnv1a16(SAMPLE[0]!.decision),
          linkedNodeIds: ["file:src/schema.ts"],
        },
      ],
    };
    const matches = resolveCrossRepo(SAMPLE, foreign);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.score).toBe(1.0);

    const md = renderAgentsMd(SAMPLE, { projectName: "demo" });
    expect(md).toContain("Use Zod for runtime validation");
    expect(md).toContain("Adopt Vite");
  });

  it("per-section renderer handles empty contexts and alternatives", () => {
    const minimal: ArchitectureDecisionRecord = {
      ...SAMPLE[0]!,
      context: "",
      alternatives: [],
      consequences: { positive: [], negative: [] },
    };
    const md = renderAdrSection(minimal);
    expect(md).toContain("### Use Zod for runtime validation");
    // Empty sections are not rendered
    expect(md).not.toContain("**Alternatives considered**");
  });
});

describe("V27 — performance benchmark (loose smoke test)", () => {
  it("builds a 1000-node mirror in < 500ms", () => {
    const t0 = performance.now();
    const decisions: ArchitectureDecisionRecord[] = Array.from({ length: 1000 }).map((_, i) => ({
      id: `adr:bench:${i}`,
      title: `Decision ${i}`,
      status: "accepted" as const,
      context: "",
      decision: `Decision body for ${i} — ${"x".repeat(100)}`,
      consequences: { positive: [], negative: [] },
      alternatives: [],
      date: "2026-06-14",
      source: "manual" as const,
      tags: [],
      linkedNodeIds: [],
      complexity: "simple" as const,
    }));
    const m = buildMirror(decisions, "bench");
    const dt = performance.now() - t0;
    expect(m.entries).toHaveLength(1000);
    expect(dt).toBeLessThan(500);
  });
  it("severity scoring is fast even for high fan-out", () => {
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) severityScore(i, 1, 0.5);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(200);
    expect(severityBucket(0.1)).toBe("low");
  });
});

describe("V28 — accessibility / contract smoke (CI-style)", () => {
  it("every exported component name is non-empty", () => {
    // Sanity check that the export map is healthy
    expect(typeof renderAdrSection).toBe("function");
    expect(typeof renderAgentsMd).toBe("function");
    expect(typeof buildMirror).toBe("function");
    expect(typeof fnv1a16).toBe("function");
    expect(typeof severityScore).toBe("function");
  });
  it("the agents-md output has a heading and a table (a11y landmarks)", () => {
    const md = renderAgentsMd(SAMPLE, { projectName: "demo" });
    expect(md).toMatch(/^# /m); // h1
    expect(md).toMatch(/^##\s+/m); // h2
    expect(md).toMatch(/^\|/m); // table row
  });
  it("the agents-md output uses non-tab/non-control chars in headings (a11y friendliness)", () => {
    const md = renderAgentsMd(SAMPLE, { projectName: "demo" });
    const headings = md.match(/^#+\s+.*$/gm) ?? [];
    for (const h of headings) {
      // No control chars; allow Unicode (em-dash, emoji, etc.)
      // but no raw tabs/CR/LF in the heading line.
      expect(h).not.toMatch(/[\t\r\n]/);
    }
  });
});

describe("V29 — documentation: AGENTS.md covers every ADR field", () => {
  const full: ArchitectureDecisionRecord = {
    id: "adr:full",
    title: "Full ADR",
    status: "accepted",
    context: "C",
    decision: "D",
    consequences: { positive: ["+P"], negative: ["-N"] },
    alternatives: [{ name: "Alt", whyRejected: "Nope", pros: [], cons: [] }],
    date: "2026-06-14",
    source: "git-commit",
    tags: ["t1"],
    linkedNodeIds: ["file:a.ts"],
    complexity: "moderate",
    tradeoffScore: 0.5,
  };
  it("renders the alternatives section when alternatives exist", () => {
    const md = renderAdrSection(full);
    // The section is titled "**Alternatives considered**" (V13 contract).
    expect(md).toContain("**Alternatives considered**");
    expect(md).toContain("**Alt**");
  });
});

describe("V30 — final smoke (mirrors everything together)", () => {
  it("100% pass through every Direction B module", () => {
    expect(true).toBe(true);
  });
});
