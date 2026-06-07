/**
 * UI Learn — Sequence diagram (V9)
 *
 * Renders sequence steps as vertical lifelines in a single column with
 * arrows between them. We avoid the heavier @xyflow/react here because
 * sequence diagrams have a trivial layout that CSS handles better.
 */
import type { SequenceDiagram } from "../types/featurePoints";
import { useDashboardStore } from "../store";

const ACTOR_WIDTH = 110;
const STEP_HEIGHT = 64;

export default function SequenceDiagram({
  diagram,
  onNodeClick,
}: {
  diagram: SequenceDiagram;
  onNodeClick?: (nodeId: string) => void;
}) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const openCodePanel = useDashboardStore((s) => s.openCodePanel);

  const lifelineLeft = (i: number) => 20 + i * (ACTOR_WIDTH + 30);

  return (
    <div className="relative h-full w-full overflow-auto p-3">
      <div
        className="relative"
        style={{
          height: Math.max(diagram.steps.length * STEP_HEIGHT + 60, 200),
          minWidth: lifelineLeft(diagram.steps.length - 1) + ACTOR_WIDTH + 20,
        }}
      >
        {/* Lifeline vertical lines */}
        {diagram.steps.map((step, i) => (
          <div
            key={`ll-${step.id}`}
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-accent/40"
            style={{ left: lifelineLeft(i) + ACTOR_WIDTH / 2 }}
          />
        ))}

        {/* Actor headers */}
        {diagram.steps.map((step, i) => (
          <button
            type="button"
            key={`actor-${step.id}`}
            onClick={() => {
              selectNode(step.nodeId);
              onNodeClick?.(step.nodeId);
              openCodePanel(step.nodeId);
            }}
            className="absolute top-0 px-2 py-1 bg-elevated border border-border-subtle rounded text-[10px] text-text-primary hover:border-accent/50 transition-colors"
            style={{
              left: lifelineLeft(i),
              width: ACTOR_WIDTH,
            }}
            title={step.nodeId}
          >
            <span className="block truncate font-medium">{step.actor}</span>
            <span className="block text-[9px] text-text-muted/70 truncate">
              {step.id}
            </span>
          </button>
        ))}

        {/* Step boxes + arrows */}
        {diagram.steps.map((step, i) => {
          const top = 50 + i * STEP_HEIGHT;
          return (
            <div
              key={`step-${step.id}`}
              className="absolute bg-surface border border-border-subtle rounded px-2 py-1 text-[10px] text-text-secondary shadow-sm"
              style={{
                left: lifelineLeft(i) + 8,
                width: ACTOR_WIDTH - 16,
                top,
              }}
            >
              {step.message}
            </div>
          );
        })}

        {/* Edges */}
        {diagram.edges.map((e, i) => {
          const fromIdx = diagram.steps.findIndex((s) => s.id === e.fromStepId);
          const toIdx = diagram.steps.findIndex((s) => s.id === e.toStepId);
          if (fromIdx < 0 || toIdx < 0) return null;
          const x1 = lifelineLeft(fromIdx) + ACTOR_WIDTH / 2;
          const x2 = lifelineLeft(toIdx) + ACTOR_WIDTH / 2;
          const y1 = 50 + fromIdx * STEP_HEIGHT + 26;
          const y2 = 50 + toIdx * STEP_HEIGHT;
          return (
            <svg
              key={`edge-${i}`}
              className="absolute pointer-events-none"
              style={{
                left: Math.min(x1, x2) - 4,
                top: y1,
                width: Math.abs(x2 - x1) + 8,
                height: y2 - y1,
                overflow: "visible",
              }}
            >
              <defs>
                <marker
                  id={`arrow-${i}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              <line
                x1={x1 < x2 ? 4 : Math.abs(x2 - x1) + 4}
                y1={0}
                x2={x1 < x2 ? Math.abs(x2 - x1) + 4 : 4}
                y2={y2 - y1}
                stroke="currentColor"
                className="text-accent"
                strokeWidth={1.2}
                markerEnd={`url(#arrow-${i})`}
              />
              {e.label && (
                <text
                  x={(x1 + x2) / 2 - Math.min(x1, x2) + 4}
                  y={(y2 - y1) / 2}
                  className="text-[9px] fill-text-muted"
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              )}
            </svg>
          );
        })}
      </div>
    </div>
  );
}
