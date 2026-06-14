/**
 * Vite middleware — serve decisions-graph.json (V28)
 *
 * The dashboard's vite.config.ts already has a `graphFileCandidates` helper
 * that serves the knowledge graph from `.understand-anything/`. This file
 * extends the same pattern to ALSO serve the decisions graph next to it.
 *
 * Importable from vite.config.ts:
 *   import { decisionsGraphMiddleware } from "./utils/decisions-graph-middleware";
 *   server.middlewares.use(decisionsGraphMiddleware());
 */

import type { Connect } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/** Search 3 candidate locations for decisions-graph.json, mirror of graphFileCandidates. */
export function findDecisionsFile(cwd: string): string | null {
  const candidates = [
    resolve(cwd, ".understand-anything/decisions-graph.json"),
    resolve(cwd, "../../../.understand-anything/decisions-graph.json"),
    process.env.DECISIONS_GRAPH_DIR
      ? resolve(process.env.DECISIONS_GRAPH_DIR, "decisions-graph.json")
      : "",
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Connect-style middleware that serves /decisions-graph.json with no caching. */
export function decisionsGraphMiddleware(cwd = process.cwd()): Connect.NextHandleFunction {
  return async function handleDecisionsGraph(req, res, next) {
    if (!req.url || !req.url.startsWith("/decisions-graph.json")) return next();
    const file = findDecisionsFile(cwd);
    if (!file) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "decisions-graph.json not found",
          hint: "Run /understand-decisions in the target repo",
        }),
      );
      return;
    }
    try {
      const raw = await readFile(file, "utf8");
      res.setHeader("Content-Type", "application/json");
      // CRITICAL: no-store prevents stale error responses from being
      // cached by the browser across schema iterations.
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.end(raw);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: `failed to read decisions-graph.json: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }),
      );
    }
  };
}
