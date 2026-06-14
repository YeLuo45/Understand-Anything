/**
 * DecisionTree — V14 Direction A
 *
 * Renders the decision hierarchy: chosen decision → its alternatives.
 * Highlights superseded links if a decision has been replaced.
 */
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

export default function DecisionTree({
  decision,
  all,
}: {
  decision: ArchitectureDecisionRecord;
  all: ArchitectureDecisionRecord[];
}) {
  const supersededBy = decision.supersededBy
    ? all.find((d) => d.id === decision.supersededBy)
    : null;
  const supersedes = all.filter((d) => d.supersededBy === decision.id);

  return (
    <div className="text-xs p-3 space-y-2" data-testid="why-decision-tree">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted">
        Decision tree
      </h3>
      <ul className="space-y-1">
        <li>
          <span className="text-accent font-medium">✓ {decision.title}</span>
          <span className="ml-1 text-[10px] text-text-muted">
            ({decision.status})
          </span>
        </li>
        {decision.alternatives.map((a) => (
          <li key={a.name} className="ml-4 text-text-muted">
            <span>↳ {a.name}</span>
            <span className="ml-1 text-[10px] italic">— rejected</span>
          </li>
        ))}
        {supersededBy && (
          <li className="ml-4 text-blue-400">
            <span>↳ Superseded by: {supersededBy.title}</span>
          </li>
        )}
        {supersedes.length > 0 && (
          <li className="ml-4 text-yellow-500">
            <span>↳ Supersedes: {supersedes.map((d) => d.title).join(", ")}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
