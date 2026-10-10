import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData, removeSampleData } from "../src/lib/domain/sampleData";
import { mergeSampleUnit } from "../src/lib/domain/unitMerge";
import { checkTally } from "../src/lib/services/jobOrders";

// A real BTP unit with nothing set up, beside the sample manufacturing unit that holds the work.
function workspace() {
  const base = newWorkspace();
  base.directory.units.push({ id: "btp", name: "BTP - Production" });
  const state = addSampleData(parseWorkspace(base), new Date(2026, 9, 7, 10)).state!;
  // One real order planned in the sample unit, as on the live pilot.
  const line = state.data.lines.find((item) => item.jobOrderId && !item.completedAt)!;
  state.data.lines.push({ ...line, id: "line-real" });
  // An older order with no unit and no job orders, and a sample job order without pack figures.
  state.data.orders = state.data.orders.map((order, index) => index === 0 ? (({ unitId: _, ...rest }) => rest)(order) : order);
  const job = state.data.jobOrders[0];
  delete job.packQuantity; delete job.packUom; delete job.packSize; delete job.boxQuantity;
  return parseWorkspace(state);
}

describe("merging the sample unit into BTP", () => {
  it("moves processes, machines, activities and access into BTP and drops the sample unit", () => {
    const before = workspace();
    const merged = mergeSampleUnit(before, "sample-unit-mfg", "btp");
    expect(merged.directory.units.map((unit) => unit.name)).not.toContain("Manufacturing (Sample)");
    expect(merged.directory.units.filter((unit) => unit.id === "btp")).toEqual([{ id: "btp", name: "BTP - Production" }]);
    const btp = merged.directory.calendars.filter((calendar) => calendar.unitId === "btp");
    expect(btp.map((calendar) => calendar.name)).toEqual(["Dispensing", "Compression", "Capsulation", "Coating", "Filling", "Packing"]);
    expect(btp.every((calendar) => !calendar.id.startsWith("sample-") && !calendar.processId.startsWith("sample-"))).toBe(true);
    expect(merged.machines.filter((machine) => machine.unitId === "btp")).toHaveLength(before.machines.filter((machine) => machine.unitId === "sample-unit-mfg").length);
    expect(merged.machines.every((machine) => !machine.id.startsWith("sample-") && !machine.workCentreId.startsWith("sample-"))).toBe(true);
    // Every activity, booking and result survives, now on BTP calendars.
    expect([merged.data.lines.length, merged.data.entries.length, merged.data.actuals.length]).toEqual([before.data.lines.length, before.data.entries.length, before.data.actuals.length]);
    expect(merged.data.lines.every((line) => btp.some((calendar) => calendar.id === line.calendarId))).toBe(true);
    expect(merged.data.orders.every((order) => order.unitId === "btp")).toBe(true);
    expect(merged.directory.people.find((person) => person.role === "admin")!.unitIds).toEqual(["btp"]);
    // Sample job orders now carry every process's figure, and their activities tally with them.
    expect(merged.data.jobOrders[0]).toMatchObject({ packUom: expect.any(String), boxQuantity: expect.any(Number) });
    expect(checkTally(merged.data.lines.filter((line) => line.id !== "line-real"), merged.data.jobOrders, merged.directory)).toEqual([]);
  });
  it("keeps BTP's set-up and real work when sample data is removed afterwards", () => {
    const merged = mergeSampleUnit(workspace(), "sample-unit-mfg", "btp");
    const { state } = removeSampleData(merged);
    expect(state.directory.calendars.filter((calendar) => calendar.unitId === "btp")).toHaveLength(6);
    expect(state.machines.filter((machine) => machine.unitId === "btp").length).toBeGreaterThan(0);
    expect(state.data.lines.map((line) => line.id)).toEqual(["line-real"]);
  });
  it("refuses to merge into a unit that already has processes", () => {
    const merged = mergeSampleUnit(workspace(), "sample-unit-mfg", "btp");
    expect(() => mergeSampleUnit(merged, "sample-unit-mfg", "btp")).toThrow();
  });
});
