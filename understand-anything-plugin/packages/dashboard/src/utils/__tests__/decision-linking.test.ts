/**
 * Cross-node decision linking — V20 tests
 *
 * Covers V16 (decision-linking helpers), V17 (index building), V18 (timeline
 * bucketing), V19 (NodeWhyPanel data path).
 */
import { describe, it, expect } from "vitest";
import {
  decisionToNodes,
  buildNodeToDecisionsIndex,
  decisionsForNode,
  findDanglingDecisions,
  groupDecisionsBySource,
} from "../decision-linking";
import { buildTimeline } from "../../components/DecisionTimeline";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

const d1: ArchitectureDecisionRecord = {
  id: "adr:1",
  title: "A",
  status: "accepted",
  context: "",
  decision: "A",
  consequences: { positive: [], negative: [] },
  alternatives: [],
  date: "2026-04-15T00:00:00Z",
  source: "git-commit",
  tags: [],
  linkedNodeIds: ["file:a.ts", "file:b.ts"],
  complexity: "simple",
};
const d2: ArchitectureDecisionRecord = {
  id: "adr:2",
  title: "B",
  status: "accepted",
  context: "",
  decision: "B",
  consequences: { positive: [], negative: [] },
  alternatives: [],
  date: "2026-05-01T00:00:00Z",
  source: "code-comment",
  tags: [],
  linkedNodeIds: ["file:b.ts", "file:c.ts"],
  complexity: "simple",
};
const d3: ArchitectureDecisionRecord = {
  id: "adr:3",
  title: "C",
  status: "proposed",
  context: "",
  decision: "C",
  consequences: { positive: [], negative: [] },
  alternatives: [],
  date: "2026-05-20T00:00:00Z",
  source: "manual",
  tags: [],
  linkedNodeIds: [],
  complexity: "simple",
};

describe("V16 — decisionToNodes", () => {
  it("returns the linkedNodeIds list as-is", () => {
    expect(decisionToNodes(d1)).toEqual(["file:a.ts", "file:b.ts"]);
  });
  it("returns [] for decisions with no links", () => {
    expect(decisionToNodes(d3)).toEqual([]);
  });
});

describe("V16 — buildNodeToDecisionsIndex", () => {
  it("maps each nodeId to all referencing decisions", () => {
    const idx = buildNodeToDecisionsIndex([d1, d2, d3]);
    expect(idx.get("file:a.ts")).toEqual([d1]);
    expect(idx.get("file:b.ts")).toEqual([d1, d2]);
    expect(idx.get("file:c.ts")).toEqual([d2]);
    expect(idx.has("file:nope")).toBe(false);
  });
  it("preserves insertion order", () => {
    const idx = buildNodeToDecisionsIndex([d2, d1]); // d2 first now
    expect(idx.get("file:b.ts")).toEqual([d2, d1]);
  });
  it("handles empty input", () => {
    expect(buildNodeToDecisionsIndex([]).size).toBe(0);
  });
});

describe("V16 — decisionsForNode", () => {
  it("returns the index entry, [] for missing keys", () => {
    const idx = buildNodeToDecisionsIndex([d1, d2]);
    expect(decisionsForNode("file:a.ts", idx)).toEqual([d1]);
    expect(decisionsForNode("file:nope", idx)).toEqual([]);
  });
});

describe("V16 — findDanglingDecisions", () => {
  it("flags decisions whose linkedNodeIds are not in validNodeIds", () => {
    const valid = new Set(["file:a.ts"]);
    const dangles = findDanglingDecisions([d1, d2, d3], valid);
    // d1 has a.ts (valid) + b.ts (dangling) → flagged
    // d2 has b.ts + c.ts (both dangling) → flagged
    // d3 has no links → not flagged
    expect(dangles).toHaveLength(2);
    const ids = dangles.map((d) => d.decision.id).sort();
    expect(ids).toEqual(["adr:1", "adr:2"]);
    // Verify the specific dangling ids
    const d1Entry = dangles.find((d) => d.decision.id === "adr:1")!;
    expect(d1Entry.dangling).toEqual(["file:b.ts"]);
    const d2Entry = dangles.find((d) => d.decision.id === "adr:2")!;
    expect(d2Entry.dangling.sort()).toEqual(["file:b.ts", "file:c.ts"]);
  });
  it("returns [] when all links resolve", () => {
    const valid = new Set(["file:a.ts", "file:b.ts", "file:c.ts"]);
    expect(findDanglingDecisions([d1, d2, d3], valid)).toEqual([]);
  });
  it("ignores decisions with no links", () => {
    const valid = new Set<string>();
    // d3 has no linkedNodeIds so it's not flagged
    expect(findDanglingDecisions([d3], valid)).toEqual([]);
  });
  it("correctly separates mix of valid and dangling", () => {
    const valid = new Set(["file:a.ts", "file:b.ts"]);
    const dangles = findDanglingDecisions([d1], valid);
    expect(dangles).toEqual([]); // all of d1's links are valid
  });
});

describe("V16 — groupDecisionsBySource", () => {
  it("groups by source field, preserving order", () => {
    const groups = groupDecisionsBySource([d1, d2, d3]);
    expect(groups.get("git-commit")).toEqual([d1]);
    expect(groups.get("code-comment")).toEqual([d2]);
    expect(groups.get("manual")).toEqual([d3]);
  });
  it("returns empty map for empty input", () => {
    expect(groupDecisionsBySource([]).size).toBe(0);
  });
});

describe("V18 — buildTimeline", () => {
  it("buckets by year-month", () => {
    const ms = buildTimeline([d1, d2, d3]);
    expect(ms).toHaveLength(2);
    expect(ms[0].yearMonth).toBe("2026-04");
    expect(ms[0].decisions).toEqual([d1]);
    expect(ms[1].yearMonth).toBe("2026-05");
    expect(ms[1].decisions).toEqual([d2, d3]); // sorted ascending by date
  });
  it("returns [] for empty input", () => {
    expect(buildTimeline([])).toEqual([]);
  });
  it("bucketing handles missing dates as 'unknown'", () => {
    const dNoDate: ArchitectureDecisionRecord = {
      ...d1,
      id: "adr:nd",
      date: "",
    };
    const ms = buildTimeline([dNoDate]);
    expect(ms[0].yearMonth).toBe("unknown");
    expect(ms[0].label).toBe("Unknown");
  });
  it("preserves chronological order across months", () => {
    const ms = buildTimeline([d2, d1, d3]);
    expect(ms[0].yearMonth).toBe("2026-04");
    expect(ms[1].yearMonth).toBe("2026-05");
    expect(ms[1].decisions[0].id).toBe("adr:2");
    expect(ms[1].decisions[1].id).toBe("adr:3");
  });
});

describe("V19 — NodeWhyPanel data path (V19 logic via helpers)", () => {
  it("returns decisions for the node, grouped by source", () => {
    const idx = buildNodeToDecisionsIndex([d1, d2]);
    const d = decisionsForNode("file:b.ts", idx);
    const g = groupDecisionsBySource(d);
    expect(d).toHaveLength(2);
    expect(g.get("git-commit")).toEqual([d1]);
    expect(g.get("code-comment")).toEqual([d2]);
  });
  it("returns [] for a node with no decisions", () => {
    const idx = buildNodeToDecisionsIndex([d1]);
    expect(decisionsForNode("file:ghost.ts", idx)).toEqual([]);
  });
});
