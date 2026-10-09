import { describe, expect, it } from "vitest";
import { batchKilograms, readMeasurement } from "@/lib/services/measurements";
describe("batch equivalents", () => {
  it("converts 100,000 tablets at 332mg to 33.2kg", () => {
    expect(batchKilograms(100000, "tablets", 332)).toBe(33.2);
  });
  it("uses mass units directly and never assumes package weights", () => {
    expect(batchKilograms(33200, "g", 999)).toBe(33.2);
    expect(batchKilograms(33200000, "mg")).toBe(33.2);
    expect(batchKilograms(33.2, "kg")).toBe(33.2);
    expect(batchKilograms(100, "boxes")).toBeUndefined();
    expect(batchKilograms(100, "bottles", 500000)).toBe(50);
  });
  it("rejects invalid quantities and weights", () => {
    for (const quantity of [0, -1, NaN, Infinity]) expect(batchKilograms(quantity, "tablets", 332)).toBeUndefined();
    for (const weight of [0, -1, NaN, Infinity]) expect(batchKilograms(100, "tablets", weight)).toBeUndefined();
  });
  it("captures the unit, activity and conversion on the record", () => {
    const data = new FormData();
    Object.entries({ uom: "tablets", activityType: "Tableting", quantity: "100000", unitWeightMg: "332" }).forEach(([key, value]) => data.set(key, value));
    expect(readMeasurement(data)).toEqual({ uom: "tablets", activityType: "Tableting", unitWeightMg: 332, batchSizeKg: 33.2 });
  });
});

describe("tablets and capsules reported by weight", async () => {
  const { countFromWeight, isWeight } = await import("../src/lib/services/measurements");
  const { actualUoms } = await import("../src/lib/services/processRules");
  it("converts weighed output to a count with the weight of one unit", () => {
    expect(countFromWeight(23.975, "kg", 350)).toBe(68500);
    expect(countFromWeight(450, "g", 450)).toBe(1000);
    expect(countFromWeight(1, "kg", 0)).toBeUndefined();
    expect(countFromWeight(1, "L", 350)).toBeUndefined();
    expect(isWeight("g") && !isWeight("tablets")).toBe(true);
  });
  it("lets compression, coating and capsulation report in kg or g", () => {
    expect(actualUoms("Compression")).toEqual(["tablets", "kg", "g"]);
    expect(actualUoms("Coating")).toEqual(["tablets", "kg", "g"]);
    expect(actualUoms("Capsulation")).toEqual(["capsules", "kg", "g"]);
  });
});
