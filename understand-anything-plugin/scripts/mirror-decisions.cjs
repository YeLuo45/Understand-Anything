#!/usr/bin/env node
/**
 * /mirror-decisions CLI — V23 of Direction B
 *
 * Read a foreign mirror file, compare with the local decisions-graph,
 * and print a summary of matches + drift + remote-only entries.
 *
 * Usage:
 *   node scripts/mirror-decisions.cjs <foreign-mirror.json>
 */
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const core = require("@understand-anything/core");

const { resolveCrossRepo, findLocalMatches, findForeignOnly } = core;

(async () => {
  const foreignPath = process.argv[2];
  if (!foreignPath) {
    console.error("Usage: node mirror-decisions.cjs <foreign-mirror.json>");
    process.exit(1);
  }
  const foreign = JSON.parse(await readFile(resolve(foreignPath), "utf8"));
  const local = core.buildMirror(
    JSON.parse(
      await readFile(
        resolve(process.cwd(), ".understand-anything/decisions-graph.json"),
        "utf8",
      ).catch(() => '{"decisions":[]}'),
    ).decisions ?? [],
    process.cwd().split("/").pop() ?? "local",
  ).entries.map((e) => ({ id: e.id, title: e.title, decision: "" }));

  const localDecisions = local.map((d) => ({
    id: d.id,
    title: d.title,
    decision: "",
    consequences: { positive: [], negative: [] },
    alternatives: [],
    date: "",
    source: "manual",
    tags: [],
    linkedNodeIds: [],
    complexity: "simple",
  }));

  const fMirror = { project: foreign.project, entries: foreign.entries ?? [] };
  const matches = findLocalMatches(localDecisions, fMirror);
  const remoteOnly = findForeignOnly(localDecisions, fMirror);

  console.log(`▸ ${matches.length} local↔foreign match${matches.length === 1 ? "" : "es"}`);
  for (const m of matches) {
    console.log(
      `  - ${m.local.id} :: ${m.score === 1 ? "exact" : m.drift ? "drift" : "match"} :: ${m.local.title.slice(0, 50)}`,
    );
  }
  console.log(`▸ ${remoteOnly.length} foreign-only entr${remoteOnly.length === 1 ? "y" : "ies"}`);
  for (const e of remoteOnly.slice(0, 5)) {
    console.log(`  - ${e.id} :: ${e.title.slice(0, 60)}`);
  }
  void resolveCrossRepo;
})().catch((e) => {
  console.error("✗ /mirror-decisions failed:", e.message);
  process.exit(1);
});
