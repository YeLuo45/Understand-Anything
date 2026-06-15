/**
 * Code Archaeology tests — V1 of Direction B
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  matchADRPrefixes,
  parseArchaeologyLog,
  scanGitArchaeology,
  ADR_PREFIXES,
} from "../archaeology-scanner";

const FLD = "\u001f";
const REC = "\u001e";

function rec(
  hash: string,
  author: string,
  date: string,
  subject: string,
  body: string,
  files: string,
): string {
  return [hash, author, date, subject, body, files].join(FLD) + REC;
}

beforeEach(() => { void 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("V1 — matchADRPrefixes", () => {
  it("returns [] for messages without an ADR prefix", () => {
    expect(matchADRPrefixes("fix typo in readme")).toEqual([]);
    expect(matchADRPrefixes("Add feature X")).toEqual([]);
    expect(matchADRPrefixes("")).toEqual([]);
  });
  it("matches 'ADR:' (case-insensitive)", () => {
    expect(matchADRPrefixes("ADR: use Zod for runtime validation")).toContain("adr:");
    expect(matchADRPrefixes("adr: ditto")).toContain("adr:");
  });
  it("matches '[ADR] …' bracket form", () => {
    expect(matchADRPrefixes("[ADR] drop legacy module")).toContain("[adr]");
  });
  it("matches 'decide' / 'decided'", () => {
    expect(matchADRPrefixes("decide: drop React 17 support")).toContain("decide");
    expect(matchADRPrefixes("decided: switch to ESM")).toContain("decide");
  });
  it("matches 'rfc:' / 'RFC:'", () => {
    expect(matchADRPrefixes("rfc: API gateway design")).toContain("rfc:");
    expect(matchADRPrefixes("RFC: caching layer")).toContain("rfc:");
  });
  it("matches 'arch:' / 'decision:'", () => {
    expect(matchADRPrefixes("arch: layered architecture")).toContain("arch:");
    expect(matchADRPrefixes("decision: use vanilla extract")).toContain("decision:");
  });
  it("scans only the title (first line), not the body", () => {
    expect(matchADRPrefixes("Add feature\n\nADR: in the body")).toEqual([]);
  });
  it("returns at most one label per matching prefix", () => {
    const labels = matchADRPrefixes("ADR: foo bar baz");
    // Only "adr:" should match, not any other prefix.
    expect(labels).toEqual(["adr:"]);
  });
});

describe("V1 — ADR_PREFIXES constant", () => {
  it("has 6 prefix definitions", () => {
    expect(ADR_PREFIXES).toHaveLength(6);
  });
  it("each pattern matches at least one sample", () => {
    const samples: Array<[string, string]> = [
      ["ADR: x", "adr:"],
      ["[ADR] y", "[adr]"],
      ["decide: z", "decide"],
      ["decided: q", "decide"],
      ["rfc: w", "rfc:"],
      ["arch: t", "arch:"],
      ["decision: u", "decision:"],
    ];
    for (const [msg, expected] of samples) {
      expect(matchADRPrefixes(msg)).toContain(expected);
    }
  });
});

describe("V1 — parseArchaeologyLog", () => {
  it("returns [] on empty input", () => {
    expect(parseArchaeologyLog("")).toEqual([]);
  });
  it("returns [] when no commit matches an ADR prefix", () => {
    const raw = rec("h1", "alice", "2026-06-14T00:00:00Z", "fix typo", "body", "") + REC;
    expect(parseArchaeologyLog(raw)).toEqual([]);
  });
  it("parses a single ADR commit", () => {
    const raw = rec(
      "abcdef1234567890",
      "Alice",
      "2026-06-14T00:00:00Z",
      "ADR: use Zod for runtime validation",
      "We chose Zod because it gives us type safety at runtime.",
      "src/schema.ts",
    );
    const out = parseArchaeologyLog(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.commitHash).toBe("abcdef1234567890");
    expect(out[0]!.author).toBe("Alice");
    expect(out[0]!.title).toBe("ADR: use Zod for runtime validation");
    expect(out[0]!.body).toContain("type safety");
    expect(out[0]!.matchedPrefixes).toEqual(["adr:"]);
    expect(out[0]!.filesChanged).toEqual(["src/schema.ts"]);
  });
  it("preserves commit order (oldest first in the log = first in output)", () => {
    const raw =
      rec("h1", "alice", "2024-01-01", "ADR: first", "", "a.ts") +
      rec("h2", "bob", "2025-01-01", "rfc: second", "", "b.ts") +
      rec("h3", "carol", "2026-01-01", "[ADR] third", "", "c.ts");
    const out = parseArchaeologyLog(raw);
    expect(out.map((c) => c.commitHash)).toEqual(["h1", "h2", "h3"]);
  });
  it("skips non-ADR commits but keeps the rest", () => {
    const raw =
      rec("h1", "alice", "2024-01-01", "fix bug", "", "a.ts") +
      rec("h2", "bob", "2025-01-01", "ADR: use Zod", "", "b.ts") +
      rec("h3", "carol", "2026-01-01", "Add tests", "", "c.ts");
    const out = parseArchaeologyLog(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.commitHash).toBe("h2");
  });
  it("builds stable ids from commit hash + 0-based index", () => {
    const raw =
      rec("abc1234", "alice", "2024-01-01", "ADR: a", "", "a.ts") +
      rec("def5678", "bob", "2025-01-01", "rfc: b", "", "b.ts");
    const out = parseArchaeologyLog(raw);
    expect(out[0]!.id).toBe("abc1234-000");
    expect(out[1]!.id).toBe("def5678-001");
  });
  it("parses multiple files from one commit (--name-only format)", () => {
    const raw = rec("h", "alice", "2024-01-01", "ADR: refactor", "", "a.ts\nb.ts\nc.ts");
    const out = parseArchaeologyLog(raw);
    expect(out[0]!.filesChanged).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
  it("handles empty body (subject only)", () => {
    const raw = rec("h", "alice", "2024-01-01", "ADR: subject-only", "", "a.ts");
    const out = parseArchaeologyLog(raw);
    expect(out[0]!.body).toBe("ADR: subject-only");
  });
});

describe("V1 — scanGitArchaeology (integration, may no-op)", () => {
  it("returns [] when not in a git repo", async () => {
    const out = await scanGitArchaeology({ cwd: "/tmp" });
    expect(Array.isArray(out)).toBe(true);
  });
  it("respects onlyPrefixes filter", async () => {
    const out = await scanGitArchaeology({ cwd: "/tmp", onlyPrefixes: ["adr:"] });
    expect(Array.isArray(out)).toBe(true);
  });
  it("rejects malformed records gracefully", () => {
    const malformed = "garbage data with no fields at all" + REC;
    const out = parseArchaeologyLog(malformed);
    expect(out).toEqual([]);
  });
});
