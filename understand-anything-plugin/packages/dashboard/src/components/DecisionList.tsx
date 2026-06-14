/**
 * DecisionList — V11 Direction A
 *
 * Left-side panel of WhyView. Renders a searchable, source-filterable list
 * of decisions extracted from the ADR graph.
 */
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

type Status = ArchitectureDecisionRecord["status"];

const STATUS_DOT: Record<Status, string> = {
  proposed: "bg-yellow-500",
  accepted: "bg-green-500",
  deprecated: "bg-gray-500",
  superseded: "bg-blue-500",
};

const SOURCE_OPTIONS = ["", "git-commit", "code-comment", "llm-inferred", "manual"] as const;

export default function DecisionList() {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const selectedId = useDashboardStore((s) => s.selectedDecisionId);
  const select = useDashboardStore((s) => s.selectDecision);
  const query = useDashboardStore((s) => s.decisionSearchQuery);
  const setQuery = useDashboardStore((s) => s.setDecisionSearchQuery);
  const source = useDashboardStore((s) => s.decisionSourceFilter);
  const setSource = useDashboardStore((s) => s.setDecisionSourceFilter);

  const decisions = graph?.decisions ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decisions.filter((d) => {
      if (source && d.source !== source) return false;
      if (q) {
        const hay = `${d.title} ${d.decision} ${d.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [decisions, query, source]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 space-y-2 border-b border-border-subtle">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search decisions…"
          className="w-full px-2 py-1.5 rounded bg-elevated border border-border-subtle text-xs"
          data-testid="why-search"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full px-2 py-1 rounded bg-elevated border border-border-subtle text-[10px]"
          data-testid="why-source-filter"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "" ? "All sources" : opt}
            </option>
          ))}
        </select>
        <div className="text-[10px] text-text-muted">
          {filtered.length} / {decisions.length} decisions
        </div>
      </div>
      <ul
        className="flex-1 overflow-y-auto md:overflow-auto p-2 space-y-1 max-h-[50vh] md:max-h-none"
        data-testid="why-list"
      >
        {filtered.length === 0 && (
          <li className="text-[10px] text-text-muted italic p-2">
            No decisions match the current filter.
          </li>
        )}
        {filtered.map((d) => {
          const isSel = d.id === selectedId;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => select(d.id)}
                data-testid={`why-decision-${d.id}`}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  isSel
                    ? "bg-accent/20 text-accent"
                    : "hover:bg-elevated text-text-secondary"
                }`}
              >
                <div className="font-medium truncate">{d.title}</div>
                <div className="text-[10px] text-text-muted flex items-center gap-1">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[d.status]}`}
                  />
                  <span>{d.status}</span>
                  <span>·</span>
                  <span>{d.source}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
