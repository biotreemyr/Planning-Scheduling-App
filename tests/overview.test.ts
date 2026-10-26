import { describe, expect, it } from "vitest";
import { emptyDirectory } from "../src/lib/domain/emptyWorkspace";
import type { CalendarDirectory } from "../src/lib/domain/calendarAccess";
import type { Machine, PlanLine, ScheduleEntry } from "../src/lib/domain/types";
import type { JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";
import { periodChoices, periodFor, periodSlots, periodValue, productionOverview, type OverviewInput } from "../src/lib/services/overview";
import { workingCalendar } from "../src/lib/services/workingDays";

// A capsule batch through five processes of unit BTP, as in the yield tests.
const settings = (planned: "batchSize" | "batchQuantity" | "packQuantity" | "boxes") => ({ forms: ["Capsule" as const], optional: false, planned, report: "count" as const });
const steps = [["dispensing", "Dispensing", "batchSize"], ["blending", "Blending", "batchSize"], ["capsulation", "Capsulation", "batchQuantity"], ["filling", "Filling", "packQuantity"], ["packing", "Packing", "boxes"]] as const;
const directory: CalendarDirectory = { ...emptyDirectory(), units: [{ id: "u", name: "BTP" }],
  processes: steps.map(([id, name, planned]) => ({ id: `p-${id}`, name, settings: settings(planned) })),
  calendars: steps.map(([id, name]) => ({ id: `c-${id}`, unitId: "u", processId: `p-${id}`, name })) };
const order: PurchaseOrder = { id: "po", poNumber: "PWL005114", productId: "fg", quantity: 2000, uom: "boxes", unitWeightMg: 720, unitsPerPack: 180, format: "Capsule", deliveryDate: "2026-10-25", expectedDates: {}, createdAt: "2026-10-01T00:00:00.000Z", createdBy: "Planner" };
const job: JobOrder = { id: "jo", number: "JO-00002", orderId: "po", sequence: 1, quantity: 60417, uom: "capsules", batchSizeKg: 43.5, packQuantity: 6041, packUom: "blisters", packSize: 10, boxQuantity: 335, createdAt: "2026-10-01T00:00:00.000Z", createdBy: "Planner" };
const line = (id: string, date: string, quantity: number, uom: string, actual?: number): PlanLine => ({ id, planId: "plan", calendarId: `c-${id}`, productId: "fg", quantity, uom, plannedDate: date, priority: "Normal", status: "Fully Scheduled",
  jobOrderId: "jo", productionOrderId: "po", ...(actual === undefined ? {} : { completedAt: `${date}T09:00:00.000Z`, yieldQuantity: actual }) });
const lines = [line("dispensing", "2026-10-05", 43.5, "kg", 43.3), line("blending", "2026-10-06", 43.5, "kg", 43.0), line("capsulation", "2026-10-07", 60417, "capsules", 59200),
  line("filling", "2026-10-20", 6041, "blisters"), line("packing", "2026-11-03", 335, "boxes")];
const machine = (id: string, name: string): Machine => ({ id, code: id, name, workCentreId: "wc", unitId: "u", processIds: ["p-capsulation"], active: "Active" });
const entry = (id: string, machineId: string, start: string, end: string): ScheduleEntry => ({ id, machineId, productId: "fg", workCentreId: "wc", startAt: `${start}T08:00`, endAt: `${end}T17:00`, status: "Confirmed" });

const input = (overrides: Partial<OverviewInput> = {}): OverviewInput => ({
  lines, allLines: lines, entries: [entry("e1", "m1", "2026-10-07", "2026-10-09"), entry("e2", "m1", "2026-10-10", "2026-10-11")], orders: [order], jobs: [job], transfers: ["dispensing", "blending", "capsulation"].map((sourceLineId) => ({ sourceLineId })),
  calendars: directory.calendars, machines: [machine("m1", "Capsule filler 1"), machine("m2", "Capsule filler 2")], directory,
  workDays: workingCalendar({ id: "u" }, [{ id: "s", unitId: "u", date: "2026-10-10", kind: "working", reason: "Overtime", addedBy: "Planner", addedAt: "2026-10-01" }], [{ date: "2026-10-20", name: "Deepavali" }]),
  yieldLimits: { byProcess: { "p-capsulation": { min: 98.5, max: 101 } } }, period: periodFor("month", "2026-10"), today: "2026-10-27", ...overrides
});

describe("periods", () => {
  it("covers a whole month, quarter or year", () => {
    expect(periodFor("month", "2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", label: "Feb 2026" });
    expect(periodFor("quarter", "2026-Q4")).toMatchObject({ from: "2026-10-01", to: "2026-12-31", label: "Q4 2026" });
    expect(periodFor("year", "2026")).toMatchObject({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
    expect([periodValue("month", "2026-10-27"), periodValue("quarter", "2026-10-27"), periodValue("year", "2026-10-27")]).toEqual(["2026-10", "2026-Q4", "2026"]);
  });

  it("offers the periods from the first planned day to the last, newest first", () => {
    expect(periodChoices("month", "2026-10-27", ["2026-08-30", "2026-11-03"]).map((item) => item.value)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08"]);
    expect(periodChoices("quarter", "2026-10-27", ["2026-08-30"]).map((item) => item.label)).toEqual(["Q4 2026", "Q3 2026"]);
  });

  it("splits a month into weeks from Monday and a quarter into months", () => {
    expect(periodSlots(periodFor("month", "2026-10")).map((slot) => [slot.from, slot.to])).toEqual([
      ["2026-10-01", "2026-10-04"], ["2026-10-05", "2026-10-11"], ["2026-10-12", "2026-10-18"], ["2026-10-19", "2026-10-25"], ["2026-10-26", "2026-10-31"]]);
    expect(periodSlots(periodFor("quarter", "2026-Q4")).map((slot) => slot.label)).toEqual(["Oct", "Nov", "Dec"]);
  });
});

describe("production overview", () => {
  it("counts the period's activities planned and completed, by week and by process", () => {
    const f = productionOverview(input());
    expect(f.activities).toEqual({ planned: 4, completed: 3 });
    expect(f.bySlot.map((slot) => [slot.planned, slot.completed])).toEqual([[0, 0], [3, 3], [0, 0], [1, 0], [0, 0]]);
    expect(f.byProcess.map((row) => [row.processName, row.planned, row.completed])).toEqual([["Dispensing", 1, 1], ["Blending", 1, 1], ["Capsulation", 1, 1], ["Filling", 1, 0], ["Packing", 0, 0]]);
  });

  it("lists activities still open after their last planned day as late, newest first", () => {
    const f = productionOverview(input({ today: "2026-11-05" }));
    expect(f.late.map((item) => [item.line.id, item.daysLate, item.jobNumber])).toEqual([["packing", 2, "JO-00002"], ["filling", 16, "JO-00002"]]);
    expect(productionOverview(input()).late.map((item) => item.line.id)).toEqual(["filling"]);
  });

  it("gives each process's yield against QA's limit for stages finished in the period", () => {
    const f = productionOverview(input());
    const capsulation = f.yieldByProcess.find((row) => row.processName === "Capsulation")!;
    // 59,200 ÷ 60,417 capsules = 98.0%, under QA's 98.5% minimum.
    expect(capsulation).toMatchObject({ stages: 1, average: 98, lowest: 98, highest: 98, limit: { min: 98.5, max: 101 }, out: 1 });
    expect(f.yieldTones).toMatchObject({ out: 1, none: 2 });
    expect(productionOverview(input({ period: periodFor("month", "2026-09") })).yieldTones).toEqual({ ok: 0, near: 0, out: 0, none: 0 });
  });

  it("works out machine use as working days booked out of the period's working days", () => {
    const f = productionOverview(input());
    // October 2026: 22 weekdays, less Deepavali, plus Saturday 10/10 opened for overtime = 22.
    expect(f.offDays).toEqual({ working: 22, overtime: 1, closed: 0, holidays: 1, weeklyOff: 8 });
    // Booked 7–9 and 10–11/10: Sunday 11/10 is off, so 4 days of 22.
    expect(f.machineUse).toEqual([
      { machineId: "m1", name: "Capsule filler 1", daysBooked: 4, workingDays: 22, percent: 18 },
      { machineId: "m2", name: "Capsule filler 2", daysBooked: 0, workingDays: 22, percent: 0 }]);
  });

  it("counts POs due in the period by status, overdue POs and open batches", () => {
    const f = productionOverview(input());
    expect(f.ordersDue).toEqual({ Completed: 0, "In production": 1, Scheduled: 0, "Not scheduled": 0 });
    expect(f.ordersOverdue).toBe(1);
    expect(f.batches["In production"]).toBe(1);
    expect(f.released).toBe(0);
    const released = productionOverview(input({ jobs: [{ ...job, testResult: "Passed", releasedAt: "2026-10-26T03:00:00.000Z" }] }));
    expect([released.released, released.batches["In production"]]).toEqual([1, 0]);
  });
});
