import { describe, expect, it } from "vitest";
import { validateCompletion } from "../src/lib/services/productionFlow";
import { initialDirectory as d } from "../src/lib/domain/calendarAccess";
import { seedData } from "../src/lib/seed";
const line = { ...seedData.planLines[0], calendarId: "mfg-fermentation" };
const person = d.people.find((item) => item.id === "lim")!;
const input = { quantity: 1140, destinationId: "mfg-production", notes: "Ready" };
describe("production completion", () => {
  it("allows a transfer without exposing the destination calendar schedule", () => {
    expect(validateCompletion(line, input, person, d)).toEqual([]);
  });
  it("rejects repeated completion and wrong-role/wrong-unit edits", () => {
    expect(validateCompletion({ ...line, completedAt: "2026-09-12" }, input, person, d)).not.toEqual([]);
    expect(validateCompletion(line, input, { ...person, role: "planner" }, d)).not.toEqual([]);
    expect(validateCompletion(line, input, { ...person, unitIds: [] }, d)).not.toEqual([]);
  });
  it("rejects negative yield, same-process transfers and unstaffed destinations", () => {
    expect(validateCompletion(line, { ...input, quantity: -1 }, person, d)).not.toEqual([]);
    expect(validateCompletion(line, { ...input, destinationId: "mfg-fermentation" }, person, d)).not.toEqual([]);
    expect(validateCompletion(line, { ...input, destinationId: "pilot-extraction" }, person, d)).not.toEqual([]);
  });
  it("accepts zero final output, but never transfers zero WIP", () => {
    expect(validateCompletion(line, { ...input, quantity: 0, destinationId: "" }, person, d)).toEqual([]);
    expect(validateCompletion(line, { ...input, quantity: 0 }, person, d)).not.toEqual([]);
  });
});
