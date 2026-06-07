/**
 * UI Learn (Direction B) — Feature detail panel
 *
 * V8 fills in CRUDBreakdown + diagram toggle. This stub renders the
 * header + back button so the container compiles.
 */
import { useDashboardStore } from "../store";
import type { FeaturePoint } from "../types/featurePoints";
import CRUDBreakdown from "./CRUDBreakdown";
import DiagramCanvas from "./DiagramCanvas";
import CodeSidePanel from "./CodeSidePanel";

interface Strings {
  title?: string;
  backToList?: string;
  crudTitle?: string;
  diagram?: string;
  openCode?: string;
  closeCode?: string;
  codePanelTitle?: string;
  viewMode?: { sequence?: string; flowchart?: string };
  crud?: { create?: string; read?: string; update?: string; delete?: string };
}

export default function FeatureDetailPanel({
  feature,
  onBack,
  uiLearnStrings,
}: {
  feature: FeaturePoint;
  onBack: () => void;
  uiLearnStrings?: Strings;
}) {
  const diagramViewMode = useDashboardStore((s) => s.diagramViewMode);
  const setDiagramViewMode = useDashboardStore((s) => s.setDiagramViewMode);
  const codePanelOpen = useDashboardStore((s) => s.codePanelOpen);
  const openCodePanel = useDashboardStore((s) => s.openCodePanel);
  const closeCodePanel = useDashboardStore((s) => s.closeCodePanel);

  const t = uiLearnStrings;
  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle shrink-0 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          {t?.backToList ?? "← Back to feature list"}
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-heading text-text-primary truncate">
            {feature.title}
          </h2>
          <p className="text-[11px] text-text-muted leading-snug line-clamp-2">
            {feature.description}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1 bg-elevated rounded p-0.5">
          <button
            type="button"
            onClick={() => setDiagramViewMode("sequence")}
            className={`px-2 py-1 text-[10px] rounded transition-colors ${
              diagramViewMode === "sequence"
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t?.viewMode?.sequence ?? "Sequence"}
          </button>
          <button
            type="button"
            onClick={() => setDiagramViewMode("flowchart")}
            className={`px-2 py-1 text-[10px] rounded transition-colors ${
              diagramViewMode === "flowchart"
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t?.viewMode?.flowchart ?? "Flowchart"}
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            codePanelOpen ? closeCodePanel() : openCodePanel(feature.crud.read[0]?.nodeId ?? "")
          }
          className="shrink-0 text-[11px] px-2.5 py-1 rounded bg-elevated hover:bg-accent/15 border border-border-subtle text-text-secondary"
          disabled={feature.crud.read.length === 0}
        >
          {codePanelOpen
            ? (t?.closeCode ?? "Close code")
            : (t?.openCode ?? "View code")}
        </button>
      </div>

      {/* Body: CRUD + Diagram + Code side panel */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto p-3 space-y-3">
          <section>
            <h3 className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1.5">
              {t?.crudTitle ?? "CRUD breakdown"}
            </h3>
            <CRUDBreakdown
              crud={feature.crud}
              labels={t?.crud}
            />
          </section>
          <section className="h-[420px]">
            <h3 className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1.5">
              {t?.diagram ?? "Diagram"}
            </h3>
            <div className="h-[calc(100%-1.25rem)] border border-border-subtle rounded-lg overflow-hidden bg-elevated/30">
              <DiagramCanvas
                diagram={feature.diagram}
                alternativeDiagram={feature.alternativeDiagram}
                viewMode={diagramViewMode}
                onNodeClick={openCodePanel}
              />
            </div>
          </section>
        </div>
        {codePanelOpen && (
          <aside className="w-[360px] shrink-0 border-l border-border-subtle bg-elevated/30 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
              <h4 className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                {t?.codePanelTitle ?? "Code"}
              </h4>
              <button
                type="button"
                onClick={closeCodePanel}
                className="text-[10px] text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <CodeSidePanel />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
