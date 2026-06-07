/**
 * UI Learn (Direction B) — Feature Point Explorer entry view
 *
 * V5 stub. Replaced in V6 with a proper container, then V7-V12 fill in
 * the feature list, CRUD breakdown, sequence/flowchart diagrams, and
 * click-to-code integration. This stub only proves the lazy-loaded
 * chunk and routing target.
 */
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

export default function UILearnView() {
  const graph = useDashboardStore((s) => s.graph);
  const { t } = useI18n();
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface">
      <div className="text-center px-6 max-w-md">
        <div className="text-3xl mb-2">🧭</div>
        <h2 className="text-lg font-heading text-text-primary mb-1">
          {t.uiLearn?.title ?? "UI Learn"}
        </h2>
        <p className="text-xs text-text-muted">
          {t.uiLearn?.subtitle ??
            "Click any feature to inspect its CRUD flow and full call chain"}
        </p>
        {graph && (
          <p className="text-[10px] text-text-muted/60 mt-3">
            Loaded {graph.nodes.length} nodes / {graph.edges.length} edges —
            container lands in V6
          </p>
        )}
      </div>
    </div>
  );
}
