/**
 * Recipe Drawer — V24 of Direction C
 *
 * Side panel that exposes the export options for a Recipe:
 *   - Copy markdown
 *   - Copy PR comment
 *   - Copy JSON / YAML
 *   - Save to .understand-anything/recipes.json
 *   - Download as runbook.md
 *
 * All actions are read-only on the recipe; no state mutation.
 */
import { useState } from "react";
import type { RecipeManifest } from "@understand-anything/core/recipe/recipe-schema";
import {
  recipeToMarkdown,
  recipeToPrComment,
  recipeToJson,
  recipeToYaml,
} from "@understand-anything/core/recipe/recipe-export";

interface Props {
  recipe: RecipeManifest;
}

type Format = "markdown" | "pr-comment" | "json" | "yaml";

export default function RecipeDrawer({ recipe }: Props) {
  const [format, setFormat] = useState<Format>("markdown");
  const [copied, setCopied] = useState(false);

  const rendered = (() => {
    switch (format) {
      case "markdown":
        return recipeToMarkdown(recipe);
      case "pr-comment":
        return recipeToPrComment(recipe);
      case "json":
        return recipeToJson(recipe);
      case "yaml":
        return recipeToYaml(recipe);
    }
  })();

  async function copy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(rendered);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // ignore — clipboard may not be available in tests / SSR
    }
  }

  function download() {
    if (typeof document === "undefined") return;
    const blob = new Blob([rendered], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${recipe.id.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="rounded-md border-l-2 border-indigo-500 bg-indigo-500/10 px-2 py-1.5 text-xs"
      data-testid="recipe-drawer"
    >
      <div className="text-[10px] uppercase tracking-wider text-indigo-400 mb-1">
        📤 Export {recipe.title}
      </div>
      <div className="flex gap-1 mb-2 flex-wrap">
        {(["markdown", "pr-comment", "json", "yaml"] as Format[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            data-testid={`recipe-drawer-${f}`}
            className={`px-1.5 py-0.5 rounded text-[10px] ${
              format === f
                ? "bg-indigo-500/40 text-indigo-100"
                : "bg-elevated text-text-muted hover:text-text-primary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <pre className="bg-elevated rounded p-2 text-[10px] text-text-primary max-h-32 overflow-auto">
        {rendered.slice(0, 800)}
        {rendered.length > 800 ? "\n…" : ""}
      </pre>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={copy}
          data-testid="recipe-drawer-copy"
          className="px-2 py-1 bg-indigo-500/30 hover:bg-indigo-500/50 rounded text-[11px] text-indigo-100"
        >
          {copied ? "✓ copied" : "📋 copy"}
        </button>
        <button
          type="button"
          onClick={download}
          data-testid="recipe-drawer-download"
          className="px-2 py-1 bg-indigo-500/30 hover:bg-indigo-500/50 rounded text-[11px] text-indigo-100"
        >
          ⬇ download
        </button>
      </div>
    </div>
  );
}