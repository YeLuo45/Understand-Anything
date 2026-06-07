/**
 * UI Learn — Feature Point extractor (V2/15)
 *
 * Heuristic extraction strategies over a `KnowledgeGraph`. The goal is
 * to surface interactive feature points automatically from layer / tag /
 * import clusters when the project has no hand-authored feature list.
 *
 * Strategies:
 *   - "layer-cluster"  : every non-Root layer becomes a feature candidate
 *   - "tag-cluster"    : groups of files sharing a common tag become a feature
 *   - "import-cluster" : weakly-connected components in the `imports` graph
 *
 * The strategies are intentionally conservative: low-confidence features
 * still surface in the UI, but with a "heuristic" badge.
 */

import type { KnowledgeGraph } from "@understand-anything/core/types";
import type {
  CrudFlow,
  ExtractedFeature,
  SequenceDiagram,
  SequenceStep,
} from "../types/featurePoints";
import type { GraphNode } from "@understand-anything/core/types";

// Re-export so callers can `import { FeaturePoint } from "..."`
export type { FeaturePoint, ExtractedFeature } from "../types/featurePoints";

type Strategy = "layer-cluster" | "tag-cluster" | "import-cluster";
/** Tunable knobs for the extractor. */
export interface ExtractorOptions {
  /** Minimum number of nodes required to form a feature. */
  minClusterSize: number;
  /** Maximum number of features returned. */
  maxFeatures: number;
  /** Layers whose name matches one of these (case-insensitive) are skipped. */
  skipLayerNames: readonly string[];
  /** Base confidence assigned to extracted features (0..1). */
  baseConfidence: number;
}

