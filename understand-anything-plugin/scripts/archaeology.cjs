#!/usr/bin/env node
/**
 * /archaeology CLI — V4 of Direction B
 *
 * Run the full archaeology pipeline on a target git repo and write
 * the resulting ADR candidates to `adr-candidates.json`.
 *
 * Usage:
 *   node scripts/archaeology.cjs [path-to-repo] [--max=200] [--since=2024-01-01]
 *
 * Output: <repo>/.understand-anything/adr-candidates.json
 */
const { writeFile, mkdir, stat } = require("node:fs/promises");
const { resolve } = require("node:path");
const core = require("@understand-anything/core");

const { scanGitArchaeology, parseCandidates, enrichWithGitNumstat } = core;

function parseArgs(argv) {
  const out = {
    repo: process.cwd(),
    max: 200,
    since: undefined,
    out: ".understand-anything/adr-candidates.json",
  };
  for (const arg of argv) {
    if (arg.startsWith("--max=")) out.max = Number(arg.slice(6));
    else if (arg.startsWith("--since=")) out.since = arg.slice(8);
    else if (arg.startsWith("--out=")) out.out = arg.slice(6);
    else if (!arg.startsWith("-")) out.repo = resolve(arg);
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  try {
    await stat(args.repo);
  } catch {
    console.error(`✗ repo not found: ${args.repo}`);
    process.exit(1);
  }

  console.log(`▸ scanning git log for ADR candidates (max=${args.max}${args.since ? `, since=${args.since}` : ""})`);
  const raw = await scanGitArchaeology({
    cwd: args.repo,
    maxCount: args.max,
    since: args.since,
  });
  console.log(`  · ${raw.length} raw candidate${raw.length === 1 ? "" : "s"}`);

  console.log(`▸ enriching with numstat + inferring layers…`);
  const enriched = [];
  for (const c of raw) {
    const e = await enrichWithGitNumstat(c, { cwd: args.repo });
    enriched.push(e);
  }

  console.log(`▸ parsing into ADR drafts…`);
  const adrs = [];
  for (const c of enriched) {
    const adr = parseCandidates([c], {
      projectName: args.repo.split("/").pop() ?? "unknown",
    })[0];
    if (adr) adrs.push(adr);
  }
  console.log(`  · ${adrs.length} ADR${adrs.length === 1 ? "" : "s"} produced`);

  const out = {
    version: "1.0",
    project: {
      name: args.repo.split("/").pop() ?? "unknown",
      analyzedAt: new Date().toISOString(),
    },
    rawCandidates: enriched,
    decisions: adrs,
  };

  const outDir = resolve(args.repo, ".understand-anything");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "adr-candidates.json");
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`✓ wrote ${outPath}`);

  console.log(`\nFirst 3 candidates:`);
  for (const c of enriched.slice(0, 3)) {
    console.log(
      `  - ${c.commitHash.slice(0, 7)} | +${c.insertions}/-${c.deletions} | layers: ${c.affectedLayers.join(",")} | ${c.title.slice(0, 60)}`,
    );
  }
})().catch((err) => {
  console.error("✗ /archaeology failed:", err.message);
  process.exit(1);
});
