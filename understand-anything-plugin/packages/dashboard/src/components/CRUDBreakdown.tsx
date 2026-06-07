/**
 * UI Learn — CRUD breakdown (V8)
 *
 * Four columns: Create / Read / Update / Delete. Each column lists the
 * participating nodes as clickable pills (clicking opens that node's
 * code in the side panel).
 */
import { CRUD_VERBS, type CrudFlow } from "../types/featurePoints";
import { useDashboardStore } from "../store";

const VERB_COLORS: Record<string, string> = {
  create: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  read: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  update: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  delete: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

export default function CRUDBreakdown({
  crud,
  labels,
}: {
  crud: CrudFlow;
  labels?: { create?: string; read?: string; update?: string; delete?: string };
}) {
  const openCodePanel = useDashboardStore((s) => s.openCodePanel);
  const selectNode = useDashboardStore((s) => s.selectNode);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {CRUD_VERBS.map((verb) => {
        const entries = crud[verb];
        const label = labels?.[verb] ?? verb;
        return (
          <div
            key={verb}
            className={`rounded-lg border p-2 ${VERB_COLORS[verb] ?? "border-border-subtle bg-elevated text-text-secondary"}`}
          >
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5">
              {label} ({entries.length})
            </p>
            <ul className="space-y-1">
              {entries.length === 0 ? (
                <li className="text-[10px] text-text-muted/60 italic">—</li>
              ) : (
                entries.slice(0, 8).map((e) => (
                  <li key={e.nodeId}>
                    <button
                      type="button"
                      onClick={() => {
                        selectNode(e.nodeId);
                        openCodePanel(e.nodeId);
                      }}
                      title={`${e.role} — ${e.nodeId}`}
                      className="w-full text-left text-[10px] truncate rounded px-1.5 py-0.5 bg-elevated/60 hover:bg-accent/20 border border-border-subtle"
                    >
                      {shortName(e.nodeId)}
                    </button>
                  </li>
                ))
              )}
              {entries.length > 8 && (
                <li className="text-[10px] text-text-muted/60">
                  +{entries.length - 8} more
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function shortName(nodeId: string): string {
  const stripped = nodeId.replace(/^file:/, "");
  const base = stripped.split("/").pop() ?? stripped;
  return base.length > 28 ? base.slice(0, 25) + "..." : base;
}
