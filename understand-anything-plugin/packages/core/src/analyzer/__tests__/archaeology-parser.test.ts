/**
 * Archaeology parser tests — V2 of Direction B
 */
import { describe, it, expect } from "vitest";
import {
  splitBodyOnDecision,
  extractAlternativesFromBody,
  parseCandidate,
  parseCandidates,
} from "../archaeology-parser";
import type { ArchaeologyCandidate } from "../archaeology-scanner";

function makeCandidate(overrides: Partial<ArchaeologyCandidate> = {}): ArchaeologyCandidate {
  return {
    id: "abc-000",
    source: "git-commit",
    commitHash: "abcdef1234567890",
    author: "Alice",
    date: "2026-06-14T00:00:00Z",
    title: "ADR: use Zod for runtime validation",
    body: "ADR: use Zod for runtime validation\n\nWe chose Zod 3.x because it gives us type safety.",
    matchedPrefixes: ["adr:"],
    filesChanged: ["src/schema.ts"],
    insertions: 50,
    deletions: 10,
    ...overrides,
  };
}

describe("V2 — splitBodyOnDecision", () => {
  it("returns full body as decision when no marker is found", () => {
    const { context, decision } = splitBodyOnDecision("Just a regular message.");
    expect(context).toBe("");
    expect(decision).toBe("Just a regular message.");
  });
  it("splits on 'Decision:' marker", () => {
    const { context, decision } = splitBodyOnDecision(
      "Background context here.\n\nDecision: use Zod 3.x.",
    );
    expect(context).toBe("Background context here.");
    expect(decision).toBe("Decision: use Zod 3.x.");
  });
  it("splits on 'Why:' / 'Rationale:' markers", () => {
    const { context, decision } = splitBodyOnDecision("ctx\n\nWhy: typed at runtime");
    expect(context).toBe("ctx");
    expect(decision).toBe("Why: typed at runtime");
    const r = splitBodyOnDecision("ctx\n\nRationale: better DX");
    expect(r.decision).toBe("Rationale: better DX");
  });
  it("splits on 'Because' / 'Chose'", () => {
    const r1 = splitBodyOnDecision("ctx\n\nBecause we need runtime safety");
    expect(r1.decision).toBe("Because we need runtime safety");
    const r2 = splitBodyOnDecision("ctx\n\nChose Zod 3.x over Yup");
    expect(r2.decision).toBe("Chose Zod 3.x over Yup");
  });
  it("is case-insensitive on marker detection", () => {
    const { decision } = splitBodyOnDecision("ctx\n\nDECISION: use X");
    expect(decision).toBe("DECISION: use X");
  });
  it("returns empty context when body is only the decision line", () => {
    const { context, decision } = splitBodyOnDecision("Decision: only this");
    expect(context).toBe("");
    expect(decision).toBe("Decision: only this");
  });
});

describe("V2 — extractAlternativesFromBody", () => {
  it("returns [] for bodies without alternative signals", () => {
    expect(extractAlternativesFromBody("Just a regular commit")).toEqual([]);
  });
  it("detects 'chose X over Y' phrasing", () => {
    const out = extractAlternativesFromBody("We chose Zod over Yup for type safety");
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Yup");
  });
  it("detects multiple alternatives", () => {
    const body = "We chose Zod over Yup and over io-ts. Chose to use Zod 3.x.";
    const out = extractAlternativesFromBody(body);
    const names = out.map((a) => a.name);
    expect(names).toContain("Yup");
    expect(names).toContain("io-ts");
  });
  it("detects 'X instead of Y' phrasing", () => {
    const out = extractAlternativesFromBody("Use tabs instead of spaces");
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("spaces");
  });
  it("trims trailing punctuation in names", () => {
    const out = extractAlternativesFromBody("chose A over B,");
    expect(out[0]!.name).toBe("B");
  });
  it("returns [] when 'over' refers to a generic word (not an alternative)", () => {
    // "over" must follow a clear alternative cue
    const out = extractAlternativesFromBody("Migrating over 100 files");
    // Should be 0 — the heuristic guards against this
    expect(out).toEqual([]);
  });
});

describe("V2 — parseCandidate", () => {
  it("produces a valid ADR with default fields", () => {
    const adr = parseCandidate(makeCandidate(), 0);
    expect(adr.title).toBe("use Zod for runtime validation");
    expect(adr.status).toBe("accepted");
    expect(adr.source).toBe("git-commit");
    expect(adr.authorCommit).toBe("abcdef1234567890");
    expect(adr.linkedNodeIds).toEqual(["file:src/schema.ts"]);
    expect(adr.tags).toContain("archaeology");
    expect(adr.tags).toContain("adr:");
  });
  it("strips the ADR prefix from the title", () => {
    const adr = parseCandidate(makeCandidate({ title: "[ADR] drop legacy" }), 0);
    expect(adr.title).toBe("drop legacy");
  });
  it("preserves the body when no 'Decision:' marker is found", () => {
    const adr = parseCandidate(
      makeCandidate({ body: "Random commit body without marker" }),
      0,
    );
    expect(adr.decision).toBe("Random commit body without marker");
    expect(adr.context).toContain("no explicit context");
  });
  it("extracts alternatives from the body", () => {
    const adr = parseCandidate(
      makeCandidate({ body: "chose Zod over Yup for type safety" }),
      0,
    );
    expect(adr.alternatives).toHaveLength(1);
    expect(adr.alternatives[0]!.name).toBe("Yup");
  });
  it("uses the commit date as the ADR date", () => {
    const adr = parseCandidate(makeCandidate(), 0);
    expect(adr.date).toBe("2026-06-14T00:00:00Z");
  });
  it("infers complexity from body length", () => {
    const short = parseCandidate(makeCandidate({ body: "short" }), 0);
    const medium = parseCandidate(makeCandidate({ body: "x".repeat(300) }), 0);
    const long = parseCandidate(makeCandidate({ body: "x".repeat(800) }), 0);
    expect(short.complexity).toBe("simple");
    expect(medium.complexity).toBe("moderate");
    expect(long.complexity).toBe("complex");
  });
  it("is idempotent across re-runs (same id)", () => {
    const a = parseCandidate(makeCandidate(), 0);
    const b = parseCandidate(makeCandidate(), 0);
    expect(a.id).toBe(b.id);
  });
  it("uses a custom idPrefix when provided", () => {
    const adr = parseCandidate(makeCandidate(), 0, { idPrefix: "foo" });
    expect(adr.id.startsWith("foo:")).toBe(true);
  });
});

describe("V2 — parseCandidates (batch)", () => {
  it("converts N candidates to N ADRs in order", () => {
    const cs: ArchaeologyCandidate[] = [
      makeCandidate({ title: "ADR: first", commitHash: "h1" }),
      makeCandidate({ title: "ADR: second", commitHash: "h2" }),
      makeCandidate({ title: "ADR: third", commitHash: "h3" }),
    ];
    const adrs = parseCandidates(cs);
    expect(adrs).toHaveLength(3);
    expect(adrs.map((a) => a.title)).toEqual(["first", "second", "third"]);
  });
  it("returns [] for empty input", () => {
    expect(parseCandidates([])).toEqual([]);
  });
});
