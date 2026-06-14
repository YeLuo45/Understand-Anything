/**
 * Decision Extraction — V10 tests
 *
 * Covers V6 (git log scanner), V7 (code comment scanner), V8 (decision
 * extractor), V9 (LLM summarizer prompt + parser).
 */
import { describe, it, expect } from "vitest";
import {
  matchRationaleKeywords,
  parseGitLogOutput,
  scanGitLog,
  type DecisionCandidate,
} from "../git-decision-scanner.js";
import {
  extractCommentCandidates,
  scanCodeComments,
} from "../comment-decision-scanner.js";
import { candidateToADR, extractDecisions } from "../decision-extractor.js";
import {
  buildSummarizePrompt,
  parseSummarizeResponse,
  mergeSummarize,
} from "../llm-decision-summarizer.js";

describe("V6 — matchRationaleKeywords", () => {
  it("returns empty for messages without rationale markers", () => {
    expect(matchRationaleKeywords("fix typo in readme")).toEqual([]);
    expect(matchRationaleKeywords("")).toEqual([]);
  });
  it("matches 'Why:' prefix", () => {
    expect(matchRationaleKeywords("Why: we use Zod")).toContain("why:");
  });
  it("matches 'Decision:' prefix", () => {
    expect(matchRationaleKeywords("Decision: drop legacy module")).toContain("decision:");
  });
  it("matches 'chose X over Y' phrasing", () => {
    const k = matchRationaleKeywords("chose TypeScript over JavaScript");
    expect(k).toContain("chose");
    expect(k).toContain("over");
  });
  it("matches 'instead of' phrasing", () => {
    const k = matchRationaleKeywords("we use tabs instead of spaces");
    expect(k).toContain("instead-of");
  });
  it("matches 'tradeoff' (with and without hyphen)", () => {
    expect(matchRationaleKeywords("tradeoff: simpler API")).toContain("tradeoff");
    expect(matchRationaleKeywords("trade-off: simpler API")).toContain("tradeoff");
  });
  it("is case-insensitive", () => {
    expect(matchRationaleKeywords("WHY: reason here")).toContain("why:");
  });
  it("returns sorted unique labels", () => {
    const k = matchRationaleKeywords("why: chose A over B because tradeoff");
    // Set semantics: no duplicates
    expect(new Set(k).size).toBe(k.length);
  });
});

