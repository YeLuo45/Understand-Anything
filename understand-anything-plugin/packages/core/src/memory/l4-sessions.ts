/**
 * L4 Session Archive Engine — distilled session records (V11/30)
 *
 * Compressed, structured records of completed sessions. Each record
 * stores:
 *   - sessionId, title, summary
 *   - durationMs, startTs, endTs
 *   - memoryIds used (cross-reference into L0-L3)
 *   - outcome: "success" | "partial" | "failure"
 *
 * Borrowed from generic-agent's L4 layer.
 */

export type SessionOutcome = "success" | "partial" | "failure";

export interface SessionRecord {
  id: string;
  title: string;
  summary: string;
  startTs: string;
  endTs: string;
  durationMs: number;
  outcome: SessionOutcome;
  tags: string[];
  memoryIds: string[];
  skillIds: string[];
  factIds: string[];
  insights: string[];
}

export interface ArchiveInput {
  title: string;
  summary: string;
  startTs: string;
  endTs: string;
  outcome: SessionOutcome;
  tags?: string[];
  memoryIds?: string[];
  skillIds?: string[];
  factIds?: string[];
  insights?: string[];
}

export class SessionArchive {
  private records = new Map<string, SessionRecord>();
  private byTag = new Map<string, Set<string>>();

  size(): number {
    return this.records.size;
  }

  archive(input: ArchiveInput): SessionRecord {
    const id = `sess_${this.records.size + 1}`;
    const start = new Date(input.startTs).getTime();
    const end = new Date(input.endTs).getTime();
    const rec: SessionRecord = {
      id,
      title: input.title,
      summary: input.summary,
      startTs: input.startTs,
      endTs: input.endTs,
      durationMs: Math.max(0, end - start),
      outcome: input.outcome,
      tags: input.tags ?? [],
      memoryIds: input.memoryIds ?? [],
      skillIds: input.skillIds ?? [],
      factIds: input.factIds ?? [],
      insights: input.insights ?? [],
    };
    this.records.set(id, rec);
    for (const t of rec.tags) {
      let s = this.byTag.get(t);
      if (!s) {
        s = new Set();
        this.byTag.set(t, s);
      }
      s.add(id);
    }
    return rec;
  }

  get(id: string): SessionRecord | undefined {
    return this.records.get(id);
  }

  list(): SessionRecord[] {
    return [...this.records.values()];
  }

  /** Find sessions by tag. */
  byTagFn(tag: string): SessionRecord[] {
    const ids = this.byTag.get(tag);
    if (!ids) return [];
    return [...ids].map((id) => this.records.get(id)!).filter(Boolean);
  }

  /** Find sessions by outcome. */
  byOutcome(outcome: SessionOutcome): SessionRecord[] {
    return this.list().filter((r) => r.outcome === outcome);
  }

  /** Find sessions sharing any tag with the given session. */
  findSimilar(id: string): SessionRecord[] {
    const target = this.records.get(id);
    if (!target) return [];
    const tagSet = new Set(target.tags);
    return this.list().filter((r) => r.id !== id && r.tags.some((t) => tagSet.has(t)));
  }

  delete(id: string): boolean {
    const rec = this.records.get(id);
    if (!rec) return false;
    for (const t of rec.tags) {
      const s = this.byTag.get(t);
      if (s) {
        s.delete(id);
        if (s.size === 0) this.byTag.delete(t);
      }
    }
    return this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
    this.byTag.clear();
  }
}
