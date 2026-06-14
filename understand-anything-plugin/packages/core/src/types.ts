// Node types (21 total: 5 code + 8 non-code + 3 domain + 5 knowledge)
export type NodeType =
  | "file" | "function" | "class" | "module" | "concept"
  | "config" | "document" | "service" | "table" | "endpoint"
  | "pipeline" | "schema" | "resource"
  | "domain" | "flow" | "step"
  | "article" | "entity" | "topic" | "claim" | "source";

// Edge types (35 total in 8 categories: Structural, Behavioral, Data flow, Dependencies, Semantic, Infrastructure/Schema, Domain, Knowledge)
export type EdgeType =
  | "imports" | "exports" | "contains" | "inherits" | "implements"  // Structural
  | "calls" | "subscribes" | "publishes" | "middleware"              // Behavioral
  | "reads_from" | "writes_to" | "transforms" | "validates"         // Data flow
  | "depends_on" | "tested_by" | "configures"                       // Dependencies
  | "related" | "similar_to"                                         // Semantic
  | "deploys" | "serves" | "provisions" | "triggers"                // Infrastructure
  | "migrates" | "documents" | "routes" | "defines_schema"          // Schema/Data
  | "contains_flow" | "flow_step" | "cross_domain"                  // Domain
  | "cites" | "contradicts" | "builds_on" | "exemplifies" | "categorized_under" | "authored_by"; // Knowledge

// Optional knowledge metadata for article/entity/topic/claim/source nodes
export interface KnowledgeMeta {
  wikilinks?: string[];
  backlinks?: string[];
  category?: string;
  content?: string;
}

// Optional domain metadata for domain/flow/step nodes
export interface DomainMeta {
  entities?: string[];
  businessRules?: string[];
  crossDomainInteractions?: string[];
  entryPoint?: string;
  entryType?: "http" | "cli" | "event" | "cron" | "manual";
}

// GraphNode with 21 types: 5 code + 8 non-code + 3 domain + 5 knowledge
export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath?: string;
  lineRange?: [number, number];
  summary: string;
  tags: string[];
  complexity: "simple" | "moderate" | "complex";
  languageNotes?: string;
  domainMeta?: DomainMeta;
  knowledgeMeta?: KnowledgeMeta;
}

// GraphEdge with rich relationship modeling
export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  direction: "forward" | "backward" | "bidirectional";
  description?: string;
  weight: number; // 0-1
}

