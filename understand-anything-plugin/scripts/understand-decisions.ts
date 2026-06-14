/**
 * /understand-decisions command — V24 Direction A
 *
 * Standalone Node script that runs the full decision-extraction pipeline on
 * a target git repo and writes `decisions-graph.json` to the repo's
 * `.understand-anything/` directory.
 *
 * Usage:
 *   tsx scripts/understand-decisions.ts [path-to-repo]
 *   tsx scripts/understand-decisions.ts                # uses cwd
 *   tsx scripts/understand-decisions.ts --max=500 --since=2025-01-01
 *
 * Output: <repo>/.understand-anything/decisions-graph.json
 */
import { writeFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  scanGitLog,
  scanCodeComments,
  extractDecisions,
  matchRationaleKeywords,
  type DecisionCandidate,
} from "@understand-anything/core";

const execFileAsync = promisify(execFile);

interface CliArgs {
  repo: string;
  max: number;
  since?: string;
  until?: string;
  fileLimit: number;
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = {
    repo: process.cwd(),
    max: 200,
    fileLimit: 1000,
    out: ".understand-anything/decisions-graph.json",
    dryRun: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--max=")) out.max = Number(arg.slice("--max=".length));
    else if (arg.startsWith("--since=")) out.since = arg.slice("--since=".length);
    else if (arg.startsWith("--until=")) out.until = arg.slice("--until=".length);
    else if (arg.startsWith("--file-limit="))
      out.fileLimit = Number(arg.slice("--file-limit=".length));
    else if (arg === "--dry-run") out.dryRun = true;
    else if (!arg.startsWith("-")) out.repo = resolve(arg);
  }
  return out;
}

/** List source files via `git ls-files` (caps at fileLimit). */
async function listSourceFiles(cwd: string, fileLimit: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--cached", "--exclude-standard"],
      { cwd, maxBuffer: 4 * 1024 * 1024 },
    );
    const all = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return all.slice(0, fileLimit);
  } catch {
    return [];
  }
}

async function gitHead(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo;
  // Make sure the repo exists.
  try {
    await stat(repo);
  } catch {
    console.error(`✗ repo not found: ${repo}`);
    process.exit(1);
  }

  console.log(`▸ scanning git log (max=${args.max}${args.since ? `, since=${args.since}` : ""})`);
  const gitCandidates: DecisionCandidate[] = await scanGitLog({
    cwd: repo,
    maxCount: args.max,
    since: args.since,
    until: args.until,
  });
  console.log(`  · ${gitCandidates.length} candidate${gitCandidates.length === 1 ? "" : "s"} from git log`);

  console.log(`▸ scanning code comments (file-limit=${args.fileLimit})`);
  const filePaths = await listSourceFiles(repo, args.fileLimit);
  const commentCandidates: DecisionCandidate[] = await scanCodeComments({
    cwd: repo,
    filePaths,
  });
  console.log(`  · ${commentCandidates.length} candidate${commentCandidates.length === 1 ? "" : "s"} from code comments`);

  const all = [...gitCandidates, ...commentCandidates];
  // Drop low-signal noise: commits shorter than 8 chars match only one weak
  // keyword like "over" or "decided" without a contrasting alternative.
  const filtered = all.filter(
    (c) => c.matchedKeywords.length >= 1 && c.body.length > 0,
  );
  console.log(`▸ ${filtered.length}/${all.length} candidates survive heuristic filter`);

  const head = await gitHead(repo);
  const graph = {
    version: "1.0",
    project: {
      name: repo.split("/").pop() ?? "unknown",
      analyzedAt: new Date().toISOString(),
      gitCommitHash: head,
    },
    decisions: extractDecisions(filtered, {
      project: {
        name: repo.split("/").pop() ?? "unknown",
        analyzedAt: new Date().toISOString(),
        gitCommitHash: head,
      },
    }),
  };

  console.log(`▸ ${graph.decisions.length} ADR${graph.decisions.length === 1 ? "" : "s"} produced`);

  if (args.dryRun) {
    console.log("▸ --dry-run set, not writing output");
    console.log(JSON.stringify(graph, null, 2).slice(0, 600) + "…");
    return;
  }

  const outDir = resolve(repo, ".understand-anything");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "decisions-graph.json");
  await writeFile(outPath, JSON.stringify(graph, null, 2));
  console.log(`✓ wrote ${outPath}`);
}

main().catch((err) => {
  console.error("✗ /understand-decisions failed:", err);
  process.exit(1);
});
