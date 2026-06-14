/**
 * ADR (Architecture Decision Record) — V1 Direction A
 *
 * Tests cover:
 *  - All 7 enums + nested object schemas parse / reject correctly
 *  - ArchitectureDecisionRecordSchema accepts a valid record, rejects malformed
 *  - ADRGraphSchema top-level metadata + decisions[]
 *  - validateADR() returns success / fatal shape
 *  - validateADRGraph() returns fatal for missing metadata
 *  - Optional fields (authorCommit, supersededBy, tradeoffScore) are honored
 *  - tradeoffScore boundaries [0, 1]
 */
import { describe, it, expect } from "vitest";
import {
  ADRStatusSchema,
  ADRSourceSchema,
  ADRComplexitySchema,
  ADRAlternativeSchema,
  ADRConsequencesSchema,
  ArchitectureDecisionRecordSchema,
  ADRGraphSchema,
  validateADR,
  validateADRGraph,
} from "../schema.js";

// Use a builder so the type is intentionally flexible (optionals can be omitted)
function makeValidADR(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "adr:0001",
    title: "Use Zod for runtime schema validation",
    status: "accepted",
    context: "We need runtime validation for our external API payloads.",
    decision: "Adopt Zod 3.x as the single source of truth for runtime schemas.",
    consequences: {
      positive: ["Type-safe parsing", "Good DX"],
      negative: ["+~50KB gzipped bundle"],
    },
    alternatives: [
      {
        name: "Yup",
        whyRejected: "Smaller ecosystem and less TypeScript-native than Zod.",
        pros: ["Mature"],
        cons: ["Worse TS DX"],
      },
    ],
    date: "2026-06-14T10:00:00.000Z",
    source: "manual",
    tags: ["validation", "tooling"],
    linkedNodeIds: ["file:src/schema.ts"],
    complexity: "moderate",
    tradeoffScore: 0.7,
    ...overrides,
  };
}

const validADR = makeValidADR();

describe("ADRStatusSchema", () => {
  it("accepts all 4 valid statuses", () => {
    for (const s of ["proposed", "accepted", "deprecated", "superseded"]) {
      expect(ADRStatusSchema.parse(s)).toBe(s);
    }
  });
  it("rejects unknown status", () => {
    expect(() => ADRStatusSchema.parse("draft")).toThrow();
    expect(() => ADRStatusSchema.parse("")).toThrow();
    expect(() => ADRStatusSchema.parse(123)).toThrow();
  });
});

describe("ADRSourceSchema", () => {
  it("accepts all 4 valid sources", () => {
    for (const s of ["git-commit", "code-comment", "llm-inferred", "manual"]) {
      expect(ADRSourceSchema.parse(s)).toBe(s);
    }
  });
  it("rejects unknown source", () => {
    expect(() => ADRSourceSchema.parse("chat")).toThrow();
    expect(() => ADRSourceSchema.parse(null)).toThrow();
  });
});

describe("ADRComplexitySchema", () => {
  it("accepts all 3 valid complexity buckets", () => {
    for (const s of ["simple", "moderate", "complex"]) {
      expect(ADRComplexitySchema.parse(s)).toBe(s);
    }
  });
  it("rejects unknown complexity", () => {
    expect(() => ADRComplexitySchema.parse("trivial")).toThrow();
    expect(() => ADRComplexitySchema.parse("epic")).toThrow();
  });
});

describe("ADRAlternativeSchema", () => {
  it("accepts a fully-populated alternative", () => {
    const alt = {
      name: "REST",
      whyRejected: "Higher coupling than event-driven",
      pros: ["Simpler"],
      cons: ["Coupling"],
    };
    expect(ADRAlternativeSchema.parse(alt)).toEqual(alt);
  });
  it("accepts empty pros and cons arrays", () => {
    const alt = { name: "REST", whyRejected: "", pros: [], cons: [] };
    expect(ADRAlternativeSchema.parse(alt)).toEqual(alt);
  });
  it("rejects empty name", () => {
    expect(() =>
      ADRAlternativeSchema.parse({ name: "", whyRejected: "x", pros: [], cons: [] }),
    ).toThrow();
  });
  it("rejects non-string fields", () => {
    expect(() =>
      ADRAlternativeSchema.parse({ name: 1, whyRejected: "x", pros: [], cons: [] }),
    ).toThrow();
  });
});

describe("ADRConsequencesSchema", () => {
  it("accepts both arrays", () => {
    const c = { positive: ["p1"], negative: ["n1"] };
    expect(ADRConsequencesSchema.parse(c)).toEqual(c);
  });
  it("rejects non-array positive", () => {
    expect(() => ADRConsequencesSchema.parse({ positive: "no", negative: [] })).toThrow();
  });
  it("rejects non-array negative", () => {
    expect(() => ADRConsequencesSchema.parse({ positive: [], negative: 0 })).toThrow();
  });
});

