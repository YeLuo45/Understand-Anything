/**
 * Recipe Progress — V14 of Direction C
 *
 * Renders a horizontal progress bar + ETA based on the
 * `estimatedSeconds` field of each step. Pure derived UI; no state.
 */
import type { RecipeManifest } from "@understand-anything/core/recipe/recipe-schema";

interface Props {
  recipe: RecipeManifest;
  /** Index of the currently-running step, or -1 if not running. */
  currentStepIndex: number;
  /** Optional: per-step status. Defaults to all "pending". */
  statuses?: ReadonlyArray<"pending" | "running" | "succeeded" | "failed" | "skipped">;
}

export default function RecipeProgress({ recipe, currentStepIndex, statuses }: Props) {
  const total = recipe.steps.reduce(
    (acc, s) => acc + (s.estimatedSeconds ?? 0),
    0,
  );
  const completed = recipe.steps.reduce((acc, s, i) => {
    const status = statuses?.[i] ?? "pending";
    if (status === "succeeded" || status === "skipped" || status === "failed") {
      return acc + (s.estimatedSeconds ?? 0);
    }
    if (status === "running") {
      return acc + (s.estimatedSeconds ?? 0) / 2;
    }
    return acc;
  }, 0);
  const pct = total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
  const remaining = Math.max(0, total - completed);
  return (
    <div className="text-[10px]" data-testid="recipe-progress">
      <div className="flex items-center justify-between text-emerald-100">
        <span>
          Step {Math.max(0, currentStepIndex + 1)} / {recipe.steps.length}
        </span>
        <span>ETA: ~{remaining}s</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 mt-1 bg-elevated rounded overflow-hidden"
      >
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}