// Layer (logical grouping)
export interface Layer {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

// TourStep (for learn mode)
export interface TourStep {
  order: number;
  title: string;
  description: string;
  nodeIds: string[];
  languageLesson?: string;
}

// ProjectMeta
export interface ProjectMeta {
  name: string;
  languages: string[];
  frameworks: string[];
  description: string;
  analyzedAt: string;
  gitCommitHash: string;
}

// Root KnowledgeGraph
export interface KnowledgeGraph {
  version: string;
  kind?: "codebase" | "knowledge";
  project: ProjectMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layers: Layer[];
  tour: TourStep[];
}

// Theme configuration (for dashboard customization)
export interface ThemeConfig {
  presetId: string;
  accentId: string;
}

// AnalysisMeta (for persistence)
export interface AnalysisMeta {
  lastAnalyzedAt: string;
  gitCommitHash: string;
  version: string;
  analyzedFiles: number;
  theme?: ThemeConfig;
}

// Project config (for auto-update opt-in and language preference)
export interface ProjectConfig {
  autoUpdate: boolean;
  outputLanguage?: string;
}

// Non-code structural sub-interfaces
export interface SectionInfo {
  name: string;
  level: number;
  lineRange: [number, number];
}

export interface DefinitionInfo {
  name: string;
  /** Parser-reported definition kind. Known values: "table", "view", "index", "message", "enum", "type", "input", "interface", "union", "scalar", "variable", "output", "resource", "data", "section", "target", "stage" */
  kind: string;
  lineRange: [number, number];
  fields: string[];
}

export interface ServiceInfo {
  name: string;
  image?: string;
  ports: number[];
  lineRange?: [number, number];
}

export interface EndpointInfo {
  method?: string;
  path: string;
  lineRange: [number, number];
}

export interface StepInfo {
  name: string;
  lineRange: [number, number];
}

export interface ResourceInfo {
  name: string;
  kind: string;
  lineRange: [number, number];
}

export interface ReferenceResolution {
  source: string;
  target: string;
  referenceType: string; // "file", "image", "schema", "service"
  line?: number;
}

// Plugin interfaces
export interface StructuralAnalysis {
  functions: Array<{ name: string; lineRange: [number, number]; params: string[]; returnType?: string }>;
  classes: Array<{ name: string; lineRange: [number, number]; methods: string[]; properties: string[] }>;
  imports: Array<{ source: string; specifiers: string[]; lineNumber: number }>;
  exports: Array<{ name: string; lineNumber: number; isDefault?: boolean }>;
  // Non-code structural data (all optional for backward compat)
  sections?: SectionInfo[];
  definitions?: DefinitionInfo[];
  services?: ServiceInfo[];
  endpoints?: EndpointInfo[];
  steps?: StepInfo[];
  resources?: ResourceInfo[];
}

export interface ImportResolution {
  source: string;
  resolvedPath: string;
  specifiers: string[];
}

export interface CallGraphEntry {
  caller: string;
  callee: string;
  lineNumber: number;
}

export interface AnalyzerPlugin {
  name: string;
  languages: string[];
  analyzeFile(filePath: string, content: string): StructuralAnalysis;
  resolveImports?(filePath: string, content: string): ImportResolution[];
  extractCallGraph?(filePath: string, content: string): CallGraphEntry[];
  extractReferences?(filePath: string, content: string): ReferenceResolution[];
}

// =============================================================================
// Architecture Decision Record (ADR) — V1 of Direction A "Why" persona
// =============================================================================
//
// An ADR captures WHY a piece of code/architecture exists the way it does.
// It complements the existing graph (which captures WHAT and HOW) by surfacing
// design rationale, tradeoffs, and rejected alternatives.

/** Lifecycle status of a decision. */
export type ADRStatus =
  | "proposed"     // draft, not yet acted upon
  | "accepted"     // in effect
  | "deprecated"   // no longer relevant (e.g. code removed)
  | "superseded";  // replaced by a newer decision (see `supersededBy`)

/** Provenance — where did this decision come from? */
export type ADRSource =
  | "git-commit"     // extracted from a commit message (V6-V8)
  | "code-comment"   // extracted from TODO/HACK/NOTE blocks (V7)
  | "llm-inferred"   // synthesised by an LLM agent (V9)
  | "manual";        // written by a human into a docs/adr-* file

/** Complexity bucket — mirrors the graph's `complexity` enum for consistency. */
export type ADRComplexity = "simple" | "moderate" | "complex";

/** A single alternative that was considered and not chosen. */
export interface ADRAlternative {
  name: string;
  whyRejected: string;
  pros: string[];
  cons: string[];
}

/** Positive and negative consequences of taking this decision. */
export interface ADRConsequences {
  positive: string[];
  negative: string[];
}

/**
 * The full Architecture Decision Record.
 *
 * The shape follows Michael Nygard's classic ADR format (Status / Context /
 * Decision / Consequences) extended with alternatives, provenance, and
 * back-references to graph nodes that this decision affects.
 */
export interface ArchitectureDecisionRecord {
  /** Unique id, e.g. "adr:0001" or "adr:<short-hash>". */
  id: string;
  /** One-line summary of the decision. */
  title: string;
  /** Lifecycle status. */
  status: ADRStatus;
  /** The situation that forced the decision. Free-form text. */
  context: string;
  /** The choice that was made. Free-form text. */
  decision: string;
  /** Tradeoff breakdown. */
  consequences: ADRConsequences;
  /** Alternatives that were considered but rejected. */
  alternatives: ADRAlternative[];
  /** ISO 8601 date the decision was made. */
  date: string;
  /** Author's git commit hash, if known (e.g. "a1b2c3d4..."). */
  authorCommit?: string;
  /** Where this decision was discovered / authored. */
  source: ADRSource;
  /** Free-form labels for filtering and search. */
  tags: string[];
  /** Graph node ids (files / functions / modules) this decision applies to. */
  linkedNodeIds: string[];
  /** ADR id that replaced this one, when status === "superseded". */
  supersededBy?: string;
  /** Complexity bucket — defaults to "moderate". */
  complexity: ADRComplexity;
  /** Optional tradeoff score in [0, 1]: higher = better net tradeoff. 0.5 = neutral. */
  tradeoffScore?: number;
}

/** Top-level ADR collection for a project, written to
 *  `.understand-anything/decisions-graph.json`. */
export interface ADRGraph {
  version: string;
  project: {
    name: string;
    analyzedAt: string;
    gitCommitHash: string;
  };
  decisions: ArchitectureDecisionRecord[];
}
