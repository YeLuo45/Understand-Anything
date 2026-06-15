/**
 * Stale Decisions Banner — V13 of Direction A R2
 *
 * Inline warning that shows in NodeInfo when the selected node is
 * referenced by a stale decision. Datasource: decisions + changeInfo.
 */
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import { filterStale } from "@understand-anything/core/llm/why-impact";
import type { FileChangeInfo } from "@understand-anything/core/llm/why-impact";

export default function StaleDecisionsBanner({
  nodeId,
  changeInfo,
}: {
  nodeId: string;
  /** Optional — if absent, treats every file as fresh. */
  changeInfo?: ReadonlyMap<string, FileChangeInfo>;
}) {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const select = useDashboardStore((s) => s.selectDecision);

  const stale = useMemo(() => {
    if (!graph) return [];
    return filterStale(graph.decisions, changeInfo ?? new Map()).filter(
      ({ decision }) => decision.linkedNodeIds.includes(nodeId),
    );
  }, [graph, nodeId, changeInfo]);

  if (stale.length === 0) return null;

  return (
    <div
      className="mx-3 my-2 rounded-md border-l-2 border-yellow-500 bg-yellow-500/10 px-2 py-1.5 text-xs"
      data-testid="stale-decisions-banner"
    >
      <div className="text-[10px] uppercase tracking-wider text-yellow-500 mb-1">
        ⚠ {stale.length} stale decision{stale.length === 1 ? "" : "s"} reference this node
      </div>
      <ul className="space-y-0.5">
        {stale.map(({ decision, score }) => (
          <li key={decision.id}>
            <button
              type="button"
              onClick={() => select(decision.id)}
              className="text-left text-yellow-200 hover:underline"
            >
              {decision.title}{" "}
              <span className="text-[9px] text-yellow-500/80">
                ({score.bucket}, score {score.score.toFixed(2)})
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
