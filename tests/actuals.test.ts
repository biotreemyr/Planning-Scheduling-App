import { describe, expect, it } from "vitest";
import { productionPerformance, validateActual } from "../src/lib/services/actuals";

describe("actual production", () => {
  it("calculates under and over production without capping the ratio", () => {
    expect(productionPerformance(100000, 95000)).toEqual({ ratio: 95, variance: -5000 });
    expect(productionPerformance(100, 120)).toEqual({ ratio: 120, variance: 20 });
  });
  it("distinguishes unreported from a reported zero", () => {
    expect(productionPerformance(100)).toEqual({ ratio: null, variance: null });
    expect(productionPerformance(100, 0)).toEqual({ ratio: 0, variance: -100 });
  });
  it("handles invalid denominator and quantities", () => {
    for (const planned of [0, -1, Infinity, NaN]) expect(productionPerformance(planned, 10).ratio).toBeNull();
    for (const actual of [-1, Infinity, NaN]) expect(productionPerformance(100, actual).ratio).toBeNull();
  });
  it("validates dates, quantities and deviation details", () => {
    const valid = { actualQuantity: 0, productionDate: "2026-09-12", hasDeviation: false, deviation: "" };
    expect(validateActual(valid)).toEqual([]);
    expect(validateActual({ ...valid, hasDeviation: true })).toHaveLength(1);
    expect(validateActual({ ...valid, productionDate: "2026-02-30" })).toHaveLength(1);
    expect(validateActual({ ...valid, actualQuantity: NaN })).toHaveLength(1);
    expect(validateActual({ ...valid, hasDeviation: true, deviation: "Machine downtime" })).toEqual([]);
  });
});
