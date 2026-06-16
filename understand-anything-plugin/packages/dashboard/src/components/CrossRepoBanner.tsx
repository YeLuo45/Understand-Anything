/**
 * CrossRepoBanner — V24 of Direction B
 *
 * Tiny UI that lists "this decision is referenced by N other repos".
 * Backed by the core `cross-repo-mirror` module.
 */
import { useMemo } from "react";
import { useDashboardStore } from "../store";
import { findLocalMatches, type ForeignMirror } from "@understand-anything/core/analyzer/cross-repo-mirror";

export default function CrossRepoBanner({ decisionId }: { decisionId: string }) {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const mirrorsJson = useDashboardStore((s) => s.foreignMirrors);

  const matches = useMemo(() => {
    if (!graph || !mirrorsJson) return [];
    const mirrors: ForeignMirror[] = [...mirrorsJson] as ForeignMirror[];
    const out = findLocalMatches(graph.decisions, {
      project: "all-foreign",
      entries: mirrors.flatMap((m) => [...m.entries]),
    });
    return out.filter((m) => m.local.id === decisionId);
  }, [graph, mirrorsJson, decisionId]);

  if (matches.length === 0) return null;

  return (
    <div
      className="mx-3 my-2 rounded-md border-l-2 border-blue-500 bg-blue-500/10 px-2 py-1.5 text-xs"
      data-testid="cross-repo-banner"
    >
      <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-1">
        🔗 Referenced by {matches.length} other repo{matches.length === 1 ? "" : "s"}
      </div>
      <ul className="space-y-0.5">
        {matches.map((m, i) => (
          <li key={i} className="text-blue-200">
            {m.foreign.origin} · {m.score === 1 ? "in sync" : m.drift ? "drift" : "match"}
          </li>
        ))}
      </ul>
    </div>
  );
}
