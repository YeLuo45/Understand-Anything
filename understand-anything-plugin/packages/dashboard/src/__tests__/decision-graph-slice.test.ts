/**
 * WhyView (Direction A — V3 + V4 + V5)
 *
 * Smoke tests:
 *  - Store exposes the new decision-graph slice (V4)
 *  - Default state has decisionGraph=null, selectedDecisionId=null
 *  - Setters work
 *  - DecisionList filtering by source + search
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardStore } from "../store";

function resetStore() {
  useDashboardStore.setState({
    decisionGraph: null,
    selectedDecisionId: null,
    decisionSearchQuery: "",
    decisionSourceFilter: "",
  });
}

const sampleDecision = {
  id: "adr:0001",
  title: "Adopt Zod for runtime validation",
  status: "accepted",
  context: "We need runtime validation for external payloads.",
  decision: "Use Zod 3.x as the single source of truth.",
  consequences: { positive: ["Type-safe"], negative: ["+50KB bundle"] },
  alternatives: [
    { name: "Yup", whyRejected: "Worse TS DX", pros: ["Mature"], cons: ["DX"] },
  ],
  date: "2026-06-14T00:00:00Z",
  source: "manual",
  tags: ["validation"],
  linkedNodeIds: [],
  complexity: "moderate",
  tradeoffScore: 0.7,
};

const secondDecision = {
  ...sampleDecision,
  id: "adr:0002",
  title: "Use Vite for dev server",
  source: "git-commit",
  tags: ["build"],
};

describe("store — decision graph slice (V4)", () => {
  beforeEach(resetStore);

  it("exposes default empty state", () => {
    const s = useDashboardStore.getState();
    expect(s.decisionGraph).toBeNull();
    expect(s.selectedDecisionId).toBeNull();
    expect(s.decisionSearchQuery).toBe("");
    expect(s.decisionSourceFilter).toBe("");
  });

  it("setDecisionGraph assigns the graph", () => {
    const graph = {
      version: "1.0",
      project: { name: "demo", analyzedAt: "2026-06-14T00:00:00Z", gitCommitHash: "x" },
      decisions: [sampleDecision],
    };
    useDashboardStore.getState().setDecisionGraph(graph);
    expect(useDashboardStore.getState().decisionGraph).toEqual(graph);
  });

  it("selectDecision sets the active id", () => {
    useDashboardStore.getState().selectDecision("adr:0001");
    expect(useDashboardStore.getState().selectedDecisionId).toBe("adr:0001");
    useDashboardStore.getState().selectDecision(null);
    expect(useDashboardStore.getState().selectedDecisionId).toBeNull();
  });

  it("setDecisionSearchQuery updates the query", () => {
    useDashboardStore.getState().setDecisionSearchQuery("zod");
    expect(useDashboardStore.getState().decisionSearchQuery).toBe("zod");
  });

  it("setDecisionSourceFilter updates the source filter", () => {
    useDashboardStore.getState().setDecisionSourceFilter("git-commit");
    expect(useDashboardStore.getState().decisionSourceFilter).toBe("git-commit");
    useDashboardStore.getState().setDecisionSourceFilter("");
    expect(useDashboardStore.getState().decisionSourceFilter).toBe("");
  });
});

describe("store — decision graph filtering helpers (consumer logic)", () => {
  beforeEach(resetStore);

  const graph = {
    version: "1.0",
    project: { name: "demo", analyzedAt: "2026-06-14T00:00:00Z", gitCommitHash: "x" },
    decisions: [sampleDecision, secondDecision],
  };

  it("filtering by source reduces the decision list", () => {
    useDashboardStore.getState().setDecisionGraph(graph);
    const all = useDashboardStore.getState().decisionGraph!.decisions;
    const gitOnly = all.filter((d) => d.source === "git-commit");
    expect(gitOnly).toHaveLength(1);
    expect(gitOnly[0].id).toBe("adr:0002");
  });

  it("search by title matches case-insensitively", () => {
    useDashboardStore.getState().setDecisionGraph(graph);
    const all = useDashboardStore.getState().decisionGraph!.decisions;
    const matches = all.filter((d) =>
      d.title.toLowerCase().includes("zod"),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("adr:0001");
  });

  it("filtering by tag returns matching decisions", () => {
    useDashboardStore.getState().setDecisionGraph(graph);
    const all = useDashboardStore.getState().decisionGraph!.decisions;
    const matches = all.filter((d) => d.tags.includes("build"));
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("adr:0002");
  });

  it("tradeoffScore sort descending puts higher score first", () => {
    useDashboardStore.getState().setDecisionGraph({
      ...graph,
      decisions: [
        { ...sampleDecision, tradeoffScore: 0.3 },
        { ...secondDecision, tradeoffScore: 0.9 },
      ],
    });
    const all = useDashboardStore.getState().decisionGraph!.decisions;
    const sorted = [...all].sort(
      (a, b) => (b.tradeoffScore ?? 0) - (a.tradeoffScore ?? 0),
    );
    expect(sorted[0].id).toBe("adr:0002");
    expect(sorted[1].id).toBe("adr:0001");
  });
});
