/**
 * MCP server core — V11 of Direction B
 *
 * Tiny JSON-RPC 2.0 server over stdio. Pure Node, zero external deps.
 * Reads one JSON object per line from stdin, writes one JSON object
 * per line to stdout. Errors are returned as JSON-RPC error objects.
 */
import type { ArchitectureDecisionRecord } from "../types.js";

/** A small "tool" descriptor. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** A small "resource" descriptor. */
export interface ResourceDef {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** JSON-RPC 2.0 request shape. */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 success response. */
interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string;
  result: unknown;
}

/** JSON-RPC 2.0 error response. */
interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

export interface ServerOptions {
  decisions: ReadonlyArray<ArchitectureDecisionRecord>;
  tools: ReadonlyArray<ToolDef>;
  resources: ReadonlyArray<ResourceDef>;
  /** Dispatch a tool call. Tests can pass a custom dispatcher. */
  dispatchToolCall: (name: string, args: Record<string, unknown>) => unknown;
}

/**
 * A transport-agnostic server. `.start()` wires up the stdio transport.
 * Tests call `.handle()` directly with a parsed JSON object.
 */
export class McpDecisionsServer {
  private readonly decisions: ReadonlyArray<ArchitectureDecisionRecord>;
  private readonly tools: ReadonlyArray<ToolDef>;
  private readonly resources: ReadonlyArray<ResourceDef>;
  private readonly dispatchToolCall: (name: string, args: Record<string, unknown>) => unknown;

  constructor(options: ServerOptions) {
    this.decisions = options.decisions;
    this.tools = options.tools;
    this.resources = options.resources;
    this.dispatchToolCall = options.dispatchToolCall;
  }

  /** Process one JSON-RPC request and return a response (or null for
   *  notifications that don't require a reply). */
  handle(req: JsonRpcRequest): JsonRpcSuccess | JsonRpcError | null {
    try {
      switch (req.method) {
        case "initialize":
          return ok(req.id, {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "ua-decisions-mcp", version: "1.0.0" },
            capabilities: { tools: {}, resources: {} },
          });
        case "ping":
          return ok(req.id, { ok: true });
        case "tools/list":
          return ok(req.id, { tools: this.tools });
        case "resources/list":
          return ok(req.id, { resources: this.resources });
        case "resources/read": {
          const uri = (req.params?.uri ?? "") as string;
          if (uri === "decisions-graph://all") {
            return ok(req.id, {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(this.decisions),
                },
              ],
            });
          }
          return errResp(req.id, -32602, `Unknown resource: ${uri}`);
        }
        case "tools/call": {
          const name = (req.params?.name ?? "") as string;
          const input = (req.params?.arguments ?? {}) as Record<string, unknown>;
          if (!name) return errResp(req.id, -32602, "Missing tool name");
          try {
            const result = this.dispatchToolCall(name, input);
            return ok(req.id, { content: [{ type: "json", json: result }] });
          } catch (e) {
            return errResp(req.id, -32603, `Tool failed: ${(e as Error).message}`);
          }
        }
        default:
          return errResp(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (e) {
      return errResp(req.id, -32603, `Server error: ${(e as Error).message}`);
    }
  }

  /** Start the server reading JSON-RPC from stdin / writing to stdout. */
  start(): void {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const trimmed = line.trim();
        if (!trimmed) continue;
        let req: JsonRpcRequest;
        try {
          req = JSON.parse(trimmed);
        } catch {
          process.stdout.write(
            JSON.stringify(errResp(null, -32700, "Parse error")) + "\n",
          );
          continue;
        }
        const res = this.handle(req);
        if (res) process.stdout.write(JSON.stringify(res) + "\n");
      }
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => process.exit(0));
  }
}

/** Helper: success response. */
function ok(id: number | string, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

/** Helper: error response. */
function errResp(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

/** Factory. */
export function createServer(options: ServerOptions): McpDecisionsServer {
  return new McpDecisionsServer(options);
}
