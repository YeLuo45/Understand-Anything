/**
 * Archaeology diff source — V3 of Direction B
 *
 * Augments an `ArchaeologyCandidate` with concrete code-change footprint:
 *   - `insertions` / `deletions` (line counts from `git log --numstat`)
 *   - `affectedLayers` (the set of layer ids the changed files belong to)
 *   - `affectedNodeIds` (graph node ids; identical to the V2 parser's
 *     `linkedNodeIds`, but computed independently so callers can
 *     inspect the raw mapping)
 *
 * The diff source is best-effort: when the candidate's commit hash is
 * missing or the cwd is not a git repo, the augmented fields are
 * empty / zero and the rest of the candidate is returned unchanged.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ArchaeologyCandidate } from "./archaeology-scanner.js";

const execFileAsync = promisify(execFile);

/** Same shape as `ArchaeologyCandidate`, with diff fields added. */
export interface ArchaeologyCandidateWithDiff extends ArchaeologyCandidate {
  /** Sum of insertions across all files (0 if unknown). */
  insertions: number;
  /** Sum of deletions across all files (0 if unknown). */
  deletions: number;
  /** Graph-layer ids inferred from the file paths (best-effort). */
  affectedLayers: string[];
  /** Graph node ids derived from the changed file paths. */
  affectedNodeIds: string[];
}

/** Map a file path to a graph-layer id. Mirrors the V1 14-layer rules.
 *  The patterns match either a path segment or a substring — e.g.
 *  "/analyzer/foo.ts" and "src/analyzer/foo.ts" both match "analyzer". */
const LAYER_PATTERNS: ReadonlyArray<{ layer: string; re: RegExp }> = [
  { layer: "analyzer", re: /(?:^|\/)analyzer(?:\/|$)/ },
  { layer: "core", re: /(?:^|\/)(?:packages\/[^/]+\/src\/)?core(?:\/|$)/ },
  { layer: "ui", re: /(?:^|\/)(?:components|src\/ui|dashboard)(?:\/|$)/ },
  { layer: "test", re: /(?:^|\/)__tests__|tests?\/|\.test\.|\.spec\./ },
  { layer: "docs", re: /(?:^|\/)(?:docs|README)|\.md$/i },
  { layer: "config", re: /(?:^|\/)(?:\.eslintrc|\.prettierrc|tsconfig|package\.json|config\/)/ },
];

/** Compute the set of layer ids that the file paths touch. */
export function inferLayersFromPaths(paths: ReadonlyArray<string>): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    for (const { layer, re } of LAYER_PATTERNS) {
      if (re.test(p)) {
        out.add(layer);
        break; // first match wins
      }
    }
  }
  return Array.from(out).sort();
}

/** Convert file paths to graph node ids ("file:<path>"). */
export function pathsToNodeIds(paths: ReadonlyArray<string>): string[] {
  return paths.map((p) => `file:${p}`);
}

/** Parse `git log --numstat` output into { insertions, deletions, files }. */
export function parseNumstat(raw: string): {
  insertions: number;
  deletions: number;
  files: string[];
} {
  let insertions = 0;
  let deletions = 0;
  const files: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const ins = parts[0] === "-" ? 0 : Number(parts[0]);
    const del = parts[1] === "-" ? 0 : Number(parts[1]);
    if (Number.isFinite(ins)) insertions += ins;
    if (Number.isFinite(del)) deletions += del;
    files.push(parts[2]!);
  }
  return { insertions, deletions, files };
}

/** Augment one candidate with diff data. */
export function augmentWithDiff(
  candidate: ArchaeologyCandidate,
  numstat: { insertions: number; deletions: number; files: string[] } | null,
): ArchaeologyCandidateWithDiff {
  // If numstat files are available, prefer them; otherwise fall back to
  // the candidate's own `filesChanged` (which is what %f gave us).
  const files = numstat?.files.length ? numstat.files : candidate.filesChanged;
  return {
    ...candidate,
    insertions: numstat?.insertions ?? 0,
    deletions: numstat?.deletions ?? 0,
    affectedLayers: inferLayersFromPaths(files),
    affectedNodeIds: pathsToNodeIds(files),
  };
}

/** Options for `enrichWithGitNumstat`. */
export interface EnrichOptions {
  cwd: string;
}

/** Run `git log --numstat -1 <commit>` to get the change footprint. */
export async function enrichWithGitNumstat(
  candidate: ArchaeologyCandidate,
  options: EnrichOptions,
): Promise<ArchaeologyCandidateWithDiff> {
  if (!candidate.commitHash || candidate.commitHash.length < 7) {
    return augmentWithDiff(candidate, null);
  }
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--numstat", "-1", candidate.commitHash],
      { cwd: options.cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    return augmentWithDiff(candidate, parseNumstat(stdout));
  } catch {
    return augmentWithDiff(candidate, null);
  }
}
