/**
 * UI Learn (Direction B) — Feature Point Explorer
 *
 * V6: full container with three layout regions:
 *   - left:   FeatureList panel (filled in V7)
 *   - right:  FeatureDetailPanel + diagram (filled in V8-V11)
 *   - bottom: code side panel (filled in V12)
 *
 * Empty / loading / error states are wired so the container is renderable
 * on its own before the inner panels land.
 */
import { useMemo, useState, useEffect } from "react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import {
  extractFeaturePoints,
  type ExtractedFeature,
} from "../registry/featureExtractor";
import { buildFeaturePointRegistry } from "../registry/featurePointRegistry";
import type { FeaturePoint } from "../types/featurePoints";
import FeatureList from "./FeatureList";
import FeatureDetailPanel from "./FeatureDetailPanel";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; features: readonly ExtractedFeature[] }
  | { kind: "error"; message: string };

export default function UILearnView() {
  const graph = useDashboardStore((s) => s.graph);
  const selectedFeatureId = useDashboardStore((s) => s.selectedFeatureId);
  const selectFeature = useDashboardStore((s) => s.selectFeature);
  const featureSearchQuery = useDashboardStore((s) => s.featureSearchQuery);
  const setFeatureSearchQuery = useDashboardStore(
    (s) => s.setFeatureSearchQuery,
  );
  const { t } = useI18n();

  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!graph) return;
    setLoadState({ kind: "loading" });
    try {
      // Yield once so the "loading" state can paint before the sync extractor
      // runs on a 1300+ node graph.
      const handle = setTimeout(() => {
        try {
          const features = extractFeaturePoints(graph);
          setLoadState({ kind: "ready", features });
        } catch (err) {
          setLoadState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }, 0);
      return () => clearTimeout(handle);
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [graph]);

  const registry = useMemo(() => {
    if (loadState.kind !== "ready") {
      return buildFeaturePointRegistry([] as readonly FeaturePoint[]);
    }
    return buildFeaturePointRegistry(loadState.features);
  }, [loadState]);

  const filtered = useMemo(() => {
    if (loadState.kind !== "ready") return [];
    const q = featureSearchQuery.trim();
    if (!q) return registry.features;
    return registry.search(q);
  }, [registry, featureSearchQuery, loadState]);

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) return null;
    return registry.byId[selectedFeatureId] ?? null;
  }, [registry, selectedFeatureId]);

  return (
    <div className="h-full w-full flex bg-surface">
      {/* Left: feature list */}
      <aside className="w-[280px] shrink-0 border-r border-border-subtle overflow-hidden flex flex-col">
        <FeatureList
          state={loadState}
          features={filtered}
          totalCount={registry.features.length}
          searchQuery={featureSearchQuery}
          onSearchChange={setFeatureSearchQuery}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={selectFeature}
          uiLearnStrings={t.uiLearn}
        />
      </aside>

      {/* Right: detail / diagram / empty state */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {selectedFeature ? (
          <FeatureDetailPanel
            feature={selectedFeature}
            onBack={() => selectFeature(null)}
            uiLearnStrings={t.uiLearn}
          />
        ) : (
          <EmptyHero state={loadState} uiLearnStrings={t.uiLearn} />
        )}
      </main>
    </div>
  );
}

function EmptyHero({
  state,
  uiLearnStrings,
}: {
  state: LoadState;
  uiLearnStrings: ReturnType<typeof useI18n>["t"]["uiLearn"] | undefined;
}) {
  const title = uiLearnStrings?.title ?? "UI Learn";
  const subtitle =
    uiLearnStrings?.subtitle ??
    "Click any feature to inspect its CRUD flow and full call chain";

  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 max-w-md">
          <div className="text-3xl mb-2 animate-pulse">🧭</div>
          <p className="text-sm text-text-muted">
            {uiLearnStrings?.loading ?? "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 max-w-md">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="text-lg font-heading text-text-primary mb-1">
            {title}
          </h2>
          <p className="text-xs text-text-error font-mono break-all">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.features.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 max-w-md">
          <div className="text-3xl mb-2">🧭</div>
          <h2 className="text-lg font-heading text-text-primary mb-1">
            {title}
          </h2>
          <p className="text-xs text-text-muted mb-2">{subtitle}</p>
          <p className="text-[10px] text-text-muted/60">
            {uiLearnStrings?.noFeaturesHint ??
              "Re-run /understand to populate this list"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <div className="text-3xl mb-2">🧭</div>
        <h2 className="text-lg font-heading text-text-primary mb-1">{title}</h2>
        <p className="text-xs text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
