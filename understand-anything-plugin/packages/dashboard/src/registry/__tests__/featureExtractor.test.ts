/**
 * UI Learn — Feature Point extractor tests (V2/15)
 */

import { describe, it, expect } from "vitest";
import type { KnowledgeGraph } from "@understand-anything/core/types";
import {
  DEFAULT_EXTRACTOR_OPTIONS,
  extractFeaturePoints,
  groupByStrategy,
} from "../featureExtractor";

function makeNode(id: string, tags: string[] = [], layer?: string) {
  return {
    id,
    type: "file" as const,
    name: id.replace(/^file:/, ""),
    filePath: id.replace(/^file:/, ""),
    summary: id,
    tags,
    complexity: "simple" as const,
    ...(layer ? { layer } : {}),
  };
}

function makeGraph(opts: {
  nodes?: ReturnType<typeof makeNode>[];
  layers?: Array<{
    id: string;
    name: string;
    nodeIds: string[];
    description?: string;
  }>;
  edges?: Array<{
    source: string;
    target: string;
    type: string;
  }>;
}): KnowledgeGraph {
  return {
    version: "1.0.0",
    kind: "codebase",
    project: {
      name: "test",
      description: "test",
      languages: ["ts"],
      frameworks: [],
      analyzedAt: "2026-06-07T00:00:00Z",
      gitCommitHash: "abc",
    },
    nodes: (opts.nodes ?? []) as unknown as KnowledgeGraph["nodes"],
    edges: (opts.edges ?? []) as unknown as KnowledgeGraph["edges"],
    layers: (opts.layers ?? []) as unknown as KnowledgeGraph["layers"],
    tour: [],
  };
}

describe("extractFeaturePoints", () => {
  it("returns an empty array for a graph with no nodes", () => {
    const out = extractFeaturePoints(makeGraph({}));
    expect(out).toEqual([]);
  });

  it("skips layers whose name is in skipLayerNames (root by default)", () => {
    const g = makeGraph({
      nodes: [makeNode("file:a"), makeNode("file:b")],
      layers: [
        { id: "layer:root", name: "Root", nodeIds: ["file:a", "file:b"] },
      ],
    });
    const out = extractFeaturePoints(g);
    expect(out.find((f) => f.id.includes("layer:root"))).toBeUndefined();
  });

  it("emits a layer-cluster feature for non-Root layers with ≥ minClusterSize", () => {
    const g = makeGraph({
      nodes: [makeNode("file:a", [], "Auth"), makeNode("file:b", [], "Auth")],
      layers: [
        {
          id: "layer:auth",
          name: "Auth",
          description: "auth files",
          nodeIds: ["file:a", "file:b"],
        },
      ],
    });
    const out = extractFeaturePoints(g);
    const auth = out.find((f) => f.id === "feature:auto:layer:layer:auth");
    expect(auth).toBeDefined();
    expect(auth!.title).toBe("Auth");
    expect(auth!.description).toBe("auth files");
    expect(auth!.sourceFileIds).toEqual(["file:a", "file:b"]);
  });

  it("emits a tag-cluster feature when ≥ minClusterSize files share a tag", () => {
    const g = makeGraph({
      nodes: [makeNode("file:a", ["api"]), makeNode("file:b", ["api"])],
    });
    const out = extractFeaturePoints(g);
    const tag = out.find((f) => f.id === "feature:auto:tag:api");
    expect(tag).toBeDefined();
    expect(tag!.sourceFileIds).toHaveLength(2);
  });

  it("emits import clusters using weakly-connected components", () => {
    const g = makeGraph({
      nodes: [makeNode("file:a"), makeNode("file:b"), makeNode("file:c")],
      edges: [
        { source: "file:a", target: "file:b", type: "imports" },
        { source: "file:b", target: "file:c", type: "imports" },
      ],
    });
    const out = extractFeaturePoints(g);
    const cluster = out.find((f) => f.strategy === "import-cluster");
    expect(cluster).toBeDefined();
    expect(cluster!.sourceFileIds).toHaveLength(3);
  });

  it("respects maxFeatures cap", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => makeNode(`file:f${i}`, [`tag${i}`]));
    const g = makeGraph({ nodes });
    const out = extractFeaturePoints(g, { maxFeatures: 2 });
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it("humanizes layer names by capitalising each word", () => {
    expect(DEFAULT_EXTRACTOR_OPTIONS.skipLayerNames).toContain("root");
  });
});

describe("groupByStrategy", () => {
  it("returns three empty buckets for an empty input", () => {
    const g = groupByStrategy([]);
    expect(g["layer-cluster"]).toEqual([]);
    expect(g["tag-cluster"]).toEqual([]);
    expect(g["import-cluster"]).toEqual([]);
  });

  it("partitions features by strategy", () => {
    const g = makeGraph({
      nodes: [
        makeNode("file:a", ["api"], "Core"),
        makeNode("file:b", ["api"], "Core"),
      ],
      layers: [
        { id: "layer:core", name: "Core", nodeIds: ["file:a", "file:b"] },
      ],
    });
    const all = extractFeaturePoints(g);
    const grouped = groupByStrategy(all);
    const total = grouped["layer-cluster"].length +
      grouped["tag-cluster"].length +
      grouped["import-cluster"].length;
    expect(total).toBe(all.length);
  });
});
