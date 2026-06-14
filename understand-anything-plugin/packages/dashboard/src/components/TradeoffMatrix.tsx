/**
 * TradeoffMatrix — V13 Direction A
 *
 * Renders the chosen decision + its alternatives as a 2-D pros/cons matrix
 * to make tradeoffs visible at a glance. Used in the bottom panel of WhyView.
 */
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";

export interface TradeoffRow {
  /** Display name: chosen decision or alternative name. */
  name: string;
  /** True if this is the row that was actually chosen. */
  chosen: boolean;
  pros: string[];
  cons: string[];
  /** Optional numeric score in [0, 1]. */
  score?: number;
}

export function decisionToTradeoffRows(
  decision: ArchitectureDecisionRecord,
): TradeoffRow[] {
  return [
    {
      name: `✓ ${decision.title}`,
      chosen: true,
      pros: decision.consequences.positive,
      cons: decision.consequences.negative,
      score: decision.tradeoffScore,
    },
    ...decision.alternatives.map((a) => ({
      name: a.name,
      chosen: false,
      pros: a.pros,
      cons: a.cons,
    })),
  ];
}

export default function TradeoffMatrix({
  decision,
}: {
  decision: ArchitectureDecisionRecord;
}) {
  const rows = decisionToTradeoffRows(decision);
  if (rows.length === 0) return null;
  // Find the union of all pros and cons across rows for the column headers.
  const pros = Array.from(new Set(rows.flatMap((r) => r.pros)));
  const cons = Array.from(new Set(rows.flatMap((r) => r.cons)));

  return (
    <div
      className="text-xs overflow-auto p-3"
      data-testid="why-tradeoff-matrix"
    >
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
        Tradeoff matrix
      </h3>
      <div className="space-y-3">
        <RowGroup label="Pros" values={pros} rows={rows} field="pros" />
        <RowGroup label="Cons" values={cons} rows={rows} field="cons" />
        {decision.tradeoffScore !== undefined && (
          <div className="text-[10px] text-text-muted">
            Tradeoff score (chosen): {decision.tradeoffScore.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function RowGroup({
  label,
  values,
  rows,
  field,
}: {
  label: string;
  values: string[];
  rows: TradeoffRow[];
  field: "pros" | "cons";
}) {
  if (values.length === 0) return null;
  return (
    <div>
      <h4
        className={`text-[10px] uppercase tracking-wider mb-1 ${
          field === "pros" ? "text-green-500" : "text-red-400"
        }`}
      >
        {label}
      </h4>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border-subtle">
            <th className="pr-2 py-0.5">{label}</th>
            {rows.map((r) => (
              <th
                key={r.name}
                className={`px-2 py-0.5 font-normal ${
                  r.chosen ? "text-accent" : "text-text-muted"
                }`}
              >
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v} className="border-b border-border-subtle/40">
              <td className="pr-2 py-0.5 align-top">{v}</td>
              {rows.map((r) => {
                const has = r[field].includes(v);
                return (
                  <td
                    key={r.name}
                    className={`px-2 py-0.5 text-center ${
                      has
                        ? field === "pros"
                          ? "text-green-500"
                          : "text-red-400"
                        : "text-text-muted/40"
                    }`}
                  >
                    {has ? "✓" : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
