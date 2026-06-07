/**
 * Migrator Tests (V27/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { Migrator, BUILTIN_MIGRATIONS } from "./migrate.js";
import { EXPORT_VERSION } from "./export-import.js";
import type { ExportData } from "./export-import.js";

const FIXED = "2026-06-07T00:00:00.000Z";

describe("Migrator — basic migration", () => {
  it("migrates from 0.8.0 to current using builtin", () => {
    const data: ExportData = { version: "0.8.0", exportedAt: FIXED, memories: [] };
    const m = new Migrator();
    m.register("0.8.0", BUILTIN_MIGRATIONS["0.8.0"]!);
    const r = m.migrate(data);
    expect(r.version).toBe(EXPORT_VERSION);
  });

  it("returns data unchanged if already current", () => {
    const data: ExportData = { version: EXPORT_VERSION, exportedAt: FIXED, memories: [] };
    const m = new Migrator();
    const r = m.migrate(data);
    expect(r.version).toBe(EXPORT_VERSION);
  });

  it("throws when no path exists", () => {
    const data: ExportData = { version: "0.0.1", exportedAt: FIXED, memories: [] };
    const m = new Migrator();
    expect(() => m.migrate(data)).toThrow();
  });

  it("throws for unknown version", () => {
    const data = { version: "unknown", exportedAt: FIXED, memories: [] } as unknown as ExportData;
    const m = new Migrator();
    expect(() => m.migrate(data)).toThrow();
  });
});

describe("Migrator — chaining", () => {
  it("chains multiple migrations", () => {
    const data: ExportData = { version: "0.7.0", exportedAt: FIXED, memories: [] };
    const m = new Migrator();
    m.register("0.7.0", (d) => ({ ...d, version: "0.8.0" }));
    m.register("0.8.0", (d) => ({ ...d, version: EXPORT_VERSION }));
    const r = m.migrate(data);
    expect(r.version).toBe(EXPORT_VERSION);
  });

  it("throws if chain has a gap", () => {
    const data: ExportData = { version: "0.7.0", exportedAt: FIXED, memories: [] };
    const m = new Migrator();
    m.register("0.7.0", (d) => ({ ...d, version: "0.8.0" }));
    // missing 0.8.0 → current migration
    expect(() => m.migrate(data)).toThrow();
  });
});

describe("Migrator — registration", () => {
  it("registers a migration", () => {
    const m = new Migrator();
    m.register("0.5.0", (d) => ({ ...d, version: EXPORT_VERSION }));
    expect(m.migrate({ version: "0.5.0", exportedAt: FIXED, memories: [] }).version).toBe(EXPORT_VERSION);
  });
});

describe("Migrator — path", () => {
  it("returns path starting with from version", () => {
    const m = new Migrator();
    expect(m.path("0.5.0")[0]).toBe("0.5.0");
  });

  it("supported returns versions array", () => {
    const m = new Migrator();
    expect(Array.isArray(m.supported())).toBe(true);
  });
});

describe("Migrator — builtin migrations", () => {
  it("0.8.0 → 0.9.0 migration exists", () => {
    expect(BUILTIN_MIGRATIONS["0.8.0"]).toBeDefined();
    const data: ExportData = { version: "0.8.0", exportedAt: FIXED, memories: [] };
    expect(BUILTIN_MIGRATIONS["0.8.0"]!(data).version).toBe("0.9.0");
  });
});
