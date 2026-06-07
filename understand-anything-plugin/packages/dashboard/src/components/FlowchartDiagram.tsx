/**
 * UI Learn — Flowchart diagram (V10)
 *
 * Renders process boxes, decision diamonds, and terminator pills in a
 * simple grid (auto-layout is V15 polish — for now we lay out in
 * reading order: each row has up to 3 boxes).
 */
import type { FlowchartDiagram } from "../types/featurePoints";
import { useDashboardStore } from "../store";

const COLS = 3;
const BOX_W = 180;
const BOX_H = 64;

const SHAPE_CLASS: Record<string, string> = {
  process: "rounded-md",
  decision: "rotate-45",
  terminator: "rounded-full",
  io: "rounded-md border-dashed",
};

export default function FlowchartDiagram({
  diagram,
  onNodeClick,
}: {
  diagram: FlowchartDiagram;
  onNodeClick?: (nodeId: string) => void;
}) {
  const openCodePanel = useDashboardStore((s) => s.openCodePanel);
  const selectNode = useDashboardStore((s) => s.selectNode);

  return (
    <div className="relative h-full w-full overflow-auto p-3">
      <div
        className="grid gap-6"
        style={{
          gridTemplateColumns: `repeat(${COLS}, ${BOX_W}px)`,
        }}
      >
        {diagram.nodes.map((node) => {
          const isDecision = node.shape === "decision";
          return (
            <button
              type="button"
              key={node.id}
              onClick={() => {
                selectNode(node.nodeId);
                onNodeClick?.(node.nodeId);
                openCodePanel(node.nodeId);
              }}
              title={node.nodeId}
              className={`relative bg-elevated border border-border-subtle text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center text-center px-2 py-2 ${SHAPE_CLASS[node.shape] ?? "rounded-md"}`}
              style={{
                width: BOX_W,
                height: BOX_H,
              }}
            >
              {isDecision ? (
                <span
                  className="text-[10px] leading-tight px-1"
                  style={{ transform: "rotate(-45deg)" }}
                >
                  {node.label}
                </span>
              ) : (
                <span className="text-[10px] leading-tight px-1 break-words">
                  {node.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {diagram.edges.length > 0 && (
        <p className="text-[10px] text-text-muted/60 mt-3 italic">
          {diagram.edges.length} control-flow edges (text labels omitted in V10)
        </p>
      )}
    </div>
  );
}
