/**
 * UI Learn (Direction B) — hand-authored showcase features for the
 * hermes-agent (AstrBot) project. These are merged with auto-extracted
 * features in the UILearnView; the registry builder accepts mixed
 * input from both sources.
 *
 * V13/15: 3 curated features that demonstrate the CRUD + sequence
 * shape across real hermes-agent files.
 */

import type { FeaturePoint } from "../types/featurePoints";

function fileNodeId(path: string): string {
  return `file:${path}`;
}

export const HERMES_AGENT_SHOWCASE_FEATURES: readonly FeaturePoint[] = [
  {
    id: "feature:showcase:chat-message",
    title: "Send a chat message",
    description:
      "User submits a message in the chat box; the dashboard forwards it to the bot backend, which resolves the LLM provider and streams the response back.",
    icon: "log-in",
    tags: ["chat", "llm", "showcase"],
    crud: {
      create: [
        {
          nodeId: fileNodeId("astrbot/dashboard/server.py"),
          role: "create session / persist message",
        },
      ],
      read: [
        { nodeId: fileNodeId("dashboard/src/router/ChatBoxRoutes.ts"), role: "POST endpoint" },
        { nodeId: fileNodeId("dashboard/src/views/ChatView.vue"), role: "chat UI" },
        { nodeId: fileNodeId("astrbot/core/provider/sources/openai_source.py"), role: "resolve LLM provider" },
      ],
      update: [
        {
          nodeId: fileNodeId("astrbot/dashboard/server.py"),
          role: "stream tokens back to client",
        },
      ],
      delete: [],
    },
    diagram: {
      kind: "sequence",
      steps: [
        {
          id: "s1",
          nodeId: fileNodeId("dashboard/src/views/ChatView.vue"),
          actor: "ChatView",
          message: "user submits message",
        },
        {
          id: "s2",
          nodeId: fileNodeId("dashboard/src/router/ChatBoxRoutes.ts"),
          actor: "ChatBoxRoutes",
          message: "POST /chat",
        },
        {
          id: "s3",
          nodeId: fileNodeId("astrbot/dashboard/server.py"),
          actor: "server",
          message: "dispatch to provider",
        },
        {
          id: "s4",
          nodeId: fileNodeId("astrbot/core/provider/sources/openai_source.py"),
          actor: "OpenAI Source",
          message: "stream tokens",
        },
        {
          id: "s5",
          nodeId: fileNodeId("dashboard/src/router/ChatBoxRoutes.ts"),
          actor: "ChatBoxRoutes",
          message: "stream to client",
        },
      ],
      edges: [
        { fromStepId: "s1", toStepId: "s2", kind: "sync" },
        { fromStepId: "s2", toStepId: "s3", kind: "async" },
        { fromStepId: "s3", toStepId: "s4", kind: "sync" },
        { fromStepId: "s4", toStepId: "s5", kind: "async", label: "stream" },
        { fromStepId: "s5", toStepId: "s1", kind: "async", label: "render" },
      ],
    },
    confidence: 0.9,
  },
  {
    id: "feature:showcase:plugin-enable",
    title: "Enable or disable a plugin",
    description:
      "Admin toggles a plugin on the plugin management page; the change is persisted to the configuration store and broadcast to the bot at next tick.",
    icon: "layers",
    tags: ["plugin", "admin", "showcase"],
    crud: {
      create: [],
      read: [
        { nodeId: fileNodeId("astrbot/dashboard/plugin_page_auth.py"), role: "list plugins" },
        { nodeId: fileNodeId("dashboard/src/views/PluginsView.vue"), role: "plugin UI" },
      ],
      update: [
        { nodeId: fileNodeId("astrbot/dashboard/plugin_page_auth.py"), role: "patch enabled flag" },
        { nodeId: fileNodeId("astrbot/core/config/computer_config.py"), role: "persist to disk" },
      ],
      delete: [],
    },
    diagram: {
      kind: "flowchart",
      nodes: [
        {
          id: "n1",
          nodeId: fileNodeId("dashboard/src/views/PluginsView.vue"),
          label: "Toggle switch",
          shape: "terminator",
        },
        {
          id: "n2",
          nodeId: fileNodeId("astrbot/dashboard/plugin_page_auth.py"),
          label: "PATCH /plugins",
          shape: "process",
        },
        {
          id: "n3",
          nodeId: fileNodeId("astrbot/core/config/computer_config.py"),
          label: "Validate config?",
          shape: "decision",
        },
        {
          id: "n4",
          nodeId: fileNodeId("astrbot/dashboard/server.py"),
          label: "Broadcast to bot",
          shape: "process",
        },
        {
          id: "n5",
          nodeId: fileNodeId("dashboard/src/views/PluginsView.vue"),
          label: "Toast OK",
          shape: "terminator",
        },
      ],
      edges: [
        { fromNodeId: "n1", toNodeId: "n2" },
        { fromNodeId: "n2", toNodeId: "n3" },
        { fromNodeId: "n3", toNodeId: "n4", branch: "yes" },
        { fromNodeId: "n4", toNodeId: "n5" },
      ],
    },
    confidence: 0.85,
  },
  {
    id: "feature:showcase:view-changelog",
    title: "Browse version changelog",
    description:
      "User opens the changelog dialog; the front-end lazily loads a markdown file from the changelogs/ directory and renders it with syntax highlighting.",
    icon: "tag",
    tags: ["docs", "changelog", "showcase"],
    crud: {
      create: [],
      read: [
        { nodeId: fileNodeId("dashboard/src/components/shared/ChangelogDialog.vue"), role: "fetch changelog" },
        { nodeId: fileNodeId("changelogs/v4.20.0.md"), role: "markdown source" },
      ],
      update: [],
      delete: [],
    },
    diagram: {
      kind: "sequence",
      steps: [
        {
          id: "s1",
          nodeId: fileNodeId("dashboard/src/components/shared/ChangelogDialog.vue"),
          actor: "ChangelogDialog",
          message: "open dialog",
        },
        {
          id: "s2",
          nodeId: fileNodeId("changelogs/v4.20.0.md"),
          actor: "Markdown",
          message: "GET /changelog/v4.20.0.md",
        },
        {
          id: "s3",
          nodeId: fileNodeId("dashboard/src/components/shared/ChangelogDialog.vue"),
          actor: "ChangelogDialog",
          message: "render with prism",
        },
      ],
      edges: [
        { fromStepId: "s1", toStepId: "s2" },
        { fromStepId: "s2", toStepId: "s3", label: "text/markdown" },
      ],
    },
    confidence: 0.95,
  },
];