export const DEFAULT_EXTRACTOR_OPTIONS: ExtractorOptions = {
  minClusterSize: 2,
  maxFeatures: 12,
  skipLayerNames: ["root"],
  baseConfidence: 0.55,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileNodeMatchesLayer(
  node: GraphNode,
  layerId: string,
  layerNodeIds: ReadonlySet<string>,
): boolean {
  // The dashboard's middleware already assigns `node.layer` for non-Root layers
  // via the layers[].nodeIds reverse index. We accept either signal.
  const meta = (node as GraphNode & { layer?: string }).layer;
  if (typeof meta === "string" && meta.length > 0) {
    return meta === layerNameFromId(layerId);
  }
  return layerNodeIds.has(node.id);
}

function layerNameFromId(layerId: string): string {
  return layerId.replace(/^layer:/, "");
}

function isFileNode(n: GraphNode): boolean {
  return n.type === "file";
}

function buildCrud(
  nodeIds: readonly string[],
  role: string,
): CrudFlow {
  // We don't try to infer C/R/U/D here — that's a V8 concern. For now every
  // file counts as a "read" participant so the UI has something to render.
  const reads = nodeIds.map((id) => ({ nodeId: id, role }));
  return {
    create: [],
    read: reads,
    update: [],
    delete: [],
  };
}

// ---------------------------------------------------------------------------
// Strategy: layer-cluster
// ---------------------------------------------------------------------------

function extractLayerClusters(
  graph: KnowledgeGraph,
  opts: ExtractorOptions,
): ExtractedFeature[] {
  const out: ExtractedFeature[] = [];
  for (const layer of graph.layers) {
    const name = layer.name;
    if (opts.skipLayerNames.includes(name.toLowerCase())) continue;
    if (layer.nodeIds.length < opts.minClusterSize) continue;

    const layerNodeIds = new Set(layer.nodeIds);
    const files = graph.nodes.filter(
      (n) =>
        isFileNode(n) &&
        (layerNodeIds.has(n.id) || fileNodeMatchesLayer(n, layer.id, layerNodeIds)),
    );
    if (files.length < opts.minClusterSize) continue;

    const ids = files.map((f) => f.id);
    const diagram = buildSequenceDiagramFromIds(ids, graph);
    out.push({
      id: `feature:auto:layer:${layer.id}`,
      title: humanizeLayerName(name),
      description: layer.description || `Files grouped under the "${name}" layer`,
      icon: "layers",
      tags: ["layer", name.toLowerCase()],
      crud: buildCrud(ids, "file in layer"),
      diagram,
      confidence: opts.baseConfidence,
      sourceFileIds: ids,
      strategy: "layer-cluster",
    });
  }
  return out;
}

function humanizeLayerName(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Strategy: tag-cluster
// ---------------------------------------------------------------------------

function extractTagClusters(
  graph: KnowledgeGraph,
  opts: ExtractorOptions,
): ExtractedFeature[] {
  const tagBuckets = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (!isFileNode(node)) continue;
    for (const tag of node.tags) {
      const bucket = tagBuckets.get(tag) ?? [];
      bucket.push(node);
      tagBuckets.set(tag, bucket);
    }
  }
  const out: ExtractedFeature[] = [];
  for (const [tag, nodes] of tagBuckets) {
    if (nodes.length < opts.minClusterSize) continue;
    if (tag.length === 0) continue;
    const ids = nodes.map((n) => n.id);
    out.push({
      id: `feature:auto:tag:${tag}`,
      title: humanizeLayerName(tag),
      description: `Files tagged "${tag}"`,
      icon: "tag",
      tags: [tag, "tag-cluster"],
      crud: buildCrud(ids, "file with tag"),
      diagram: buildSequenceDiagramFromIds(ids, graph),
      confidence: opts.baseConfidence * 0.9,
      sourceFileIds: ids,
      strategy: "tag-cluster",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy: import-cluster (weakly connected components)
// ---------------------------------------------------------------------------

function extractImportClusters(
  graph: KnowledgeGraph,
  opts: ExtractorOptions,
): ExtractedFeature[] {
  const fileIds = graph.nodes.filter(isFileNode).map((n) => n.id);
  const fileSet = new Set(fileIds);

  // Build adjacency: file → set of file neighbours (both directions of imports).
  const adj = new Map<string, Set<string>>();
  for (const id of fileIds) adj.set(id, new Set());
  for (const edge of graph.edges) {
    if (edge.type !== "imports") continue;
    if (!fileSet.has(edge.source) || !fileSet.has(edge.target)) continue;
    adj.get(edge.source)!.add(edge.target);
    adj.get(edge.target)!.add(edge.source);
  }

  // BFS components.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const id of fileIds) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) stack.push(n);
      }
    }
    if (comp.length >= opts.minClusterSize) components.push(comp);
  }
  components.sort((a, b) => b.length - a.length);

  return components.slice(0, opts.maxFeatures).map((comp, idx) => ({
    id: `feature:auto:import:${idx}`,
    title: `Import cluster ${idx + 1}`,
    description: `${comp.length} files connected by mutual imports`,
    icon: "git-branch",
    tags: ["import-cluster", `cluster-${idx + 1}`],
    crud: buildCrud(comp, "connected file"),
    diagram: buildSequenceDiagramFromIds(comp, graph),
    confidence: opts.baseConfidence * 0.8,
    sourceFileIds: comp,
    strategy: "import-cluster",
  }));
}

// ---------------------------------------------------------------------------
// Sequence diagram builder (simple: lifelines = first 6 nodes, edges = imports)
// ---------------------------------------------------------------------------

function buildSequenceDiagramFromIds(
  nodeIds: readonly string[],
  graph: KnowledgeGraph,
): SequenceDiagram {
  const limited = nodeIds.slice(0, 6);
  const steps: SequenceStep[] = limited.map((nodeId, i) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    const name = node?.name ?? nodeId;
    return {
      id: `s${i + 1}`,
      nodeId,
      actor: shortenName(name),
      message: i === 0 ? "enter" : `delegate to ${shortenName(name)}`,
    };
  });
  const edges = steps.slice(1).map((step, i) => ({
    fromStepId: steps[i].id,
    toStepId: step.id,
    kind: "sync" as const,
  }));
  return { kind: "sequence", steps, edges };
}

function shortenName(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.length > 24 ? base.slice(0, 21) + "..." : base;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Run all extractors and return deduplicated, ranked features. */
export function extractFeaturePoints(
  graph: KnowledgeGraph,
  options: Partial<ExtractorOptions> = {},
): ExtractedFeature[] {
  const opts: ExtractorOptions = { ...DEFAULT_EXTRACTOR_OPTIONS, ...options };
  const byStrategy: Record<Strategy, ExtractedFeature[]> = {
    "layer-cluster": extractLayerClusters(graph, opts),
    "tag-cluster": extractTagClusters(graph, opts),
    "import-cluster": extractImportClusters(graph, opts),
  };
  const all = [
    ...byStrategy["layer-cluster"],
    ...byStrategy["import-cluster"],
    ...byStrategy["tag-cluster"],
  ];
  return all.slice(0, opts.maxFeatures);
}

/** Group extracted features by strategy id, useful for debugging/UI badges. */
export function groupByStrategy(
  features: readonly ExtractedFeature[],
): Record<Strategy, ExtractedFeature[]> {
  const out: Record<Strategy, ExtractedFeature[]> = {
    "layer-cluster": [],
    "tag-cluster": [],
    "import-cluster": [],
  };
  for (const f of features) out[f.strategy as Strategy].push(f);
  return out;
}
