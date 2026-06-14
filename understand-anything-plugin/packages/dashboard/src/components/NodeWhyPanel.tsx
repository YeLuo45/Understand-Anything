/**
 * NodeWhyPanel — V19 Direction A
 *
 * Side panel section that shows the user "Why does this code exist?"
 * when a graph node is selected. Surfaces all decisions that reference
 * the node, grouped by source.
 */
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import {
  buildNodeToDecisionsIndex,
  groupDecisionsBySource,
} from "../utils/decision-linking";

const SOURCE_LABEL: Record<string, string> = {
  "git-commit": "Git commits",
  "code-comment": "Code comments",
  "llm-inferred": "LLM inferences",
  manual: "Manual ADRs",
};

export default function NodeWhyPanel({ nodeId }: { nodeId: string }) {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const select = useDashboardStore((s) => s.selectDecision);

  const decisions = useMemo(() => {
    if (!graph) return [];
    const idx = buildNodeToDecisionsIndex(graph.decisions);
    return idx.get(nodeId) ?? [];
  }, [graph, nodeId]);

  const grouped = useMemo(
    () => groupDecisionsBySource(decisions),
    [decisions],
  );

  if (decisions.length === 0) {
    return (
      <div
        className="text-[10px] text-text-muted italic px-3 py-2"
        data-testid="node-why-empty"
      >
        No decisions reference this node yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2" data-testid="node-why-panel">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted">
        Why this code? ({decisions.length})
      </h3>
      {Array.from(grouped.entries()).map(([source, list]) => (
        <div key={source}>
          <div className="text-[9px] uppercase tracking-wider text-text-muted/80 mb-0.5">
            {SOURCE_LABEL[source] ?? source} · {list.length}
          </div>
          <ul className="space-y-0.5">
            {list.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => select(d.id)}
                  className="text-left text-[11px] text-accent hover:underline"
                >
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
