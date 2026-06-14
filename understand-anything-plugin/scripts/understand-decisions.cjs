#!/usr/bin/env node
/**
 * Standalone CJS runner for /understand-decisions — V29 E2E
 * Uses the prebuilt @understand-anything/core package directly.
 */
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { writeFile, mkdir, stat } = require("node:fs/promises");
const { resolve } = require("node:path");
const execFileAsync = promisify(execFile);

const corePath = path.resolve(
  __dirname,
  "..",
  "packages",
  "core",
  "dist",
  "index.js",
);
const {
  scanGitLog,
  scanCodeComments,
  extractDecisions,
} = require(corePath);

async function listSourceFiles(cwd, fileLimit) {
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

async function gitHead(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd,
    });
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

(async () => {
  const repo = process.argv[2] || process.cwd();
  const max = Number(
    (process.argv.find((a) => a.startsWith("--max=")) || "").slice(6) || 50,
  );

  await stat(repo);
  console.log(`▸ scanning git log (max=${max})`);
  const gitCandidates = await scanGitLog({ cwd: repo, maxCount: max });
  console.log(
    `  · ${gitCandidates.length} candidate${gitCandidates.length === 1 ? "" : "s"} from git log`,
  );

  console.log("▸ scanning code comments");
  const filePaths = await listSourceFiles(repo, 1000);
  const commentCandidates = await scanCodeComments({ cwd: repo, filePaths });
  console.log(
    `  · ${commentCandidates.length} candidate${commentCandidates.length === 1 ? "" : "s"} from code comments`,
  );

  const all = [...gitCandidates, ...commentCandidates];
  const filtered = all.filter(
    (c) => c.matchedKeywords.length >= 1 && c.body.length > 0,
  );
  console.log(`▸ ${filtered.length}/${all.length} candidates survive filter`);

  const head = await gitHead(repo);
  const name = repo.split("/").pop() || "unknown";
  const graph = {
    version: "1.0",
    project: { name, analyzedAt: new Date().toISOString(), gitCommitHash: head },
    decisions: extractDecisions(filtered, {
      project: { name, analyzedAt: new Date().toISOString(), gitCommitHash: head },
    }),
  };
  console.log(`▸ ${graph.decisions.length} ADR${graph.decisions.length === 1 ? "" : "s"} produced`);

  const outDir = resolve(repo, ".understand-anything");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "decisions-graph.json");
  await writeFile(outPath, JSON.stringify(graph, null, 2));
  console.log(`✓ wrote ${outPath}`);
  console.log(`\nFirst 3 decisions:`);
  for (const d of graph.decisions.slice(0, 3)) {
    console.log(`  - [${d.source}] ${d.title}`);
    console.log(`    ${d.decision.slice(0, 80)}…`);
  }
})().catch((err) => {
  console.error("✗ /understand-decisions failed:", err.message);
  process.exit(1);
});
