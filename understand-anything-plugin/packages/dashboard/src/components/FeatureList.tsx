/**
 * UI Learn (Direction B) — FeatureList panel
 *
 * V7 fills in search + card grid + selection state.
 * This stub renders the panel shell + search bar so the container compiles.
 */
import type { FeaturePoint } from "../types/featurePoints";

export type LoadStateForList =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; features: readonly FeaturePoint[] }
  | { kind: "error"; message: string };

interface FeatureListStrings {
  title?: string;
  featureList?: string;
  searchPlaceholder?: string;
  featureCount_one?: string;
  featureCount_other?: string;
  noFeatures?: string;
  noFeaturesHint?: string;
  openFeature?: string;
  strategy?: string;
  confidence?: string;
  files?: string;
  loading?: string;
}

interface FeatureListProps {
  state: LoadStateForList;
  features: readonly FeaturePoint[];
  totalCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  uiLearnStrings?: FeatureListStrings;
}

export default function FeatureList({
  state,
  features,
  totalCount,
  searchQuery,
  onSearchChange,
  selectedFeatureId,
  onSelectFeature,
  uiLearnStrings,
}: FeatureListProps) {
  const t = uiLearnStrings;
  const countTemplate =
    features.length === 1
      ? (t?.featureCount_one ?? "1 feature")
      : (t?.featureCount_other ?? "{count} features");
  const countLabel = countTemplate.replace("{count}", String(features.length));

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border-subtle shrink-0">
        <h3 className="text-[11px] font-semibold text-accent uppercase tracking-wider mb-2">
          {t?.featureList ?? "Feature points"}
        </h3>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t?.searchPlaceholder ?? "Search features…"}
          className="w-full bg-elevated border border-border-subtle rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
        />
        <p className="text-[10px] text-text-muted/70 mt-1.5">
          {countLabel} · {totalCount} total
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0 space-y-1.5">
        {state.kind === "loading" || state.kind === "idle" ? (
          <p className="text-[11px] text-text-muted px-2 py-1">
            {t?.loading ?? "Loading…"}
          </p>
        ) : state.kind === "error" ? (
          <p className="text-[11px] text-text-error px-2 py-1 font-mono break-all">
            {state.message}
          </p>
        ) : features.length === 0 ? (
          <p className="text-[11px] text-text-muted px-2 py-1">
            {t?.noFeatures ?? "No feature points discovered yet"}
          </p>
        ) : (
          features.map((f) => (
            <FeatureCard
              key={f.id}
              feature={f}
              isSelected={f.id === selectedFeatureId}
              onClick={() => onSelectFeature(f.id)}
              strings={t}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FeatureCard({
  feature,
  isSelected,
  onClick,
  strings,
}: {
  feature: FeaturePoint;
  isSelected: boolean;
  onClick: () => void;
  strings?: FeatureListStrings;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
        isSelected
          ? "bg-accent/15 border-accent/40 text-text-primary"
          : "bg-elevated border-border-subtle text-text-secondary hover:border-accent/30 hover:text-text-primary"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">
          {iconForFeature(feature.icon)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug truncate">
            {feature.title}
          </p>
          <p className="text-[10px] text-text-muted leading-snug mt-0.5 line-clamp-2">
            {feature.description}
          </p>
          {feature.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {feature.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] uppercase tracking-wider bg-elevated/60 text-text-muted/80 px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
              {feature.tags.length > 3 && (
                <span className="text-[9px] text-text-muted/60">
                  +{feature.tags.length - 3}
                </span>
              )}
            </div>
          )}
          {"sourceFileIds" in feature && Array.isArray((feature as { sourceFileIds?: readonly string[] }).sourceFileIds) && (
            <p className="text-[9px] text-text-muted/60 mt-1">
              {((feature as { sourceFileIds: readonly string[] }).sourceFileIds.length)}{" "}
              {strings?.files ?? "files"}
              {"strategy" in feature && (
                <>
                  {" · "}
                  {strings?.strategy ?? "strategy"}:{" "}
                  {(feature as { strategy?: string }).strategy}
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function iconForFeature(icon: string): string {
  const map: Record<string, string> = {
    layers: "📚",
    tag: "🏷️",
    "git-branch": "🌿",
    "log-in": "🔑",
  };
  return map[icon] ?? "•";
}