describe("ArchitectureDecisionRecordSchema", () => {
  it("accepts the canonical valid record", () => {
    expect(ArchitectureDecisionRecordSchema.parse(validADR)).toEqual(validADR);
  });
  it("rejects empty id", () => {
    expect(() => ArchitectureDecisionRecordSchema.parse(makeValidADR({ id: "" }))).toThrow();
  });
  it("rejects empty title", () => {
    expect(() => ArchitectureDecisionRecordSchema.parse(makeValidADR({ title: "" }))).toThrow();
  });
  it("rejects empty decision", () => {
    expect(() =>
      ArchitectureDecisionRecordSchema.parse(makeValidADR({ decision: "" })),
    ).toThrow();
  });
  it("accepts a record without optional fields (authorCommit, supersededBy, tradeoffScore)", () => {
    const rest: Record<string, unknown> = { ...validADR };
    delete rest.authorCommit;
    delete rest.supersededBy;
    delete rest.tradeoffScore;
    const parsed = ArchitectureDecisionRecordSchema.parse(rest);
    expect(parsed).toEqual(rest);
  });
  it("rejects unknown status", () => {
    expect(() =>
      ArchitectureDecisionRecordSchema.parse(makeValidADR({ status: "draft" })),
    ).toThrow();
  });
  it("rejects unknown source", () => {
    expect(() =>
      ArchitectureDecisionRecordSchema.parse(makeValidADR({ source: "chat" })),
    ).toThrow();
  });
  it("accepts superseded status with supersededBy set", () => {
    const sup = makeValidADR({ status: "superseded", supersededBy: "adr:0002" });
    const parsed = ArchitectureDecisionRecordSchema.parse(sup);
    expect(parsed.supersededBy).toBe("adr:0002");
  });
  it("enforces tradeoffScore range [0, 1]", () => {
    expect(() =>
      ArchitectureDecisionRecordSchema.parse(makeValidADR({ tradeoffScore: -0.1 })),
    ).toThrow();
    expect(() =>
      ArchitectureDecisionRecordSchema.parse(makeValidADR({ tradeoffScore: 1.1 })),
    ).toThrow();
    const zero = ArchitectureDecisionRecordSchema.parse(makeValidADR({ tradeoffScore: 0 }));
    expect(zero.tradeoffScore).toBe(0);
    const one = ArchitectureDecisionRecordSchema.parse(makeValidADR({ tradeoffScore: 1 }));
    expect(one.tradeoffScore).toBe(1);
  });
  it("accepts empty alternatives and empty linkedNodeIds", () => {
    const minimal = makeValidADR({ alternatives: [], linkedNodeIds: [] });
    const parsed = ArchitectureDecisionRecordSchema.parse(minimal);
    expect(parsed.alternatives).toEqual([]);
    expect(parsed.linkedNodeIds).toEqual([]);
  });
});

describe("ADRGraphSchema", () => {
  const validGraph = {
    version: "1.0",
    project: {
      name: "ua-why-iteration",
      analyzedAt: "2026-06-14T10:00:00.000Z",
      gitCommitHash: "abcdef1234567890",
    },
    decisions: [validADR],
  };
  it("accepts a graph with one decision", () => {
    expect(ADRGraphSchema.parse(validGraph)).toEqual(validGraph);
  });
  it("accepts a graph with empty decisions", () => {
    const g = { ...validGraph, decisions: [] };
    expect(ADRGraphSchema.parse(g)).toEqual(g);
  });
  it("rejects missing project", () => {
    const noProject: Record<string, unknown> = { ...validGraph };
    delete (noProject as { project?: unknown }).project;
    expect(() => ADRGraphSchema.parse(noProject)).toThrow();
  });
  it("rejects missing decisions", () => {
    const noDecisions: Record<string, unknown> = { ...validGraph };
    delete (noDecisions as { decisions?: unknown }).decisions;
    expect(() => ADRGraphSchema.parse(noDecisions)).toThrow();
  });
  it("rejects invalid decision in array (schema is strict; callers should drop)", () => {
    const g = { ...validGraph, decisions: [{ ...validADR, id: "" }] };
    expect(() => ADRGraphSchema.parse(g)).toThrow();
  });
});

describe("validateADR()", () => {
  it("returns success: true for a valid record", () => {
    const r = validateADR(validADR);
    expect(r.success).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.fatal).toBeUndefined();
  });
  it("returns fatal for non-object input", () => {
    expect(validateADR(null).success).toBe(false);
    expect(validateADR("string").success).toBe(false);
    expect(validateADR(42).success).toBe(false);
    expect(validateADR(undefined).success).toBe(false);
    for (const v of [null, "string", 42, undefined]) {
      expect(validateADR(v).fatal).toBeTruthy();
    }
  });
  it("returns fatal with category 'invalid-adr' for malformed records", () => {
    const r = validateADR({ ...validADR, status: "draft" });
    expect(r.success).toBe(false);
    expect(r.fatal).toBeTruthy();
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues[0].category).toBe("invalid-adr");
  });
  it("issues carry path info for nested failures", () => {
    const r = validateADR({ ...validADR, consequences: { positive: "nope", negative: [] } });
    expect(r.success).toBe(false);
    expect(r.issues[0].path).toContain("consequences");
  });
});

describe("validateADRGraph()", () => {
  const validGraph = {
    version: "1.0",
    project: {
      name: "ua-why-iteration",
      analyzedAt: "2026-06-14T10:00:00.000Z",
      gitCommitHash: "abcdef1234567890",
    },
    decisions: [validADR],
  };
  it("returns success: true with data for a valid graph", () => {
    const r = validateADRGraph(validGraph);
    expect(r.success).toBe(true);
    expect(r.data).toBeDefined();
    expect(r.data?.decisions.length).toBe(1);
  });
  it("returns fatal 'not an object' for non-object", () => {
    for (const v of [null, "x", 1, undefined, []]) {
      const r = validateADRGraph(v);
      expect(r.success).toBe(false);
      expect(r.fatal).toBeTruthy();
    }
  });
  it("returns fatal 'Missing or invalid ADR graph metadata' for missing top-level fields", () => {
    const r = validateADRGraph({ version: "1.0" });
    expect(r.success).toBe(false);
    expect(r.fatal).toBe("Missing or invalid ADR graph metadata");
  });
  it("returns fatal when project fields are wrong type", () => {
    const r = validateADRGraph({
      ...validGraph,
      project: { name: 1, analyzedAt: "x", gitCommitHash: "y" },
    });
    expect(r.success).toBe(false);
    expect(r.fatal).toBe("Missing or invalid ADR graph metadata");
  });
});
