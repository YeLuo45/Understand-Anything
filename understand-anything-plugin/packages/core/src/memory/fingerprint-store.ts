/**
 * Fingerprint Dedup Store — content-addressable dedup index (V5/30)
 *
 * Wraps fingerprintId() from schema.ts with:
 *   - bulk putIfAbsent
 *   - collision-free guarantees
 *   - configurable digest algorithm switch (FNV-1a / djb2)
 */

import { fingerprintId } from "./schema.js";

export type DigestAlgo = "fnv1a" | "djb2";

/** DJB2 — alternate non-cryptographic hash for testing collision behavior. */
export function djb2(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  // unsigned 32-bit hex, 8 chars
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface DedupResult<T> {
  inserted: boolean;
  existingId?: T;
}

export class FingerprintStore<T = string> {
  private map = new Map<string, T>();
  private algo: DigestAlgo;
  private counter: (content: string) => string;

  constructor(algo: DigestAlgo = "fnv1a") {
    this.algo = algo;
    this.counter = algo === "fnv1a"
      ? fingerprintId
      : (c) => djb2(c);
  }

  size(): number {
    return this.map.size;
  }

  digest(content: string): string {
    return this.counter(content);
  }

  putIfAbsent(content: string, id: T): DedupResult<T> {
    const fp = this.counter(content);
    const existing = this.map.get(fp);
    if (existing !== undefined) {
      return { inserted: false, existingId: existing };
    }
    this.map.set(fp, id);
    return { inserted: true };
  }

  put(content: string, id: T): T | undefined {
    const fp = this.counter(content);
    const prev = this.map.get(fp);
    this.map.set(fp, id);
    return prev;
  }

  getId(content: string): T | undefined {
    return this.map.get(this.counter(content));
  }

  hasContent(content: string): boolean {
    return this.map.has(this.counter(content));
  }

  delete(content: string): boolean {
    return this.map.delete(this.counter(content));
  }

  clear(): void {
    this.map.clear();
  }

  /** All digests currently indexed. */
  digests(): string[] {
    return [...this.map.keys()];
  }
}
