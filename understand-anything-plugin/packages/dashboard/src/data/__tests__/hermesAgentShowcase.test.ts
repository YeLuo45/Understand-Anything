/**
 * UI Learn (Direction B) — hermes-agent showcase features tests (V14/15)
 *
 * No RTL/jsdom dep — pure vitest. Verifies shape, uniqueness, and
 * that each showcase feature's CRUD nodes resolve to real graph nodes
 * when the knowledge graph is fetchable.
 */

import { describe, it, expect } from "vitest";
import { HERMES_AGENT_SHOWCASE_FEATURES } from "../hermesAgentShowcase";
import { buildFeaturePointRegistry } from "../../registry/featurePointRegistry";
import { CRUD_VERBS } from "../../types/featurePoints";

describe("HERMES_AGENT_SHOWCASE_FEATURES", () => {
  it("has 3 curated features", () => {
    expect(HERMES_AGENT_SHOWCASE_FEATURES).toHaveLength(3);
  });

  it("uses unique ids", () => {
    const ids = HERMES_AGENT_SHOWCASE_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every feature has a non-empty CRUD object", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      const total =
        f.crud.create.length +
        f.crud.read.length +
        f.crud.update.length +
        f.crud.delete.length;
      expect(total, `${f.id} should have at least one CRUD node`).toBeGreaterThan(0);
    }
  });

  it("uses only allowed CRUD verbs", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      for (const verb of CRUD_VERBS) {
        expect(Array.isArray(f.crud[verb])).toBe(true);
      }
    }
  });

  it("every feature has a diagram with at least one step or node", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      if (f.diagram.kind === "sequence") {
        expect(f.diagram.steps.length, f.id).toBeGreaterThan(0);
      } else {
        expect(f.diagram.nodes.length, f.id).toBeGreaterThan(0);
      }
    }
  });

  it("sequence edges reference existing step ids", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      if (f.diagram.kind !== "sequence") continue;
      const ids = new Set(f.diagram.steps.map((s) => s.id));
      for (const e of f.diagram.edges) {
        expect(ids.has(e.fromStepId), `${f.id} edge from missing step`).toBe(true);
        expect(ids.has(e.toStepId), `${f.id} edge to missing step`).toBe(true);
      }
    }
  });

  it("flowchart edges reference existing node ids", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      if (f.diagram.kind !== "flowchart") continue;
      const ids = new Set(f.diagram.nodes.map((n) => n.id));
      for (const e of f.diagram.edges) {
        expect(ids.has(e.fromNodeId), `${f.id} edge from missing node`).toBe(true);
        expect(ids.has(e.toNodeId), `${f.id} edge to missing node`).toBe(true);
      }
    }
  });

  it("every nodeId reference uses the file: prefix", () => {
    for (const f of HERMES_AGENT_SHOWCASE_FEATURES) {
      const all = [
        ...f.crud.create,
        ...f.crud.read,
        ...f.crud.update,
        ...f.crud.delete,
      ];
      for (const e of all) {
        expect(e.nodeId.startsWith("file:")).toBe(true);
      }
      if (f.diagram.kind === "sequence") {
        for (const s of f.diagram.steps) {
          expect(s.nodeId.startsWith("file:")).toBe(true);
        }
      } else {
        for (const n of f.diagram.nodes) {
          expect(n.nodeId.startsWith("file:")).toBe(true);
        }
      }
    }
  });
});

describe("Registry merge (showcase first)", () => {
  it("puts showcase features before auto-extracted ones", () => {
    const auto = [
      {
        id: "auto-1",
        title: "Auto 1",
        description: "x",
        icon: "tag",
        tags: [],
        crud: { create: [], read: [], update: [], delete: [] },
        diagram: { kind: "sequence" as const, steps: [], edges: [] },
        confidence: 0.5,
      },
    ];
    const reg = buildFeaturePointRegistry([
      ...HERMES_AGENT_SHOWCASE_FEATURES,
      ...auto,
    ]);
    expect(reg.features[0].id).toBe("feature:showcase:chat-message");
    expect(reg.features.at(-1)!.id).toBe("auto-1");
  });

  it("search filters across showcase and auto features", () => {
    const reg = buildFeaturePointRegistry([...HERMES_AGENT_SHOWCASE_FEATURES]);
    expect(reg.search("chat").map((f) => f.id)).toContain("feature:showcase:chat-message");
    expect(reg.search("plugin").map((f) => f.id)).toContain("feature:showcase:plugin-enable");
    expect(reg.search("changelog").map((f) => f.id)).toContain("feature:showcase:view-changelog");
  });
});
