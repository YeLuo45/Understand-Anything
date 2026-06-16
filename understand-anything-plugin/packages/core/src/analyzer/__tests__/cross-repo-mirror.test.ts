/**
 * Cross-repo mirror tests — V21 / V22 / V23 / V25 of Direction B
 */
import { describe, it, expect } from "vitest";
import {
  fnv1a16,
  buildMirror,
  resolveCrossRepo,
  findLocalMatches,
  findForeignOnly,
  type ForeignMirror,
} from "../cross-repo-mirror";
import type { ArchitectureDecisionRecord } from "../../types";

function makeAdr(overrides: Partial<ArchitectureDecisionRecord> = {}): ArchitectureDecisionRecord {
  return {
    id: "adr:1",
    title: "X",
    status: "accepted",
    context: "",
    decision: "use X",
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

describe("V21 — fnv1a16", () => {
  it("returns a 16-char hex string", () => {
    const h = fnv1a16("hello");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
  it("is deterministic", () => {
    expect(fnv1a16("hello")).toBe(fnv1a16("hello"));
  });
  it("differs for different inputs", () => {
    expect(fnv1a16("hello")).not.toBe(fnv1a16("world"));
  });
  it("handles empty string", () => {
    expect(fnv1a16("")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("V21 — buildMirror", () => {
  it("produces a valid DecisionMirror", () => {
    const m = buildMirror([makeAdr()], "p");
    expect(m.version).toBe("1.0");
    expect(m.project).toBe("p");
    expect(m.entries).toHaveLength(1);
  });
  it("each entry has the required fields", () => {
    const m = buildMirror([makeAdr({ id: "a", title: "T" })], "p");
    const e = m.entries[0]!;
    expect(e.id).toBe("a");
    expect(e.title).toBe("T");
    expect(e.origin).toBe("p");
    expect(e.decisionHash).toMatch(/^[0-9a-f]{16}$/);
  });
  it("hash differs when decision text differs", () => {
    const a = buildMirror([makeAdr({ id: "a", decision: "X" })], "p").entries[0]!.decisionHash;
    const b = buildMirror([makeAdr({ id: "a", decision: "Y" })], "p").entries[0]!.decisionHash;
    expect(a).not.toBe(b);
  });
  it("hash is stable across runs for the same input", () => {
    const a = buildMirror([makeAdr({ decision: "Z" })], "p").entries[0]!.decisionHash;
    const b = buildMirror([makeAdr({ decision: "Z" })], "p").entries[0]!.decisionHash;
    expect(a).toBe(b);
  });
  it("preserves linkedNodeIds in the entry", () => {
    const m = buildMirror([makeAdr({ linkedNodeIds: ["file:a.ts"] })], "p");
    expect(m.entries[0]!.linkedNodeIds).toEqual(["file:a.ts"]);
  });
});

describe("V22 — resolveCrossRepo", () => {
  const local: ArchitectureDecisionRecord[] = [
    makeAdr({ id: "shared", decision: "use Foo" }),
    makeAdr({ id: "local-only", decision: "use Bar" }),
  ];
  const foreign: ForeignMirror = {
    project: "other",
    entries: [
      { id: "shared", title: "t", origin: "other", decisionHash: fnv1a16("use Foo"), linkedNodeIds: [] },
      { id: "remote-only", title: "t", origin: "other", decisionHash: fnv1a16("use Baz"), linkedNodeIds: [] },
    ],
  };
  it("matches shared ids and computes a 1.0 score when hash matches", () => {
    const m = resolveCrossRepo(local, foreign);
    const shared = m.find((x) => x.local.id === "shared")!;
    expect(shared.score).toBe(1);
    expect(shared.drift).toBe(false);
  });
  it("flags drift when ids match but hashes differ", () => {
    const drifted: ForeignMirror = {
      project: "x",
      entries: [
        { id: "shared", title: "t", origin: "x", decisionHash: fnv1a16("use DIFFERENT"), linkedNodeIds: [] },
      ],
    };
    const m = resolveCrossRepo(local, drifted);
    expect(m[0]!.score).toBe(0.5);
    expect(m[0]!.drift).toBe(true);
  });
});

describe("V22 — findLocalMatches", () => {
  it("filters out remote-only entries", () => {
    const local: ArchitectureDecisionRecord[] = [makeAdr({ id: "shared", decision: "X" })];
    const foreign: ForeignMirror = {
      project: "x",
      entries: [
        { id: "shared", title: "t", origin: "x", decisionHash: fnv1a16("X"), linkedNodeIds: [] },
        { id: "remote-only", title: "t", origin: "x", decisionHash: "x", linkedNodeIds: [] },
      ],
    };
    const m = findLocalMatches(local, foreign);
    expect(m).toHaveLength(1);
    expect(m[0]!.local.id).toBe("shared");
  });
  it("returns [] for empty inputs", () => {
    expect(findLocalMatches([], { project: "x", entries: [] })).toEqual([]);
  });
});

describe("V22 — findForeignOnly", () => {
  it("returns entries without a local counterpart", () => {
    const local: ArchitectureDecisionRecord[] = [makeAdr({ id: "a" })];
    const foreign: ForeignMirror = {
      project: "x",
      entries: [
        { id: "a", title: "t", origin: "x", decisionHash: "x", linkedNodeIds: [] },
        { id: "b", title: "t", origin: "x", decisionHash: "x", linkedNodeIds: [] },
      ],
    };
    const out = findForeignOnly(local, foreign);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("b");
  });
});
