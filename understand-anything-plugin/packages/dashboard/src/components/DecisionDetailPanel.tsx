/**
 * DecisionDetailPanel — V12 Direction A
 *
 * Right-side detail view of WhyView. Renders the full Architecture Decision
 * Record: status, context, decision, consequences, alternatives, tags, links.
 */
import { useDashboardStore } from "../store";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

export default function DecisionDetailPanel() {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const selectedId = useDashboardStore((s) => s.selectedDecisionId);

  const decision = graph?.decisions.find((d) => d.id === selectedId);

  if (!decision) {
    return <EmptyHero />;
  }

  return (
    <article
      className="max-w-2xl space-y-3 p-4"
      data-testid="why-decision-detail"
    >
      <h1 className="text-lg font-heading">{decision.title}</h1>
      <Meta decision={decision} />
      <Section title="Context">{decision.context || "(no context)"}</Section>
      <Section title="Decision">{decision.decision}</Section>
      <Section title="Consequences">
        <Consequences c={decision.consequences} />
      </Section>
      {decision.alternatives.length > 0 && (
        <Section title="Alternatives considered">
          <Alternatives alts={decision.alternatives} />
        </Section>
      )}
      {decision.linkedNodeIds.length > 0 && (
        <Section title="Affects">
          <ul className="text-xs space-y-0.5">
            {decision.linkedNodeIds.map((id) => (
              <li key={id} className="font-mono text-[10px] text-text-muted">
                {id}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {decision.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {decision.tags.map((t) => (
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
  );
}

function Meta({ decision }: { decision: ArchitectureDecisionRecord }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-text-muted">
      <span className="px-1.5 py-0.5 rounded bg-elevated uppercase tracking-wider">
        {decision.status}
      </span>
      <span>{decision.source}</span>
      <span>·</span>
      <span>{decision.date}</span>
      <span>·</span>
      <span className="uppercase">{decision.complexity}</span>
      {decision.tradeoffScore !== undefined && (
        <>
          <span>·</span>
          <span data-testid="why-tradeoff-score">
            score: {decision.tradeoffScore.toFixed(2)}
          </span>
        </>
      )}
      {decision.authorCommit && (
        <>
          <span>·</span>
          <span className="font-mono">{decision.authorCommit.slice(0, 7)}</span>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
        {title}
      </h3>
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
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
        <h4 className="text-[10px] uppercase tracking-wider text-green-500 mb-1">
          Positive
        </h4>
        <ul className="text-xs space-y-0.5" data-testid="why-positive">
          {c.positive.length === 0 && <li className="italic text-text-muted">—</li>}
          {c.positive.map((p, i) => (
            <li key={i}>+ {p}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-[10px] uppercase tracking-wider text-red-400 mb-1">
          Negative
        </h4>
        <ul className="text-xs space-y-0.5" data-testid="why-negative">
          {c.negative.length === 0 && <li className="italic text-text-muted">—</li>}
          {c.negative.map((p, i) => (
            <li key={i}>− {p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Alternatives({
  alts,
}: {
  alts: ArchitectureDecisionRecord["alternatives"];
}) {
  return (
    <ul className="space-y-2" data-testid="why-alternatives">
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
