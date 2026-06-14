/**
 * WhyView (Direction A — V3)
 *
 * Main container for the "Architect" persona. Three-region layout:
 *   - left:   DecisionList (built in V11)
 *   - right:  DecisionDetailPanel (built in V12)
 *   - bottom: TradeoffMatrix + DecisionTree (built in V13/V14)
 *
 * V3 ships a usable skeleton with empty / loading / error states wired so the
 * persona switcher can route here. Inner panels fill in V11+.
 */
import { useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "../store";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; count: number }
  | { kind: "error"; message: string };

export default function WhyView() {
  const decisionGraph = useDashboardStore((s) => s.decisionGraph);
  const setDecisionGraph = useDashboardStore((s) => s.setDecisionGraph);
  const selectedDecisionId = useDashboardStore((s) => s.selectedDecisionId);
  const selectDecision = useDashboardStore((s) => s.selectDecision);

  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });

  // V3 fallback: synthesize a tiny demo decision graph so the persona is
  // never empty. Real ADR data is loaded from `decisions-graph.json` in V28.
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
              ],
              date: "2026-06-14T00:00:00Z",
              source: "manual",
              tags: ["validation"],
              linkedNodeIds: [],
              complexity: "moderate",
              tradeoffScore: 0.7,
            },
          ],
        });
        setLoadState({ kind: "ready", count: 1 });
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
  const selectedDecision = useMemo(
    () => decisions.find((d) => d.id === selectedDecisionId) ?? null,
    [decisions, selectedDecisionId],
  );

  return (
    <div className="h-full w-full flex flex-col bg-surface text-text-primary">
      {/* Header */}
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

      {/* 3-region body */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: DecisionList (V11) */}
        <aside className="w-[260px] shrink-0 border-r border-border-subtle overflow-auto p-2">
          {decisions.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-1">
              {decisions.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => selectDecision(d.id)}
                    data-testid={`why-decision-${d.id}`}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedDecisionId === d.id
                        ? "bg-accent/20 text-accent"
                        : "hover:bg-elevated text-text-secondary"
                    }`}
                  >
                    <div className="font-medium truncate">{d.title}</div>
                    <div className="text-[10px] text-text-muted flex items-center gap-1">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          d.status === "accepted"
                            ? "bg-green-500"
                            : d.status === "proposed"
                              ? "bg-yellow-500"
                              : d.status === "deprecated"
                                ? "bg-gray-500"
                                : "bg-blue-500"
                        }`}
                      />
                      <span>{d.status}</span>
                      <span>·</span>
                      <span>{d.source}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Right: DecisionDetailPanel (V12) */}
        <main className="flex-1 min-w-0 overflow-auto p-4">
          {selectedDecision ? (
            <article className="max-w-2xl space-y-3" data-testid="why-decision-detail">
              <h1 className="text-lg font-heading">{selectedDecision.title}</h1>
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <span className="px-1.5 py-0.5 rounded bg-elevated uppercase tracking-wider">
                  {selectedDecision.status}
                </span>
                <span>{selectedDecision.source}</span>
                <span>·</span>
                <span>{selectedDecision.date}</span>
                {selectedDecision.tradeoffScore !== undefined && (
                  <>
                    <span>·</span>
                    <span>score: {selectedDecision.tradeoffScore.toFixed(2)}</span>
                  </>
                )}
              </div>
              <Section title="Context">{selectedDecision.context}</Section>
              <Section title="Decision">{selectedDecision.decision}</Section>
              <Section title="Consequences">
                <Consequences c={selectedDecision.consequences} />
              </Section>
              {selectedDecision.alternatives.length > 0 && (
                <Section title="Alternatives considered">
                  <Alternatives alts={selectedDecision.alternatives} />
                </Section>
              )}
              {selectedDecision.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedDecision.tags.map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded bg-elevated text-[10px] text-text-muted"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <EmptyHero />
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{title}</h3>
      <div className="text-sm text-text-primary leading-relaxed">{children}</div>
    </section>
  );
}

function Consequences({
  c,
}: {
  c: { positive: string[]; negative: string[] };
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-green-500 mb-1">Positive</h4>
        <ul className="text-xs space-y-0.5">
          {c.positive.map((p, i) => (
            <li key={i}>+ {p}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Negative</h4>
        <ul className="text-xs space-y-0.5">
          {c.negative.map((p, i) => (
            <li key={i}>- {p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Alternatives({
  alts,
}: {
  alts: Array<{ name: string; whyRejected: string; pros: string[]; cons: string[] }>;
}) {
  return (
    <ul className="space-y-2">
      {alts.map((a, i) => (
        <li key={i} className="text-xs border-l-2 border-border-subtle pl-2">
          <div className="font-medium">{a.name}</div>
          <div className="text-text-muted italic">rejected: {a.whyRejected}</div>
          {a.pros.length > 0 && (
            <div className="text-[10px] text-green-500">pros: {a.pros.join("; ")}</div>
          )}
          {a.cons.length > 0 && (
            <div className="text-[10px] text-red-400">cons: {a.cons.join("; ")}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="text-[10px] text-text-muted italic p-2">
      No decisions discovered yet.
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="text-3xl mb-2">🏛️</div>
        <h2 className="text-lg font-heading mb-1">Why this code?</h2>
        <p className="text-xs text-text-muted">
          Pick a decision on the left to read its context, tradeoffs, and rejected
          alternatives. Decisions are extracted from git history, code comments, and
          human-written ADR files.
        </p>
      </div>
    </div>
  );
}
