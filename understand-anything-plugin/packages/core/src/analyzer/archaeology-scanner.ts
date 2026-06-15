/**
 * Code Archaeology — V1 of Direction B (feature/20260616)
 *
 * Scans a git repository's history for commits whose messages follow
 * ADR-style conventions and emits them as **ADR candidates** that
 * downstream code (V2 parser) can turn into full Architecture Decision
 * Records.
 *
 * Recognised commit-message prefixes (case-insensitive):
 *   - "ADR: …" / "adr: …"     — explicit ADR marker
 *   - "decide: …" / "decided: …" — short form
 *   - "rfc: …" / "RFC: …"     — request-for-comments
 *   - "arch: …" / "decision: …" — additional explicit forms
 *   - "[ADR] …"              — bracket-style
 *
 * The output is a list of `ArchaeologyCandidate` records — *raw* signals,
 * similar to the V6 DecisionCandidate from R2. Heuristic-only; no LLM.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** A raw archaeology candidate extracted from a single commit. */
export interface ArchaeologyCandidate {
  /** Stable id (commit short hash + 0-based index). */
  id: string;
  /** Where the candidate came from. */
  source: "git-commit";
  /** Commit short hash. */
  commitHash: string;
  /** Commit author. */
  author: string;
  /** ISO 8601 commit date. */
  date: string;
  /** First line of the commit message (the title). */
  title: string;
  /** Full commit message body (title + body, joined by \n). */
  body: string;
  /** List of recognised prefix tokens (e.g. "adr:", "rfc:"). */
  matchedPrefixes: string[];
  /** Files changed by this commit (paths relative to repo root). */
  filesChanged: string[];
  /** Insertions / deletions, when available. */
  insertions: number;
  deletions: number;
}

/** Commit-message prefixes that mark an ADR-style commit. */
export const ADR_PREFIXES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^\s*adr:\s/i, label: "adr:" },
  { pattern: /^\s*\[adr\]\s/i, label: "[adr]" },
  { pattern: /^\s*decide[ds]?:\s/i, label: "decide" },
  { pattern: /^\s*rfc:\s/i, label: "rfc:" },
  { pattern: /^\s*arch(itecture)?:\s/i, label: "arch:" },
  { pattern: /^\s*decision:\s/i, label: "decision:" },
];

/** Detect ADR prefixes in a single commit message (case-insensitive). */
export function matchADRPrefixes(message: string): string[] {
  const out: string[] = [];
  const title = message.split("\n", 1)[0] ?? message;
  for (const { pattern, label } of ADR_PREFIXES) {
    if (pattern.test(title)) out.push(label);
  }
  return out;
}

/** Format-string for `git log` that produces a parseable stream of records. */
const ARCHAEOLOGY_FORMAT = "%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1f%f";

/**
 * Parse the output of `git log --format=…` into `ArchaeologyCandidate`
 * records, filtered to those whose commit message matches an ADR
 * prefix.
 */
export function parseArchaeologyLog(raw: string): ArchaeologyCandidate[] {
  const REC = "\u001e";
  const FLD = "\u001f";
  const records = raw.split(REC).filter((r) => r.trim().length > 0);
  const out: ArchaeologyCandidate[] = [];
  let index = 0;
  for (const rec of records) {
    const fields = rec.split(FLD);
    // format is: hash, author, date, subject, body, files
    if (fields.length < 5) continue;
    const [commitHash, author, date, subject, body, filesAndStats] = fields;
    const fullMessage = body ? `${subject}\n\n${body}`.trim() : subject;
    const matchedPrefixes = matchADRPrefixes(fullMessage);
    if (matchedPrefixes.length === 0) continue;

    // filesAndStats is "--numstat"-style: "10\t2\tpath/to/file\n…"
    // But our format uses %f which is "name1name2…" with no separator.
    // Use a fallback split by tab + name, then re-split the file block
    // by newlines. If neither works, treat the whole string as one file.
    const filesChanged = filesAndStats
      ? filesAndStats.split("\n").flatMap((line) => {
          const parts = line.split("\t");
          if (parts.length >= 3) {
            // numstat: insertions\tdeletions\tfile
            return [parts[2]!];
          }
          // %f format: filenames concatenated
          return [line];
        }).filter((f) => f.length > 0)
      : [];

    out.push({
      id: `${commitHash.slice(0, 7)}-${index.toString().padStart(3, "0")}`,
      source: "git-commit",
      commitHash,
      author,
      date,
      title: subject.trim(),
      body: fullMessage,
      matchedPrefixes,
      filesChanged,
      insertions: 0,
      deletions: 0,
    });
    index++;
  }
  return out;
}

/** Options for `scanGitArchaeology`. */
export interface ScanArchaeologyOptions {
  /** Repository root. Default: cwd. */
  cwd?: string;
  /** Max commits to inspect. Default: 500. */
  maxCount?: number;
  /** Only commits on/after this ISO 8601 date. */
  since?: string;
  /** Only commits up to this ISO 8601 date. */
  until?: string;
  /** Only include commits whose message matches these prefix labels. */
  onlyPrefixes?: ReadonlyArray<string>;
}

/**
 * Run `git log` and return ADR-style commit candidates. Returns [] if
 * the cwd is not a git repo, git is not installed, or no commit matches.
 */
export async function scanGitArchaeology(
  options: ScanArchaeologyOptions = {},
): Promise<ArchaeologyCandidate[]> {
  const cwd = options.cwd ?? process.cwd();
  const maxCount = options.maxCount ?? 500;
  const args = [
    "log",
    `--max-count=${maxCount}`,
    "--name-only",
    `--format=${ARCHAEOLOGY_FORMAT}`,
  ];
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  let stdout: string;
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch {
    return [];
  }
  const all = parseArchaeologyLog(stdout);
  if (!options.onlyPrefixes || options.onlyPrefixes.length === 0) return all;
  const wanted = new Set(options.onlyPrefixes);
  return all.filter((c) => c.matchedPrefixes.some((p) => wanted.has(p)));
}
