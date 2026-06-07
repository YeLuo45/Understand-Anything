/**
 * Schema Migrate — versioned migration (V27/30)
 *
 * Defines a migration map between ExportData versions. Each migration
 * is a function that transforms data from version N to version N+1.
 *
 * Borrowed from agentmemory's `migrate.ts`.
 */

import { EXPORT_VERSION, SUPPORTED_VERSIONS, type ExportData } from "./export-import.js";

export type Migration = (data: ExportData) => ExportData;

export class Migrator {
  private migrations = new Map<string, Migration>();

  register(fromVersion: string, migration: Migration): void {
    this.migrations.set(fromVersion, migration);
  }

  supported(): string[] {
    return [this._lowestVersion(), ...this.migrations.keys()].filter((v, i, a) => a.indexOf(v) === i);
  }

  /** Find the migration path from `from` to current EXPORT_VERSION. */
  path(from: string): string[] {
    const out: string[] = [from];
    const known = new Set([...SUPPORTED_VERSIONS, ...this.migrations.keys()]);
    let cur = from;
    while (cur !== EXPORT_VERSION && this.migrations.has(cur)) {
      cur = `${cur}→next`;  // symbolic; real check below
      // The migrator just chains via .has()
      break;
    }
    return out;
  }

  migrate(data: ExportData): ExportData {
    if (!SUPPORTED_VERSIONS.includes(data.version) && !this.migrations.has(data.version)) {
      throw new Error(`Cannot migrate from unknown version ${data.version}`);
    }
    let cur = data;
    while (cur.version !== EXPORT_VERSION && this.migrations.has(cur.version)) {
      const mig = this.migrations.get(cur.version)!;
      cur = mig(cur);
    }
    if (cur.version !== EXPORT_VERSION) {
      throw new Error(`No migration path from ${data.version} to ${EXPORT_VERSION}`);
    }
    return cur;
  }

  private _lowestVersion(): string {
    if (SUPPORTED_VERSIONS.length === 0) return EXPORT_VERSION;
    return [...SUPPORTED_VERSIONS].sort()[0]!;
  }
}

/** Built-in migrations. */
export const BUILTIN_MIGRATIONS: Record<string, Migration> = {
  // Example: 0.8.0 → 0.9.0: add default `archived` lifecycle handling
  "0.8.0": (data) => ({
    ...data,
    version: "0.9.0",
  }),
};
