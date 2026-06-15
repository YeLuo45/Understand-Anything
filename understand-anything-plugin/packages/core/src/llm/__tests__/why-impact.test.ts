/**
 * Why Impact tests — V11 / V12 of Direction A R2
 */
import { describe, it, expect } from "vitest";
import {
  scoreStaleness,
  scoreAllStaleness,
  filterStale,
  isStaleScore,
  stalenessBucketFor,
  type StalenessScore,
  type FileChangeInfo,
} from "../why-impact";
import type { ArchitectureDecisionRecord } from "../../types";

const baseDecision: ArchitectureDecisionRecord = {
  id: "adr:0001",
  title: "X",
  status: "accepted",
  context: "",
  decision: "X",
  consequences: { positive: [], negative: [] },
  alternatives: [],
  date: "2026-06-14T00:00:00Z",
  source: "git-commit",
  tags: [],
  linkedNodeIds: [],
  complexity: "simple",
};

function makeInfo(date: string): FileChangeInfo {
  return { nodeId: "x", lastModified: new Date(date).getTime() };
}

describe("V11 — scoreStaleness", () => {
  it("returns 0 for a decision with no linked files", () => {
    const score = scoreStaleness(baseDecision, new Map());
    expect(score.score).toBe(0);
    expect(score.bucket).toBe("fresh");
    expect(score.driftedFiles).toBe(0);
    expect(score.totalFiles).toBe(0);
  });

  it("returns 0 for a fresh decision (file modified before decision)", () => {
    const d = { ...baseDecision, linkedNodeIds: ["file:src/a.ts"] };
    const fps = new Map<string, FileChangeInfo>([
      ["file:src/a.ts", makeInfo("2026-06-13T00:00:00Z")], // before
    ]);
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.score).toBe(0);
    expect(score.bucket).toBe("fresh");
  });

  it("scores 0.3 for a single drifted file", () => {
    const d = { ...baseDecision, linkedNodeIds: ["file:src/a.ts"] };
    const fps = new Map<string, FileChangeInfo>([
      ["file:src/a.ts", makeInfo("2026-06-15T00:00:00Z")], // after
    ]);
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.score).toBe(0.3);
    expect(score.bucket).toBe("aging");
    expect(score.driftedFiles).toBe(1);
  });

  it("scores 0.5 for a missing file (crosses stale threshold)", () => {
    const d = { ...baseDecision, linkedNodeIds: ["file:src/deleted.ts"] };
    const fps = new Map<string, FileChangeInfo>();
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.score).toBe(0.5);
    expect(score.bucket).toBe("stale");
    expect(score.driftedFiles).toBe(1);
    expect(score.reasons.some((r) => r.includes("no longer exists"))).toBe(true);
  });

  it("aggregates drift across multiple files", () => {
    const d = { ...baseDecision, linkedNodeIds: ["a", "b", "c", "d"] };
    const fps = new Map<string, FileChangeInfo>([
      ["a", makeInfo("2026-06-15T00:00:00Z")], // drifted
      ["b", makeInfo("2026-06-15T00:00:00Z")], // drifted
      ["c", makeInfo("2026-06-15T00:00:00Z")], // drifted
      // "d" missing → heaviest
    ]);
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.driftedFiles).toBe(4);
    expect(score.totalFiles).toBe(4);
    expect(score.bucket).not.toBe("fresh");
  });

  it("ancient decision (> 1 year) has at least +0.1", () => {
    const d = {
      ...baseDecision,
      linkedNodeIds: ["file:src/a.ts"],
      date: "2020-01-01T00:00:00Z",
    };
    const fps = new Map<string, FileChangeInfo>();
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.score).toBeGreaterThanOrEqual(0.6); // 0.5 missing + 0.1 age
    expect(score.reasons.some((r) => r.toLowerCase().includes("older than 1 year"))).toBe(true);
  });

  it("caps the score at 1.0", () => {
    const d = {
      ...baseDecision,
      linkedNodeIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    };
    const fps = new Map<string, FileChangeInfo>();
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.score).toBeLessThanOrEqual(1);
  });

  it("reason strings mention each drifted file", () => {
    const d = { ...baseDecision, linkedNodeIds: ["a", "b"] };
    const fps = new Map<string, FileChangeInfo>([
      ["a", makeInfo("2026-06-15T00:00:00Z")],
      ["b", makeInfo("2026-06-15T00:00:00Z")],
    ]);
    const score = scoreStaleness(d, fps, new Date("2026-06-14").getTime());
    expect(score.reasons.some((r) => r.includes("a"))).toBe(true);
    expect(score.reasons.some((r) => r.includes("b"))).toBe(true);
  });
});

