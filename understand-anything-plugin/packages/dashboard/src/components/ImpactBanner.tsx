/**
 * ImpactBanner — V9 of Direction B
 *
 * Shown above a selected node in NodeInfo. Surfaces the decisions that
 * would be affected if this node's file changes, with severity badges.
 *
 * The banner pulls the graph + decisions from the dashboard store, then
 * calls the core `impactFromNodes` to compute the impact set. When the
 * set is empty, the banner renders nothing.
 */
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import { impactFromNodes, type ImpactNode, type ImpactEdge } from "@understand-anything/core/analyzer/impact-propagation";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

const MAX_NODES_FOR_GRAPH = 5_000;

export default function ImpactBanner({ nodeId }: { nodeId: string }) {
  const graph = useDashboardStore((s) => s.graph);
  const decisionGraph = useDashboardStore((s) => s.decisionGraph);
  const select = useDashboardStore((s) => s.selectDecision);

  const impacted = useMemo(() => {
    if (!graph || !decisionGraph) return [];
    // Only run if the graph is small enough — impact propagation is
    // O(N + E) per start and we may want to cap at MAX_NODES_FOR_GRAPH
    // for very large repos.
    if (graph.nodes.length > MAX_NODES_FOR_GRAPH) return [];
    const nodes: ImpactNode[] = graph.nodes.map((n) => ({ id: n.id }));
    const edges: ImpactEdge[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }));
    return impactFromNodes(
      [nodeId],
      nodes,
      edges,
      decisionGraph.decisions as ArchitectureDecisionRecord[],
      { maxDepth: 2 },
    );
  }, [graph, decisionGraph, nodeId]);

  if (impacted.length === 0) return null;

  return (
    <div
      className="mx-3 my-2 rounded-md border-l-2 border-orange-500 bg-orange-500/10 px-2 py-1.5 text-xs"
      data-testid="impact-banner"
    >
      <div className="text-[10px] uppercase tracking-wider text-orange-400 mb-1">
        ⚠ Changing this file impacts {impacted.length} decision
        {impacted.length === 1 ? "" : "s"}
      </div>
      <ul className="space-y-0.5">
        {impacted.slice(0, 5).map((x) => (
          <li key={x.decision.id}>
            <button
              type="button"
              onClick={() => select(x.decision.id)}
              className="text-left text-orange-200 hover:underline"
            >
              {x.decision.title}{" "}
              <span
                className={`text-[9px] uppercase tracking-wider ${
                  x.severity === "critical"
                    ? "text-red-400"
                    : x.severity === "high"
                      ? "text-orange-400"
                      : x.severity === "medium"
                        ? "text-yellow-400"
                        : "text-text-muted"
                }`}
              >
                ({x.severity}, fan-out {x.fanOut})
              </span>
            </button>
          </li>
        ))}
        {impacted.length > 5 && (
          <li className="text-[10px] text-text-muted italic">
            + {impacted.length - 5} more…
          </li>
        )}
      </ul>
    </div>
  );
}
