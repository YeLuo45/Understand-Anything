/**
 * HowTo Panel — V11 of Direction C
 *
 * Sits above the WhyView. Shows the procedure(s) derived from the
 * selected decision and lets the user open the StepRunner for one of
 * them. Backed by a small in-component store (RecipeRun state).
 */
import { useMemo, useState } from "react";
import { useDashboardStore } from "../store";
import { adrToRecipe } from "@understand-anything/core/recipe/adr-to-recipe";
import type { ArchitectureDecisionRecord } from "@understand-anything/core/types";
import type { RecipeManifest } from "@understand-anything/core/recipe/recipe-schema";
import { summarizeRecipe } from "@understand-anything/core/recipe/recipe-schema";
import StepRunner from "./StepRunner";
import VariableInputForm from "./VariableInputForm";

export default function HowToPanel({ decisionId }: { decisionId: string }) {
  const graph = useDashboardStore((s) => s.decisionGraph);
  const select = useDashboardStore((s) => s.selectDecision);

  const decision = useMemo(() => {
    if (!graph) return null;
    return graph.decisions.find((d) => d.id === decisionId) ?? null;
  }, [graph, decisionId]);

  const recipe: RecipeManifest | null = useMemo(() => {
    if (!decision) return null;
    return adrToRecipe(decision as ArchitectureDecisionRecord);
  }, [decision]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);

  if (!decision || !recipe) return null;

  return (
    <div
      className="mx-3 my-2 rounded-md border-l-2 border-emerald-500 bg-emerald-500/10 px-2 py-1.5 text-xs"
      data-testid="howto-panel"
    >
      <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">
        🛠 HowTo · {summarizeRecipe(recipe)}
      </div>
      <div className="text-[11px] text-emerald-100 mb-1">
        {recipe.steps.length} steps · {recipe.variables.length} vars · {recipe.complexity}
      </div>
      {recipe.variables.length > 0 && (
        <VariableInputForm
          variables={recipe.variables}
          values={values}
          onChange={(id, v) => setValues((s) => ({ ...s, [id]: v }))}
        />
      )}
      {!running ? (
        <button
          type="button"
          className="mt-2 px-2 py-1 bg-emerald-500/30 hover:bg-emerald-500/50 rounded text-[11px] text-emerald-100"
          onClick={() => setRunning(true)}
          data-testid="howto-start"
        >
          ▶ Run recipe
        </button>
      ) : (
        <StepRunner
          recipe={recipe}
          values={values}
          onDone={() => setRunning(false)}
        />
      )}
      <button
        type="button"
        onClick={() => select(decision.id)}
        className="mt-1 text-[10px] text-emerald-400/60 hover:underline"
      >
        ← back to decision
      </button>
    </div>
  );
}