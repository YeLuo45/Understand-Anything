/**
 * Memory Mesh — cross-agent shared memory + federation (V21/30)
 *
 * Coordinates multiple MemoryKV instances (representing different
 * agents or contexts) and supports:
 *   - publish(message, scope)  — broadcast a memory to other agents
 *   - subscribe(agentId)       — listen for messages targeting an agent
 *   - mesh(agentA, agentB)     — share an entry between two agents
 *
 * Borrowed from agentmemory's `mesh.ts`.
 */

import { MemoryKV } from "./kv.js";
import type { MemoryEntry } from "./schema.js";

export interface MeshMessage {
  id: string;
  fromAgent: string;
  toScope: string;            // agent id or "broadcast"
  entry: MemoryEntry;
  ts: string;
}

export class MemoryMesh {
  private kvs = new Map<string, MemoryKV>();   // agentId → KV
  private inbox = new Map<string, MeshMessage[]>();
  private outbox: MeshMessage[] = [];
  private now: () => string;
  private counter = 0;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  registerAgent(agentId: string, kv: MemoryKV = new MemoryKV()): MemoryKV {
    this.kvs.set(agentId, kv);
    if (!this.inbox.has(agentId)) this.inbox.set(agentId, []);
    return kv;
  }

  unregisterAgent(agentId: string): boolean {
    this.inbox.delete(agentId);
    return this.kvs.delete(agentId);
  }

  getKV(agentId: string): MemoryKV | undefined {
    return this.kvs.get(agentId);
  }

  agents(): string[] {
    return [...this.kvs.keys()];
  }

  /** Share an entry from one agent to another. */
  mesh(fromAgent: string, toAgent: string, entry: MemoryEntry): MeshMessage {
    if (!this.kvs.has(fromAgent)) throw new Error(`mesh: unknown fromAgent ${fromAgent}`);
    if (!this.kvs.has(toAgent)) throw new Error(`mesh: unknown toAgent ${toAgent}`);
    this.counter++;
    const msg: MeshMessage = {
      id: `msg_${this.counter}`,
      fromAgent,
      toScope: toAgent,
      entry,
      ts: this.now(),
    };
    this.outbox.push(msg);
    this.inbox.get(toAgent)!.push(msg);
    // Apply to target KV (with re-keyed id to avoid collision)
    this.kvs.get(toAgent)!.put({
      id: `${toAgent}_${entry.id}`,
      content: entry.content,
      scope: entry.scope,
      tags: [...entry.tags, `from:${fromAgent}`],
      metadata: { ...entry.metadata, meshSource: fromAgent },
      confidence: entry.confidence,
      source: entry.source ?? `mesh:${fromAgent}`,
    });
    return msg;
  }

  /** Broadcast to all registered agents except sender. */
  publish(fromAgent: string, entry: MemoryEntry): MeshMessage[] {
    const msgs: MeshMessage[] = [];
    for (const a of this.kvs.keys()) {
      if (a !== fromAgent) msgs.push(this.mesh(fromAgent, a, entry));
    }
    return msgs;
  }

  /** Retrieve unread messages for an agent. */
  inbox_(agentId: string, sinceTs?: string): MeshMessage[] {
    const all = this.inbox.get(agentId) ?? [];
    if (!sinceTs) return [...all];
    return all.filter((m) => m.ts > sinceTs);
  }

  /** Clear inbox for an agent. */
  clearInbox(agentId: string): number {
    const inbox = this.inbox.get(agentId);
    if (!inbox) return 0;
    const n = inbox.length;
    inbox.length = 0;
    return n;
  }

  outbox_(): readonly MeshMessage[] {
    return this.outbox;
  }
}
