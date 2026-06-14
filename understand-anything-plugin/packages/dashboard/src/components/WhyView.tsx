/**
 * WhyView (Direction A — V3 refactored with V11-V14 components)
 *
 * 3-region layout:
 *   - left:   DecisionList (V11)
 *   - right:  DecisionDetailPanel (V12) + TradeoffMatrix (V13) + DecisionTree (V14)
 *   - empty:  EmptyHero
 *
 * On first mount, synthesizes a demo decision graph so the persona is never
 * blank. Real ADR data is loaded from `decisions-graph.json` in V28.
 */
import { useEffect, useState } from "react";
import { useDashboardStore } from "../store";
import DecisionList from "./DecisionList";
import DecisionDetailPanel from "./DecisionDetailPanel";
import TradeoffMatrix from "./TradeoffMatrix";
import DecisionTree from "./DecisionTree";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; count: number }
  | { kind: "error"; message: string };

export default function WhyView() {
  const decisionGraph = useDashboardStore((s) => s.decisionGraph);
  const setDecisionGraph = useDashboardStore((s) => s.setDecisionGraph);
  const selectedDecisionId = useDashboardStore((s) => s.selectedDecisionId);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (decisionGraph) {
      setLoadState({ kind: "ready", count: decisionGraph.decisions.length });
      return;
    }
    setLoadState({ kind: "loading" });
    const handle = setTimeout(() => {
      try {
        setDecisionGraph({
          version: "1.0",
          project: { name: "demo", analyzedAt: "2026-06-14T00:00:00Z", gitCommitHash: "demo" },
          decisions: [
            {
              id: "adr:demo:1",
              title: "Adopt Zod for runtime validation",
              status: "accepted",
              context: "We need runtime validation for external payloads.",
              decision: "Use Zod 3.x as the single source of truth.",
              consequences: { positive: ["Type-safe"], negative: ["+50KB bundle"] },
              alternatives: [
                { name: "Yup", whyRejected: "Worse TS DX", pros: ["Mature"], cons: ["DX"] },
                { name: "io-ts", whyRejected: "Steeper learning curve", pros: ["Pure FP"], cons: ["Hard to learn"] },
              ],
              date: "2026-06-14T00:00:00Z",
              source: "manual",
              tags: ["validation"],
              linkedNodeIds: ["file:src/schema.ts"],
              complexity: "moderate",
              tradeoffScore: 0.7,
            },
            {
              id: "adr:demo:2",
              title: "Use Vite for dev server",
              status: "accepted",
              context: "Slow Webpack dev rebuilds were blocking iteration.",
              decision: "Migrate to Vite + native ESM.",
              consequences: { positive: ["10x faster HMR"], negative: ["Plugin rewrite"] },
              alternatives: [
                { name: "esbuild", whyRejected: "Less ecosystem", pros: ["Fast"], cons: ["Smaller plugin pool"] },
              ],
              date: "2026-05-20T00:00:00Z",
              source: "git-commit",
              tags: ["build", "tooling"],
              linkedNodeIds: ["file:vite.config.ts"],
              complexity: "moderate",
              tradeoffScore: 0.85,
            },
          ],
        });
        setLoadState({ kind: "ready", count: 2 });
      } catch (err) {
        setLoadState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, 0);
    return () => clearTimeout(handle);
  }, [decisionGraph, setDecisionGraph]);

  const decisions = decisionGraph?.decisions ?? [];
  const selectedDecision = decisions.find((d) => d.id === selectedDecisionId) ?? null;

  return (
    <div className="h-full w-full flex flex-col bg-surface text-text-primary">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div>
          <h2 className="text-sm font-heading uppercase tracking-wider">
            Why / Architecture Decisions
          </h2>
          <p className="text-[10px] text-text-muted">
            {decisions.length === 0
              ? "No decisions discovered yet — run /understand-decisions"
              : `${decisions.length} decision${decisions.length === 1 ? "" : "s"} discovered`}
          </p>
        </div>
        <div className="text-[10px] text-text-muted">
          {loadState.kind === "loading" && "Loading…"}
          {loadState.kind === "error" && (
            <span className="text-text-error">Error: {loadState.message}</span>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-[280px] shrink-0 border-r border-border-subtle">
          <DecisionList />
        </aside>
        <main className="flex-1 min-w-0 overflow-auto">
          {selectedDecision ? (
            <div className="divide-y divide-border-subtle">
              <DecisionDetailPanel />
              <TradeoffMatrix decision={selectedDecision} />
              <DecisionTree decision={selectedDecision} all={decisions} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="text-3xl mb-2">🏛️</div>
                <h2 className="text-lg font-heading mb-1">Why this code?</h2>
                <p className="text-xs text-text-muted">
                  Pick a decision on the left to read its context, tradeoffs, and
                  rejected alternatives. Decisions are extracted from git history,
                  code comments, and human-written ADR files.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
