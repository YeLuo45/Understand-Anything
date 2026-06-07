/**
 * UI Learn (Direction B) — Feature Point Explorer types
 *
 * A "feature point" is an interactive user-facing capability in the
 * analysed project (e.g. "User login", "Send message", "Export dashboard").
 * The UI Learn view shows a list of these features; clicking one displays
 * the full CRUD node set and a sequence/flowchart of how those nodes
 * collaborate to implement the feature.
 *
 * V1/15 — type definitions only (no behaviour).
 */

/** CRUD verbs a feature can express. */
export type CrudVerb = "create" | "read" | "update" | "delete";

export const CRUD_VERBS: readonly CrudVerb[] = [
  "create",
  "read",
  "update",
  "delete",
] as const;

/** Display labels per locale; falls back to a capitalized verb when missing. */
export type CrudLabels = Record<CrudVerb, string>;

/**
 * A node participating in a feature, scoped to a CRUD verb.
 * `nodeId` is the KnowledgeGraph node id; `role` is a short description
 * (e.g. "listens to click", "validates form", "persists to DB").
 */
export interface CrudEntry {
  readonly nodeId: string;
  readonly role: string;
}

/** CRUD breakdown of a feature point. */
export interface CrudFlow {
  readonly create: readonly CrudEntry[];
  readonly read: readonly CrudEntry[];
  readonly update: readonly CrudEntry[];
  readonly delete: readonly CrudEntry[];
}

/** A single step in a sequence diagram (ordered top → bottom). */
export interface SequenceStep {
  readonly id: string;
  /** Node id of the actor/file the step runs on. */
  readonly nodeId: string;
  /** Short label displayed in the lifeline header. */
  readonly actor: string;
  /** Action description rendered on the arrow. */
  readonly message: string;
  /** Optional verb override; defaults to "read". */
  readonly verb?: CrudVerb;
}

/** Directed edge between two sequence steps (lifeline-to-lifeline arrow). */
export interface SequenceEdge {
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly label?: string;
  /** Visual style hint. */
  readonly kind?: "sync" | "async" | "return";
}

/** Sequence diagram (time-ordered). */
export interface SequenceDiagram {
  readonly kind: "sequence";
  readonly steps: readonly SequenceStep[];
  readonly edges: readonly SequenceEdge[];
}

/** A node in a flowchart — process box, decision diamond, or terminator. */
export interface FlowNode {
  readonly id: string;
  /** KnowledgeGraph node id this flow node is backed by. */
  readonly nodeId: string;
  readonly label: string;
  readonly shape: "process" | "decision" | "terminator" | "io";
}

/** A directed edge in a flowchart. */
export interface FlowEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly label?: string;
  /** "yes"/"no" for decision branches, otherwise omit. */
  readonly branch?: "yes" | "no" | "default";
}

/** Flowchart diagram (control-flow oriented). */
export interface FlowchartDiagram {
  readonly kind: "flowchart";
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

/** Discriminated union of supported diagrams. */
export type Diagram = SequenceDiagram | FlowchartDiagram;

/** User-switchable diagram view mode. */
export type DiagramViewMode = "sequence" | "flowchart";

/** Metadata about a single interactive feature point. */
export interface FeaturePoint {
  /** Stable id, e.g. "feature:user-login". */
  readonly id: string;
  /** Title displayed in the feature card. */
  readonly title: string;
  /** One-line description / teaser. */
  readonly description: string;
  /** Lucide-ish icon name (resolved at render time). */
  readonly icon: string;
  /** Tag chips (e.g. "auth", "ui", "api"). */
  readonly tags: readonly string[];
  /** CRUD decomposition of the feature. */
  readonly crud: CrudFlow;
  /** Default diagram shown when the user opens the feature. */
  readonly diagram: Diagram;
  /** Optional alternative diagram (e.g. flowchart alongside sequence). */
  readonly alternativeDiagram?: Diagram;
  /** Source confidence 0..1 — heuristic-generated features start lower. */
  readonly confidence: number;
}

/** Auto-extracted feature, with provenance metadata. */
export interface ExtractedFeature extends FeaturePoint {
  /** Files that triggered extraction (e.g. handler endpoints). */
  readonly sourceFileIds: readonly string[];
  /** Extraction strategy id, e.g. "endpoint-cluster", "tag-cluster". */
  readonly strategy: string;
}

/** A registry of feature points keyed by id. */
export interface FeaturePointRegistry {
  readonly features: readonly FeaturePoint[];
  readonly byId: Readonly<Record<string, FeaturePoint>>;
  /** Features filtered by tag. */
  filterByTag(tag: string): readonly FeaturePoint[];
  /** Search by case-insensitive substring match on title/description/tags. */
  search(query: string): readonly FeaturePoint[];
}
