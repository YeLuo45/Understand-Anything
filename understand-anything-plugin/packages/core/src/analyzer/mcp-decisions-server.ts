/**
 * MCP-style server for ADR/decision queries — V11 + V12 of Direction B
 *
 * Implements a minimal JSON-RPC 2.0 server over stdio that exposes
 * the decisions graph as MCP-style "tools" and "resources".
 */
import { createServer, type ToolDef, type ResourceDef } from "./mcp-core";
import type { ArchitectureDecisionRecord } from "../types.js";

/** V12 — Tool definitions. */
export const TOOL_DEFS: ReadonlyArray<ToolDef> = [
  {
    name: "search_decisions",
    description:
      "Search ADRs by free-text query over title, decision, and tags.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search string" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_decision",
    description: "Get a single ADR by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ADR id" } },
      required: ["id"],
    },
  },
  {
    name: "why_for_file",
    description: "Return ADRs that reference a given file path.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "File path (e.g. 'src/foo.ts')" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "related_to_decision",
    description: "Return graph-level impact for a decision.",
    inputSchema: {
      type: "object",
      properties: {
        decisionId: { type: "string", description: "Source ADR id" },
        maxDepth: { type: "number", description: "BFS depth (default 2)" },
      },
      required: ["decisionId"],
    },
  },
];

export const RESOURCE_DEFS: ReadonlyArray<ResourceDef> = [
  {
    uri: "decisions-graph://all",
    name: "All decisions",
    description: "The full ADR graph as a JSON document.",
    mimeType: "application/json",
  },
];

/** Tool implementations. */
export function makeToolHandlers(decisions: ReadonlyArray<ArchitectureDecisionRecord>) {
  return {
    search_decisions: (input: { query?: string; limit?: number }) => {
      const q = (input.query ?? "").toLowerCase();
      const limit = input.limit ?? 10;
      return decisions
        .filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.decision.toLowerCase().includes(q) ||
            d.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, limit)
        .map((d) => ({ id: d.id, title: d.title, status: d.status, source: d.source }));
    },
    get_decision: (input: { id?: string }) => {
      return decisions.find((x) => x.id === input.id) ?? null;
    },
    why_for_file: (input: { filePath?: string }) => {
      const nodeId = `file:${input.filePath ?? ""}`;
      return decisions
        .filter((d) => d.linkedNodeIds.includes(nodeId))
        .map((d) => ({ id: d.id, title: d.title, decision: d.decision.slice(0, 240) }));
    },
    related_to_decision: (_input: { decisionId?: string; maxDepth?: number }) => {
      // Without a graph prop, return [].
      return [];
    },
  };
}

/** V12b — Dispatch a tool call (used by tests + server). */
export function dispatchToolCall(
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
  name: string,
  input: Record<string, unknown>,
): unknown {
  const handlers = makeToolHandlers(decisions);
  const fn = (handlers as Record<string, (i: unknown) => unknown>)[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return fn(input);
}

/** V12b — A complete "session" test that drives every method. */
export function smokeSession(
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
  _graph: { nodes?: unknown[]; edges?: unknown[] } = {},
): {
  initialize: () => unknown;
  toolsList: () => unknown;
  resourcesList: () => unknown;
  toolCalls: () => Array<{ name: string; input: Record<string, unknown>; out: unknown }>;
} {
  return {
    initialize: () => ({ protocolVersion: "2024-11-05", serverInfo: { name: "ua-decisions-mcp", version: "1.0.0" } }),
    toolsList: () => ({ tools: TOOL_DEFS }),
    resourcesList: () => ({ resources: RESOURCE_DEFS }),
    toolCalls: () => [
      { name: "search_decisions", input: { query: "use", limit: 3 }, out: dispatchToolCall(decisions, "search_decisions", { query: "use", limit: 3 }) },
      { name: "get_decision", input: { id: decisions[0]?.id }, out: dispatchToolCall(decisions, "get_decision", { id: decisions[0]?.id }) },
      { name: "why_for_file", input: { filePath: "src/a.ts" }, out: dispatchToolCall(decisions, "why_for_file", { filePath: "src/a.ts" }) },
      { name: "related_to_decision", input: { decisionId: decisions[0]?.id, maxDepth: 2 }, out: dispatchToolCall(decisions, "related_to_decision", { decisionId: decisions[0]?.id, maxDepth: 2 }) },
    ],
  };
}

/** Factory that wires dispatchToolCall + creates the server. */
export function createDecisionsServer(
  decisions: ReadonlyArray<ArchitectureDecisionRecord>,
): McpDecisionsServer {
  return createServer({
    decisions,
    tools: TOOL_DEFS,
    resources: RESOURCE_DEFS,
    dispatchToolCall: (name, input) => dispatchToolCall(decisions, name, input),
  });
}

// Forward import (kept for API compatibility — McpDecisionsServer is
// the same class as createServer returns).
import { McpDecisionsServer } from "./mcp-core";
