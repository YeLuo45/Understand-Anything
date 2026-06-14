/**
 * Git Decision Scanner — V6 of Direction A "Why" persona
 *
 * Scans a git repository's commit log and identifies commits whose messages
 * carry design rationale. Heuristic keyword matching looks for patterns like:
 *   - "Why: ..."            — explicit rationale
 *   - "Decision: ..."       — explicit decision
 *   - "Chose X over Y"      — alternative considered
 *   - "Tradeoff: ..."        — tradeoff declaration
 *   - "X instead of Y"       — alternative considered
 *   - "Because ..."          — rationale
 *   - "Reason: ..."          — rationale
 *   - "Rationale: ..."       — rationale
 *
 * The output is a list of `DecisionCandidate` records — *raw* signals, not
 * fully-formed ADRs. The aggregator in `decision-extractor.ts` (V8) is what
 * turns these into `ArchitectureDecisionRecord`s.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** A raw decision candidate discovered in a commit message. */
export interface DecisionCandidate {
  /** Where this candidate came from. */
  source: "git-commit" | "code-comment" | "llm-inferred" | "manual";
  /** Commit short hash, when source === "git-commit". */
  commitHash?: string;
  /** Commit author. */
  author?: string;
  /** ISO 8601 commit date. */
  date?: string;
  /** First line of the commit message (the title). */
  title: string;
  /** Full commit message body (title + body, separated by blank line). */
  body: string;
  /** List of keyword patterns that matched. */
  matchedKeywords: string[];
  /** Files changed by this commit (paths relative to repo root). */
  filesChanged: string[];
}

// Keywords that signal a commit message carries design rationale. All matches
// are case-insensitive. The pattern is "needle" — we look for it as a
// substring of the lowercased commit message.
const RATIONALE_KEYWORDS: ReadonlyArray<{ pattern: string; label: string }> = [
  { pattern: "why:", label: "why:" },
  { pattern: "why ", label: "why" },
  { pattern: "decision:", label: "decision:" },
  { pattern: "decided to", label: "decided" },
  { pattern: "chose ", label: "chose" },
  { pattern: "choose ", label: "choose" },
  { pattern: "instead of", label: "instead-of" },
  { pattern: "over ", label: "over" },
  { pattern: "tradeoff", label: "tradeoff" },
  { pattern: "trade-off", label: "tradeoff" },
  { pattern: "rationale:", label: "rationale:" },
  { pattern: "reason:", label: "reason:" },
  { pattern: "because ", label: "because" },
  { pattern: "rather than", label: "rather-than" },
  { pattern: "in favor of", label: "in-favor-of" },
];

/** Check whether a commit message is likely to carry design rationale. */
export function matchRationaleKeywords(message: string): string[] {
  const lowered = message.toLowerCase();
  const matched = new Set<string>();
  for (const { pattern, label } of RATIONALE_KEYWORDS) {
    if (lowered.includes(pattern)) {
      matched.add(label);
    }
  }
  return Array.from(matched);
}

/**
 * Parse the output of `git log --format=...` into `DecisionCandidate` records.
 * Exposed separately from `scanGitLog` so the function is testable without
 * a real git repository.
 *
 * The default format string uses two control bytes:
 *   - `%x1f` (US, 0x1F) — field separator within a record
 *   - `%x1e` (RS, 0x1E) — record separator
 *
 * This makes splitting unambiguous even when commit messages contain
 * newlines.
 */
export function parseGitLogOutput(
  raw: string,
  matchedFilter?: (msg: string) => string[],
): DecisionCandidate[] {
  const REC = "\u001e";
  const FLD = "\u001f";
  const records = raw.split(REC).filter((r) => r.trim().length > 0);
  const candidates: DecisionCandidate[] = [];
  for (const rec of records) {
    const fields = rec.split(FLD);
    if (fields.length < 5) continue;
    const [commitHash, author, date, title, ...rest] = fields;
    // Last field is the file list (newline-separated filenames, no trailing
    // newline thanks to `--name-only`'s output).
    const filesLine = rest[rest.length - 1] ?? "";
    const bodyLines = rest.slice(0, -1);
    const body = [title, ...bodyLines].join("\n");
    const filesChanged = filesLine
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    const matchedKeywords = matchedFilter
      ? matchedFilter(body)
      : matchRationaleKeywords(body);
    if (matchedKeywords.length === 0) continue;
    candidates.push({
      source: "git-commit",
      commitHash,
      author,
      date,
      title: title.trim(),
      body: body.trim(),
      matchedKeywords,
      filesChanged,
    });
  }
  return candidates;
}

/** Options for `scanGitLog`. */
export interface ScanGitLogOptions {
  /** Path to the git repository. Default: cwd. */
  cwd?: string;
  /** Max commits to inspect. Default: 200. */
  maxCount?: number;
  /** Only consider commits on/after this date (ISO 8601). */
  since?: string;
  /** Only consider commits up to this date (ISO 8601). */
  until?: string;
}

/**
 * Run `git log` and extract decision candidates from the commit history.
 * Returns an empty array if the cwd is not a git repo, git is not installed,
 * or no commit message matches a rationale keyword.
 */
export async function scanGitLog(
  options: ScanGitLogOptions = {},
): Promise<DecisionCandidate[]> {
  const cwd = options.cwd ?? process.cwd();
  const maxCount = options.maxCount ?? 200;
  // %x1f (US) = field separator, %x1e (RS) = record separator
  const format = "%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e";
  const args = [
    "log",
    `--max-count=${maxCount}`,
    "--name-only",
    `--format=${format}`,
  ];
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);

  let stdout: string;
  try {
    const result = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err) {
    // Not a git repo, git not installed, or no commits — return empty.
    return [];
  }
  return parseGitLogOutput(stdout);
}