describe("V6 — parseGitLogOutput", () => {
  it("returns empty on empty input", () => {
    expect(parseGitLogOutput("")).toEqual([]);
  });
  it("parses one record", () => {
    const FLD = "\u001f";
    const REC = "\u001e";
    const raw =
      `abc123${FLD}Alice${FLD}2026-06-14T00:00:00+00:00${FLD}Why: use Zod${FLD}Decision body${FLD}src/a.ts${REC}`;
    const out = parseGitLogOutput(raw);
    expect(out).toHaveLength(1);
    expect(out[0].commitHash).toBe("abc123");
    expect(out[0].author).toBe("Alice");
    expect(out[0].title).toBe("Why: use Zod");
    expect(out[0].body).toContain("Decision body");
    expect(out[0].filesChanged).toEqual(["src/a.ts"]);
    expect(out[0].matchedKeywords).toContain("why:");
  });
  it("parses multiple records separated by RS", () => {
    const FLD = "\u001f";
    const REC = "\u001e";
    const raw =
      `h1${FLD}A${FLD}d1${FLD}chose A over B${FLD}body1${FLD}f1.ts${REC}` +
      `h2${FLD}B${FLD}d2${FLD}random commit${FLD}body2${FLD}f2.ts${REC}`;
    const out = parseGitLogOutput(raw);
    expect(out).toHaveLength(1); // only "h1" matches rationale
    expect(out[0].commitHash).toBe("h1");
  });
  it("uses custom matcher when provided", () => {
    const FLD = "\u001f";
    const REC = "\u001e";
    const raw = `h${FLD}a${FLD}d${FLD}title${FLD}body${FLD}f.ts${REC}`;
    const out = parseGitLogOutput(raw, () => ["custom"]);
    expect(out[0].matchedKeywords).toEqual(["custom"]);
  });
  it("parses multiple files in --name-only output (newline-separated)", () => {
    const FLD = "\u001f";
    const REC = "\u001e";
    const raw =
      `h${FLD}a${FLD}d${FLD}Why: refactor${FLD}body${FLD}src/a.ts\nsrc/b.ts\nsrc/c.ts${REC}`;
    const out = parseGitLogOutput(raw);
    expect(out[0].filesChanged).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("V6 — scanGitLog (integration, may no-op if not in a git repo)", () => {
  it("returns [] when not in a git repo or no rationale matches", async () => {
    const out = await scanGitLog({ cwd: "/tmp" });
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("V7 — extractCommentCandidates", () => {
  it("returns [] for unsupported extensions", () => {
    expect(extractCommentCandidates("foo.txt", "// DECISION: x")).toEqual([]);
  });
  it("extracts TS/JS line comments with DECISION tag", () => {
    const src = `// DECISION: chose X over Y because of speed\nexport const a = 1;\n`;
    const out = extractCommentCandidates("src/a.ts", src);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("code-comment");
    expect(out[0].matchedKeywords).toContain("decision");
    expect(out[0].body).toContain("chose X over Y");
  });
  it("extracts Python line comments", () => {
    const src = `# WHY: simpler than the alternative\nx = 1\n`;
    const out = extractCommentCandidates("a.py", src);
    expect(out).toHaveLength(1);
    expect(out[0].matchedKeywords).toContain("why");
  });
  it("ignores unrelated comments", () => {
    const src = `// just a normal comment\nexport const a = 1;\n`;
    expect(extractCommentCandidates("a.ts", src)).toEqual([]);
  });
  it("handles multiple comments in one file", () => {
    const src = [
      "// DECISION: pick A",
      "const a = 1;",
      "// HACK: works around bug #42",
      "const b = 2;",
    ].join("\n");
    const out = extractCommentCandidates("a.ts", src);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.matchedKeywords[0])).toEqual(["decision", "hack"]);
  });
});

describe("V7 — scanCodeComments (async)", () => {
  it("returns [] for non-existent files", async () => {
    const out = await scanCodeComments({
      cwd: "/tmp",
      filePaths: ["nonexistent.ts"],
    });
    expect(out).toEqual([]);
  });
  it("respects maxFiles cap", async () => {
    const out = await scanCodeComments({
      cwd: "/tmp",
      filePaths: Array.from({ length: 5 }, (_, i) => `f${i}.ts`),
      maxFiles: 2,
    });
    expect(out).toEqual([]); // no files exist, but we should not throw
  });
});

describe("V8 — candidateToADR", () => {
  const cand: DecisionCandidate = {
    source: "git-commit",
    commitHash: "abcdef1234567890",
    author: "Alice",
    date: "2026-06-14T00:00:00Z",
    title: "Adopt Zod for runtime validation",
    body:
      "Adopt Zod for runtime validation\n\n" +
      "Decision: We use Zod 3.x as the single source of truth.\n",
    matchedKeywords: ["decision:"],
    filesChanged: ["src/schema.ts", "src/index.ts"],
  };
  it("produces a valid ADR with deterministic id", () => {
    const adr = candidateToADR(cand, 0);
    expect(adr.id).toMatch(/^adr:[0-9a-f]{8}:000$/);
    expect(adr.title).toBe("Adopt Zod for runtime validation");
    expect(adr.source).toBe("git-commit");
    expect(adr.status).toBe("accepted");
    expect(adr.linkedNodeIds).toEqual(["file:src/schema.ts", "file:src/index.ts"]);
    expect(adr.authorCommit).toBe("abcdef1234567890");
  });
  it("is idempotent across re-runs (same input → same id)", () => {
    const a = candidateToADR(cand, 0);
    const b = candidateToADR(cand, 0);
    expect(a.id).toBe(b.id);
  });
  it("uses different id for different index", () => {
    expect(candidateToADR(cand, 0).id).not.toBe(candidateToADR(cand, 1).id);
  });
  it("splits body on Decision: line", () => {
    const adr = candidateToADR(cand, 0);
    expect(adr.context).toBe("Adopt Zod for runtime validation");
    expect(adr.decision.startsWith("Decision:")).toBe(true);
  });
  it("infers complexity from body length", () => {
    const short = { ...cand, body: "tiny" };
    const long = { ...cand, body: "x".repeat(700) };
    expect(candidateToADR(short, 0).complexity).toBe("simple");
    expect(candidateToADR(long, 0).complexity).toBe("complex");
  });
});

describe("V8 — extractDecisions", () => {
  const c1: DecisionCandidate = {
    source: "git-commit", commitHash: "h1", date: "2026-06-10T00:00:00Z",
    title: "older", body: "Decision: x", matchedKeywords: ["decision:"], filesChanged: [],
  };
  const c2: DecisionCandidate = {
    source: "git-commit", commitHash: "h2", date: "2026-06-14T00:00:00Z",
    title: "newer", body: "Decision: y", matchedKeywords: ["decision:"], filesChanged: [],
  };
  it("sorts candidates by date ascending", () => {
    const out = extractDecisions([c2, c1], {
      project: { name: "p", analyzedAt: "x", gitCommitHash: "y" },
    });
    expect(out[0].title).toBe("older");
    expect(out[1].title).toBe("newer");
  });
  it("respects maxRecords cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...c1, commitHash: `h${i}`,
    }));
    const out = extractDecisions(many, {
      project: { name: "p", analyzedAt: "x", gitCommitHash: "y" },
      maxRecords: 3,
    });
    expect(out).toHaveLength(3);
  });
  it("uses the provided idPrefix", () => {
    const out = extractDecisions([c1], {
      project: { name: "p", analyzedAt: "x", gitCommitHash: "y" },
      idPrefix: "ua",
    });
    expect(out[0].id.startsWith("ua:")).toBe(true);
  });
});

describe("V9 — buildSummarizePrompt", () => {
  it("produces system + user strings", () => {
    const { system, user } = buildSummarizePrompt({
      partial: {
        id: "adr:0001",
        title: "Use Zod",
        status: "accepted",
        context: "ctx",
        decision: "Use Zod",
        consequences: { positive: [], negative: [] },
        alternatives: [],
        date: "2026-06-14",
        source: "git-commit",
        tags: [],
        linkedNodeIds: ["file:src/schema.ts"],
        complexity: "moderate",
      },
    });
    expect(system).toContain("Architecture Decision Record");
    expect(user).toContain("Use Zod");
    expect(user).toContain('"files"');
    expect(user).toContain("file:src/schema.ts");
  });
});

describe("V9 — parseSummarizeResponse", () => {
  it("returns null for non-JSON", () => {
    expect(parseSummarizeResponse("not json")).toBeNull();
  });
  it("returns null when 'decision' is missing", () => {
    expect(parseSummarizeResponse('{"positive":[]}')).toBeNull();
  });
  it("strips ```json fences and parses", () => {
    const raw = '```json\n{"decision":"x","positive":["a"]}\n```';
    const out = parseSummarizeResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.decision).toBe("x");
    expect(out!.positive).toEqual(["a"]);
  });
  it("filters non-string array entries", () => {
    const raw = '{"decision":"x","positive":["a",1,null,"b"],"negative":[1,2,3]}';
    const out = parseSummarizeResponse(raw)!;
    expect(out.positive).toEqual(["a", "b"]);
    expect(out.negative).toEqual([]);
  });
  it("clamps tradeoffScore to [0,1] and ignores out-of-range", () => {
    expect(parseSummarizeResponse('{"decision":"x","tradeoffScore":-0.5}')).toEqual(
      expect.objectContaining({ tradeoffScore: undefined }),
    );
    expect(parseSummarizeResponse('{"decision":"x","tradeoffScore":1.5}')).toEqual(
      expect.objectContaining({ tradeoffScore: undefined }),
    );
    expect(parseSummarizeResponse('{"decision":"x","tradeoffScore":0.42}')).toEqual(
      expect.objectContaining({ tradeoffScore: 0.42 }),
    );
  });
  it("drops alternatives without a name", () => {
    const raw = '{"decision":"x","alternatives":[{"name":"A","whyRejected":"r"},{"name":"","whyRejected":"x"}]}';
    const out = parseSummarizeResponse(raw)!;
    expect(out.alternatives).toEqual([{ name: "A", whyRejected: "r" }]);
  });
});

describe("V9 — mergeSummarize", () => {
  const partial = {
    id: "adr:0001",
    title: "T",
    status: "accepted" as const,
    context: "c",
    decision: "OLD",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "2026-06-14",
    source: "git-commit" as const,
    tags: [],
    linkedNodeIds: [],
    complexity: "moderate" as const,
  };
  it("overrides decision + consequences + adds alternatives", () => {
    const merged = mergeSummarize(partial, {
      decision: "NEW",
      positive: ["p1"],
      negative: ["n1"],
      alternatives: [{ name: "Alt", whyRejected: "r" }],
      tradeoffScore: 0.6,
    });
    expect(merged.decision).toBe("NEW");
    expect(merged.consequences.positive).toEqual(["p1"]);
    expect(merged.consequences.negative).toEqual(["n1"]);
    expect(merged.alternatives).toEqual([
      { name: "Alt", whyRejected: "r", pros: [], cons: [] },
    ]);
    expect(merged.tradeoffScore).toBe(0.6);
  });
  it("falls back to partial.decision when enrichment is empty", () => {
    const merged = mergeSummarize(partial, {
      decision: "",
      positive: [],
      negative: [],
      alternatives: [],
    });
    expect(merged.decision).toBe("OLD");
  });
});
