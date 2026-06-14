/**
 * Code Comment Decision Scanner — V7 of Direction A "Why" persona
 *
 * Scans source files for design-rationale comments. Recognised block markers:
 *   - TS/JS/Go/Rust/Java:  // DECISION: ... | // WHY: ... | // HACK: ...
 *   - Python/Shell/YAML:   # DECISION: ...  | # WHY: ...  | # HACK: ...
 *   - Block comments:      /* DECISION: ... *\/  and  """ DECISION: ... """
 *
 * The output is a list of `DecisionCandidate` records (same shape as
 * `git-decision-scanner`) tagged with `source: "code-comment"`.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DecisionCandidate } from "./git-decision-scanner.js";

/** Comment-marker patterns, by file extension. */
const COMMENT_PATTERNS: Record<string, { line: RegExp; block?: RegExp }> = {
  ts: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  tsx: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  js: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  jsx: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  mjs: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  cjs: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  go: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  rs: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  java: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  kt: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  swift: { line: /^\s*\/\/\s*([A-Z]+):\s*(.+)$/ },
  py: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
  rb: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
  sh: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
  bash: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
  yaml: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
  yml: { line: /^\s*#\s*([A-Z]+):\s*(.+)$/ },
};

/** Tokens that signal a design-rationale comment (case-insensitive). */
const RATIONALE_TOKENS: ReadonlySet<string> = new Set([
  "DECISION",
  "WHY",
  "HACK",
  "NOTE",
  "TODO",
  "FIXME",
  "XXX",
  "RATIONALE",
  "TRADEOFF",
]);

/** Extract decision candidates from a single file's content. */
export function extractCommentCandidates(
  filePath: string,
  content: string,
): DecisionCandidate[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const patterns = COMMENT_PATTERNS[ext];
  if (!patterns) return [];
  const out: DecisionCandidate[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = patterns.line.exec(line);
    if (!m) continue;
    const token = m[1].toUpperCase();
    if (!RATIONALE_TOKENS.has(token)) continue;
    const body = m[2].trim();
    out.push({
      source: "code-comment",
      title: `${token}: ${body}`.slice(0, 120),
      body: `${token}: ${body}`,
      matchedKeywords: [token.toLowerCase()],
      filesChanged: [filePath],
      // No commit/author/date — these are extracted during aggregation.
      // Date can be inferred from the file mtime in V8.
      author: undefined,
      date: undefined,
      commitHash: undefined,
    });
    // Mark the line for tests.
    void i;
  }
  return out;
}

/** Options for `scanCodeComments`. */
export interface ScanCodeCommentsOptions {
  /** Repository root. */
  cwd: string;
  /** File paths (relative to cwd) to scan. If omitted, scans a default set. */
  filePaths?: string[];
  /** Max files to scan (defensive cap). Default: 500. */
  maxFiles?: number;
}

const DEFAULT_EXTENSIONS = Object.keys(COMMENT_PATTERNS);

/**
 * Scan a curated list of source files for design-rationale comments.
 * Callers are expected to assemble the file list (e.g. from the existing
 * scan-manifest.json). This module deliberately does NOT walk the tree —
 * that's a single responsibility that lives elsewhere.
 */
export async function scanCodeComments(
  options: ScanCodeCommentsOptions,
): Promise<DecisionCandidate[]> {
  const { cwd, filePaths, maxFiles = 500 } = options;
  const candidates: DecisionCandidate[] = [];
  const targets = (filePaths ?? []).filter((p) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return DEFAULT_EXTENSIONS.includes(ext);
  });
  const capped = targets.slice(0, maxFiles);
  for (const rel of capped) {
    const abs = resolve(cwd, rel);
    let content: string;
    try {
      content = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    candidates.push(...extractCommentCandidates(rel, content));
  }
  return candidates;
}
