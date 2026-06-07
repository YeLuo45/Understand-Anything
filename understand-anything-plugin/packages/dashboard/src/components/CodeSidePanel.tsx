/**
 * UI Learn — Code side panel (V12)
 *
 * Fetches the file at `codePanelNodeId` via the same `/file-content.json`
 * endpoint that `CodeViewer` uses, but renders a stripped-down read-only
 * pane suited to the side panel's narrower width.
 */
import { useEffect, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { useDashboardStore } from "../store";

interface SourceFile {
  path: string;
  language: string;
  content: string;
  sizeBytes: number;
  lineCount: number;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; source: SourceFile }
  | { kind: "error"; message: string };

function fallbackLanguage(filePath: string | undefined): string {
  const ext = filePath?.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    css: "css",
    html: "markup",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    py: "python",
    ts: "typescript",
    tsx: "tsx",
    yaml: "yaml",
    yml: "yaml",
  };
  return ext ? byExt[ext] ?? "text" : "text";
}

export default function CodeSidePanel() {
  const codePanelNodeId = useDashboardStore((s) => s.codePanelNodeId);
  const nodesById = useDashboardStore((s) => s.nodesById);
  const [state, setState] = useState<State>({ kind: "idle" });

  const node = codePanelNodeId ? nodesById.get(codePanelNodeId) : null;
  const filePath = node?.filePath ?? null;

  useEffect(() => {
    if (!filePath) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    const token =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")
        : null;
    const url = `/file-content.json?token=${encodeURIComponent(token ?? "")}&path=${encodeURIComponent(filePath)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: SourceFile) => setState({ kind: "loaded", source: data }))
      .catch((err) =>
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [filePath]);

  if (!codePanelNodeId) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-text-muted px-3 text-center">
        Click any node in the diagram to view its source code here.
      </div>
    );
  }
  if (!filePath) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-text-muted px-3 text-center">
        Node <span className="font-mono mx-1">{codePanelNodeId}</span> has no
        file path.
      </div>
    );
  }
  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-text-muted">
        Loading {filePath}…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-text-error px-3 text-center font-mono break-all">
        {state.message}
      </div>
    );
  }
  const lang = state.source.language || fallbackLanguage(state.source.path);
  return (
    <div className="h-full overflow-auto">
      <div className="px-3 py-1.5 text-[10px] text-text-muted/70 border-b border-border-subtle font-mono truncate">
        {state.source.path} · {state.source.lineCount} lines · {lang}
      </div>
      <Highlight theme={themes.vsDark} code={state.source.content} language={lang}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} text-[10px] leading-snug p-2`}
            style={style}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-7 text-text-muted/40 select-none">
                  {i + 1}
                </span>
                {line.map((token, k) => (
                  <span key={k} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
