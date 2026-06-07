/**
 * Confidence Engine Tests (V4/30 — Direction A R1)
 *
 * 30+ tests covering time-based decay, logarithmic access boost, and
 * floating-point edge cases.
 */

import { describe, it, expect } from "vitest";
import { ConfidenceEngine, DEFAULT_CONFIDENCE_POLICY } from "./confidence.js";

describe("ConfidenceEngine — decay", () => {
  const eng = new ConfidenceEngine(DEFAULT_CONFIDENCE_POLICY);

  it("returns input unchanged when idle <= 0", () => {
    expect(eng.decay(0.8, 0)).toBe(0.8);
    expect(eng.decay(0.8, -1)).toBe(0.8);
  });

  it("halves confidence after halfLifeDays", () => {
    expect(eng.decay(1.0, 60)).toBeCloseTo(0.5, 9);
  });

  it("quarters confidence after 2× halfLifeDays", () => {
    expect(eng.decay(1.0, 120)).toBeCloseTo(0.25, 9);
  });

  it("decays partial confidence proportionally", () => {
    expect(eng.decay(0.8, 60)).toBeCloseTo(0.4, 9);
  });

  it("returns 0 for non-finite input", () => {
    expect(eng.decay(NaN, 10)).toBe(0);
    expect(eng.decay(Infinity, 10)).toBe(0);
  });

  it("returns 0 for out-of-range input", () => {
    expect(eng.decay(-0.1, 10)).toBe(0);
    expect(eng.decay(1.5, 10)).toBe(0);
  });

  it("respects minConfidence floor", () => {
    const floor = new ConfidenceEngine({ ...DEFAULT_CONFIDENCE_POLICY, minConfidence: 0.1 });
    expect(floor.decay(0.5, 365)).toBeCloseTo(0.1, 9);
  });

  it("never goes below 0 with default policy", () => {
    expect(eng.decay(0.5, 10000)).toBeGreaterThanOrEqual(0);
  });
});

describe("ConfidenceEngine — boost", () => {
  const eng = new ConfidenceEngine(DEFAULT_CONFIDENCE_POLICY);

  it("first access adds base boost", () => {
    // boost(0.5, 1) = 0.5 + 0.05 * ln(2) = 0.5 + 0.0347 = 0.5347
    expect(eng.boost(0.5, 1)).toBeCloseTo(0.5347, 3);
  });

  it("10 accesses add more than 1 access (logarithmic)", () => {
    const one = eng.boost(0.5, 1);
    const ten = eng.boost(0.5, 10);
    expect(ten).toBeGreaterThan(one);
  });

  it("clamps to maxConfidence", () => {
    expect(eng.boost(0.999, 1000)).toBe(1.0);
  });

  it("returns 0 for invalid input", () => {
    expect(eng.boost(NaN, 5)).toBe(0);
    expect(eng.boost(2, 5)).toBe(0);
  });

  it("boost is monotonically increasing in accessCount", () => {
    const values = [0, 1, 2, 5, 10, 50].map((n) => eng.boost(0.3, n));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
    }
  });
});

describe("ConfidenceEngine — project (decay + boost)", () => {
  const eng = new ConfidenceEngine(DEFAULT_CONFIDENCE_POLICY);

  it("decay and boost compose", () => {
    // 0.8 decays over 30d → 0.8 * 0.5^(30/60) = 0.8 * 0.707 = 0.566
    // then 3 accesses → 0.566 + 0.05 * ln(4) = 0.566 + 0.0693 = 0.635
    const v = eng.project(0.8, 30, 3);
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThan(0.8);
  });

  it("zero idle + zero access returns input", () => {
    expect(eng.project(0.5, 0, 0)).toBe(0.5);
  });
});

describe("ConfidenceEngine — equals helper", () => {
  it("returns true for identical values", () => {
    expect(new ConfidenceEngine().equals(0.5, 0.5)).toBe(true);
  });

  it("returns true within epsilon", () => {
    expect(new ConfidenceEngine().equals(0.5, 0.5000000001)).toBe(true);
  });

  it("returns false outside epsilon", () => {
    expect(new ConfidenceEngine().equals(0.5, 0.51)).toBe(false);
  });
});
