import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData, hasSampleData, isSample, removeSampleData } from "../src/lib/domain/sampleData";
import { accessibleCalendars } from "../src/lib/domain/calendarAccess";
import { findMachineConflicts } from "../src/lib/services/conflicts";

const today = new Date(2026, 9, 7, 10); // Wednesday
const loaded = () => addSampleData(newWorkspace(), today).state!;

describe("sample data", () => {
  it("loads a valid workspace with plans around today", () => {
    const state = loaded();
    expect(parseWorkspace(state)).toEqual(state);
    expect(hasSampleData(state)).toBe(true);
    const dates = state.data.lines.map((line) => line.plannedDate).sort();
    expect(dates[0] < "2026-10-07" && dates.at(-1)! > "2026-10-07").toBe(true);
    expect(state.data.lines.some((line) => line.completedAt)).toBe(true);
    expect(state.data.entries.some((entry) => entry.status === "In Progress")).toBe(true);
    expect(state.data.transfers).toHaveLength(2);
    expect(findMachineConflicts(state.data.entries, state.machines as never, state.products)).toHaveLength(1);
  });
  it("gives the administrator and sample staff access to the sample calendars", () => {
    const state = loaded();
    const admin = state.directory.people.find((person) => person.role === "admin")!;
    expect(accessibleCalendars(admin, state.directory)).toHaveLength(state.directory.calendars.length);
    for (const person of state.directory.people.filter((item) => item.role !== "admin")) expect(accessibleCalendars(person, state.directory).length).toBeGreaterThan(0);
  });
  it("refuses to load twice", () => {
    expect(addSampleData(loaded(), today).errors).toHaveLength(1);
  });
  it("removes everything sample and restores the original workspace", () => {
    const empty = newWorkspace();
    const result = removeSampleData(addSampleData(empty, today).state!);
    expect(result.state).toEqual(empty);
    expect(result.kept).toEqual([]);
  });
  it("keeps real records and any sample master data they use", () => {
    const state = loaded();
    state.directory.units.push({ id: "real-unit", name: "Real Unit" });
    const process = state.directory.processes.find((item) => item.name === "Packing")!;
    state.directory.calendars.push({ id: "real-cal", unitId: "real-unit", processId: process.id, name: "Packing" });
    state.products.push({ id: "real-product", sku: "REAL-1", name: "Real Product", uom: "boxes", productType: "Finished Good", active: "Active" });
    state.data.lines.push({ id: "real-line", calendarId: "real-cal", planId: "production-plan", productId: "sample-product-vitc", quantity: 10, plannedDate: "2026-10-08", priority: "Normal", status: "Unscheduled" });
    // A real plan placed in a sample unit goes with that unit.
    state.data.lines.push({ id: "line-in-sample-unit", calendarId: state.directory.calendars[0].id, planId: "production-plan", productId: "real-product", quantity: 5, plannedDate: "2026-10-08", priority: "Normal", status: "Unscheduled" });
    const { state: after, kept } = removeSampleData(parseWorkspace(state));
    expect(after.data.lines.map((line) => line.id)).toEqual(["real-line"]);
    expect(after.products.map((item) => item.id).sort()).toEqual(["real-product", "sample-product-vitc"]);
    expect(after.directory.processes.map((item) => item.id)).toEqual([process.id]);
    expect(kept).toEqual(["Packing", "Vitamin C Plus (28 tabs x 1000mg)"]);
    expect(after.directory.people.every((person) => person.unitIds.every((id) => !isSample(id)))).toBe(true);
  });
});
