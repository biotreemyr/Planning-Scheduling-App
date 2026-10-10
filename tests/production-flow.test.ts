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
  it("checks the completed date against the start date, and allows holding output in the WIP room", () => {
    const started = { ...line, startedAt: "2026-10-12" };
    expect(validateCompletion(started, { ...input, completedDate: "2026-10-13", wipRoom: true }, person, d)).toEqual([]);
    expect(validateCompletion(started, { ...input, completedDate: "2026-10-11" }, person, d)).toEqual(["The completed date cannot be before the start date."]);
    expect(validateCompletion(started, { ...input, completedDate: "13/10/2026" }, person, d)).toEqual(["Choose the date production completed."]);
  });
});

describe("correcting a completed production update", async () => {
  const { validateCorrection } = await import("../src/lib/services/productionFlow");
  const done = { ...line, startedAt: "2026-09-10", completedAt: "2026-09-12T09:00:00.000Z", yieldQuantity: 1140, uom: "kg" };
  const fix = { ...input, quantity: 1100, uom: "kg", completedDate: "2026-09-11", startedAt: "2026-09-10" };
  const handover = { id: "wip", sourceLineId: done.id, sourceCalendarId: done.calendarId, calendarId: "mfg-production", productId: done.productId, quantity: 1140, uom: "kg", notes: "", createdAt: "2026-09-12T09:00:00.000Z", createdBy: "Lim" };
  it("lets production fix the quantity, dates and destination while the handover is not received", () => {
    expect(validateCorrection(done, fix, handover, person, d)).toEqual([]);
    expect(validateCorrection(done, { ...fix, destinationId: "" }, handover, person, d)).toEqual([]);
    expect(validateCorrection({ ...done, completedAt: undefined }, fix, handover, person, d)).toEqual(["This activity is not complete yet."]);
    expect(validateCorrection(done, { ...fix, completedDate: "2026-09-09" }, handover, person, d)).toContain("The completed date cannot be before the start date.");
    expect(validateCorrection(done, fix, handover, { ...person, role: "planner" }, d)).not.toEqual([]);
  });
  it("keeps quantity and destination once the next process has received the output", () => {
    const received = { ...handover, receivedAt: "2026-09-13T08:00:00.000Z", receivedBy: "Mei" };
    expect(validateCorrection(done, fix, received, person, d)[0]).toContain("Mei has already received this output");
    expect(validateCorrection(done, { ...fix, quantity: 1140, destinationId: "mfg-production" }, received, person, d)).toEqual([]);
  });
});
