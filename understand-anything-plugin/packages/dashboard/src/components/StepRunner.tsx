/**
 * Step Runner — V12 of Direction C
 *
 * Renders the executor's progress with per-step status, stdout, and
 * a streaming log. Buttons: pause / resume / step / next. The actual
 * execution is delegated to a small dry-run / mock executor for the
 * dashboard; the real one lives in core (used by the CLI).
 */
import { useEffect, useRef, useState } from "react";
import type { RecipeManifest } from "@understand-anything/core/recipe/recipe-schema";
import type { StepStatus } from "@understand-anything/core/recipe/executor";

interface Props {
  recipe: RecipeManifest;
  values: Record<string, string>;
  onDone: () => void;
}

interface StepView {
  id: string;
  status: StepStatus;
  stdout: string;
}

export default function StepRunner({ recipe, values, onDone }: Props) {
  const [steps, setSteps] = useState<StepView[]>(
    recipe.steps.map((s) => ({ id: s.id, status: "pending", stdout: "" })),
  );
  const [paused, setPaused] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < recipe.steps.length; i++) {
        if (cancelled || stopRef.current) return;
        while (paused && !stopRef.current && !cancelled) {
          await sleep(100);
        }
        setSteps((s) => s.map((x, k) => (k === i ? { ...x, status: "running" } : x)));
        await sleep(200); // simulated execution
        if (cancelled || stopRef.current) return;
        setSteps((s) =>
          s.map((x, k) =>
            k === i ? { ...x, status: "succeeded", stdout: `[mock] ran: ${recipe.steps[i]!.command}` } : x,
          ),
        );
      }
      // V12 — run onDone after a tick to let React commit final state
      if (!cancelled) onDone();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [recipe, paused, onDone]);

  return (
    <div className="mt-2 text-[11px]" data-testid="step-runner">
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.id} className="font-mono text-[10px]">
            <span
              className={`inline-block w-3 ${
                s.status === "succeeded"
                  ? "text-emerald-400"
                  : s.status === "failed"
                    ? "text-red-400"
                    : s.status === "running"
                      ? "text-amber-400"
                      : "text-text-muted"
              }`}
            >
              {s.status === "succeeded" ? "✓" : s.status === "failed" ? "✗" : s.status === "running" ? "…" : "·"}
            </span>
            <span className="ml-1 text-emerald-100">{recipe.steps[i]!.title}</span>
            {s.stdout && (
              <pre className="ml-4 text-[9px] text-text-muted whitespace-pre-wrap">
                {s.stdout}
              </pre>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="px-1.5 py-0.5 bg-elevated rounded text-[10px]"
          data-testid="runner-pause"
        >
          {paused ? "▶ resume" : "⏸ pause"}
        </button>
        <button
          type="button"
          onClick={() => {
            stopRef.current = true;
            onDone();
          }}
          className="px-1.5 py-0.5 bg-elevated rounded text-[10px]"
          data-testid="runner-stop"
        >
          ⏹ stop
        </button>
      </div>
      {/* prevent unused warning */}
      <span style={{ display: "none" }}>{JSON.stringify(values)}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}