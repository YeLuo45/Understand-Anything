/**
 * Decision Timeline — V18 Direction A
 *
 * Renders decisions in chronological order with milestone markers.
 * Lightweight, no-deps implementation; used by the timeline tab in WhyView.
 */
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

export interface TimelineMilestone {
  /** ISO 8601 year-month (e.g. "2026-04"). All decisions in the same month
   *  collapse into a single milestone. */
  yearMonth: string;
  /** Display label. */
  label: string;
  /** Decisions in this milestone, sorted by date ascending. */
  decisions: ArchitectureDecisionRecord[];
}

/** Bucket decisions by year-month, returning a sorted list of milestones. */
export function buildTimeline(
  decisions: readonly ArchitectureDecisionRecord[],
): TimelineMilestone[] {
  const buckets = new Map<string, ArchitectureDecisionRecord[]>();
  for (const d of decisions) {
    const ym = (d.date ?? "").slice(0, 7) || "unknown";
    const arr = buckets.get(ym);
    if (arr) arr.push(d);
    else buckets.set(ym, [d]);
  }
  const months = Array.from(buckets.keys()).sort();
  return months.map((ym) => ({
    yearMonth: ym,
    label: ym === "unknown" ? "Unknown" : ym,
    decisions: (buckets.get(ym) ?? []).sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? ""),
    ),
  }));
}

/** React component (no JSX — pure function returning JSX-equivalent structure). */
import { useMemo } from "react";
import { useDashboardStore } from "../store";

export default function DecisionTimeline() {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const select = useDashboardStore((s) => s.selectDecision);
  const selectedId = useDashboardStore((s) => s.selectedDecisionId);

  const milestones = useMemo(
    () => buildTimeline(graph?.decisions ?? []),
    [graph],
  );

  if (milestones.length === 0) {
    return (
      <div className="text-[10px] text-text-muted italic p-3">
        No decisions on the timeline yet.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" data-testid="why-timeline">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted">
        Decision timeline ({milestones.length} months)
      </h3>
      <ol className="space-y-2">
        {milestones.map((m) => (
          <li key={m.yearMonth} className="border-l-2 border-accent/40 pl-3">
            <div className="text-[10px] uppercase tracking-wider text-accent">
              {m.label}
            </div>
            <ul className="mt-1 space-y-1">
              {m.decisions.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => select(d.id)}
                    className={`text-left text-xs hover:underline ${
                      selectedId === d.id
                        ? "text-accent font-medium"
                        : "text-text-secondary"
                    }`}
                    data-testid={`why-timeline-${d.id}`}
                  >
                    <span className="font-mono text-[10px] text-text-muted">
                      {(d.date ?? "").slice(0, 10)}
                    </span>{" "}
                    {d.title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