describe("V12 — bucketFor", () => {
  it("maps < 0.25 to fresh", () => expect(stalenessBucketFor(0.0)).toBe("fresh"));
  it("maps 0.25..0.5 to aging", () => expect(stalenessBucketFor(0.3)).toBe("aging"));
  it("maps 0.5..0.8 to stale", () => expect(stalenessBucketFor(0.6)).toBe("stale"));
  it("maps ≥ 0.8 to ancient", () => expect(stalenessBucketFor(0.9)).toBe("ancient"));
});

describe("V12 — scoreAllStaleness", () => {
  it("returns [] for empty input", () => {
    expect(scoreAllStaleness([], new Map())).toEqual([]);
  });
  it("returns scores sorted descending", () => {
    const ds: ArchitectureDecisionRecord[] = [
      { ...baseDecision, id: "a", linkedNodeIds: ["a"] },         // missing → 0.5
      { ...baseDecision, id: "b", linkedNodeIds: ["b"] },         // fresh → 0
      { ...baseDecision, id: "c", linkedNodeIds: ["c"] },         // missing → 0.5
    ];
    const fps = new Map<string, FileChangeInfo>([
      ["b", makeInfo("2026-06-13T00:00:00Z")], // b is fresh
    ]);
    const scores = scoreAllStaleness(ds, fps);
    expect(scores[0].decisionId === "a" || scores[0].decisionId === "c").toBe(true);
    expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
    expect(scores[1].score).toBeGreaterThanOrEqual(scores[2].score);
    expect(scores[2].score).toBe(0);
  });
  it("respects the `now` injection for deterministic tests", () => {
    const fixedNow = new Date("2026-06-14").getTime();
    const d = { ...baseDecision, date: "2020-01-01T00:00:00Z", linkedNodeIds: ["a"] };
    const scores = scoreAllStaleness([d], new Map(), fixedNow);
    expect(scores[0].score).toBeGreaterThanOrEqual(0.6);
  });
});

describe("V12 — isStale", () => {
  it("returns true for stale bucket", () => {
    const s: StalenessScore = {
      decisionId: "x", score: 0.6, bucket: "stale", reasons: [], driftedFiles: 1, totalFiles: 1,
    };
    expect(isStaleScore(s)).toBe(true);
  });
  it("returns true for ancient bucket", () => {
    const s: StalenessScore = {
      decisionId: "x", score: 0.9, bucket: "ancient", reasons: [], driftedFiles: 1, totalFiles: 1,
    };
    expect(isStaleScore(s)).toBe(true);
  });
  it("returns false for fresh and aging", () => {
    expect(isStaleScore({ decisionId: "x", score: 0.1, bucket: "fresh", reasons: [], driftedFiles: 0, totalFiles: 1 })).toBe(false);
    expect(isStaleScore({ decisionId: "x", score: 0.3, bucket: "aging", reasons: [], driftedFiles: 1, totalFiles: 1 })).toBe(false);
  });
});

describe("V12 — filterStale", () => {
  it("returns [] for an all-fresh graph", () => {
    const ds = [
      { ...baseDecision, id: "a", linkedNodeIds: ["a"] },
      { ...baseDecision, id: "b", linkedNodeIds: ["b"] },
    ];
    const fps = new Map<string, FileChangeInfo>([
      ["a", makeInfo("2026-06-13T00:00:00Z")],
      ["b", makeInfo("2026-06-13T00:00:00Z")],
    ]);
    expect(filterStale(ds, fps)).toEqual([]);
  });
  it("preserves stale + ancient, drops fresh + aging", () => {
    const ds: ArchitectureDecisionRecord[] = [
      { ...baseDecision, id: "fresh", linkedNodeIds: ["f"] },
      { ...baseDecision, id: "drifted", linkedNodeIds: ["d"] },
      { ...baseDecision, id: "missing", linkedNodeIds: ["m"] },
    ];
    const fps = new Map<string, FileChangeInfo>([
      ["f", makeInfo("2026-06-13T00:00:00Z")],   // fresh
      ["d", makeInfo("2026-06-15T00:00:00Z")],   // drifted → aging
      // m missing → stale
    ]);
    const stale = filterStale(ds, fps);
    const ids = stale.map((x) => x.decision.id);
    expect(ids).toContain("missing");
    expect(ids).not.toContain("fresh");
  });
  it("preserves ancient bucket", () => {
    const ancient = { ...baseDecision, id: "anc", linkedNodeIds: ["a"], date: "2010-01-01T00:00:00Z" };
    const stale = filterStale([ancient], new Map());
    expect(stale).toHaveLength(1);
    expect(stale[0].decision.id).toBe("anc");
  });
});
