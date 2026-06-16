/**
 * Variable Input Form — V13 of Direction C
 *
 * Renders one input element per Variable, based on its kind:
 *   - text          → <input type="text">
 *   - multi-line    → <textarea>
 *   - dropdown      → <select> with <option>s
 *   - file-picker   → <input type="text"> with a hint
 *
 * Each input is wrapped in a labelled block; errors are shown inline.
 */
import { useMemo } from "react";
import type { Variable } from "@understand-anything/core/recipe/recipe-schema";
import { validateVariable } from "@understand-anything/core/recipe/variables";

interface Props {
  variables: ReadonlyArray<Variable>;
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
}

export default function VariableInputForm({ variables, values, onChange }: Props) {
  const errors = useMemo(
    () => Object.fromEntries(variables.map((v) => [v.id, validateVariable(v, values[v.id])])),
    [variables, values],
  );
  if (variables.length === 0) return null;
  return (
    <div className="mt-2 space-y-1" data-testid="variable-input-form">
      {variables.map((v) => (
        <label key={v.id} className="block">
          <span className="text-[10px] text-emerald-100">{v.label}</span>
          <FormInput v={v} value={values[v.id] ?? v.defaultValue ?? ""} onChange={(val) => onChange(v.id, val)} />
          {errors[v.id] && errors[v.id]!.length > 0 && (
            <span className="text-[9px] text-red-400">{errors[v.id]!.join("; ")}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function FormInput({
  v,
  value,
  onChange,
}: {
  v: Variable;
  value: string;
  onChange: (val: string) => void;
}) {
  if (v.kind === "dropdown" && v.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-elevated border border-border-subtle rounded px-1 py-0.5 text-[11px] text-text-primary"
        data-testid={`variable-${v.id}`}
      >
        <option value="">— select —</option>
        {v.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (v.kind === "multi-line") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full bg-elevated border border-border-subtle rounded px-1 py-0.5 text-[11px] text-text-primary"
        data-testid={`variable-${v.id}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={v.kind === "file-picker" ? "/path/to/file" : ""}
      className="w-full bg-elevated border border-border-subtle rounded px-1 py-0.5 text-[11px] text-text-primary"
      data-testid={`variable-${v.id}`}
    />
  );
}