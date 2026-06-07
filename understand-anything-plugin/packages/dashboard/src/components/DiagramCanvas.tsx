/**
 * UI Learn — Diagram canvas (V9-V11)
 *
 * Switches between SequenceDiagram and FlowchartDiagram based on the
 * `viewMode` state. Renders inside a ReactFlowProvider so node-click
 * events can call back into the parent.
 */
import { useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Diagram, DiagramViewMode } from "../types/featurePoints";
import SequenceDiagram from "./SequenceDiagram";
import FlowchartDiagram from "./FlowchartDiagram";

interface DiagramCanvasProps {
  diagram: Diagram;
  alternativeDiagram?: Diagram;
  viewMode: DiagramViewMode;
  onNodeClick?: (nodeId: string) => void;
}

export default function DiagramCanvas({
  diagram,
  alternativeDiagram,
  viewMode,
  onNodeClick,
}: DiagramCanvasProps) {
  const active = useMemo<Diagram>(() => {
    if (viewMode === "sequence") return diagram;
    // For flowchart view: use the alternative if it's a flowchart, else
    // fall back to a synthesised one derived from the sequence.
    if (alternativeDiagram?.kind === "flowchart") return alternativeDiagram;
    return synthesiseFlowchart(diagram);
  }, [diagram, alternativeDiagram, viewMode]);

  return (
    <ReactFlowProvider>
      {active.kind === "sequence" ? (
        <SequenceDiagram diagram={active} onNodeClick={onNodeClick} />
      ) : (
        <FlowchartDiagram diagram={active} onNodeClick={onNodeClick} />
      )}
    </ReactFlowProvider>
  );
}

function synthesiseFlowchart(diagram: Diagram) {
  if (diagram.kind === "flowchart") return diagram;
  // Convert sequence steps → flow nodes (process boxes, first is terminator).
  const nodes = diagram.steps.map((s, i) => ({
    id: s.id,
    nodeId: s.nodeId,
    label: `${s.actor}: ${s.message}`,
    shape:
      i === 0
        ? ("terminator" as const)
        : i === diagram.steps.length - 1
          ? ("terminator" as const)
          : ("process" as const),
  }));
  const edges = diagram.edges.map((e) => ({
    fromNodeId: e.fromStepId,
    toNodeId: e.toStepId,
    label: e.label,
  }));
  return { kind: "flowchart" as const, nodes, edges };
}
