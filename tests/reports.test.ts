import { describe, expect, it } from "vitest";
import { addSampleData } from "../src/lib/domain/sampleData";
import { newWorkspace } from "../src/lib/domain/workspace";
import type { Machine, PlanLine, ScheduleEntry } from "../src/lib/domain/types";
import type { PurchaseOrder } from "../src/lib/services/orders";
import type { WipTransfer } from "../src/lib/services/productionFlow";
import {
  batchReport, batchSummary, deliveryReport, deliveryStatus, deliverySummary, getUnscheduledPlanLines, lateActivities, machineLoad, planAdherence, unbookedActivities, waitingWip, weekStart
} from "../src/lib/services/reports";

const line: PlanLine = { id: "beta", calendarId: "cal", planId: "plan", productId: "product", quantity: 100000, plannedDate: "2026-09-13", priority: "Normal", status: "Partially Scheduled" };
const directory = { units: [{ id: "u", name: "BTP" }], processes: [{ id: "p", name: "Dispensing" }], calendars: [{ id: "cal", unitId: "u", processId: "p", name: "Dispensing" }], teams: [], people: [] };
const order = (extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({ id: "o", poNumber: "PO-1", productId: "product", quantity: 2000, uom: "boxes", expectedDates: {}, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner", ...extra });

it("excludes completed activities from the open-plan queue", () => {
  expect(getUnscheduledPlanLines([line, { ...line, id: "complete", completedAt: "2026-09-13T16:00:00Z" }])).toEqual([line]);
});

describe("Orders & Delivery status", () => {
  const today = "2026-10-17";
  it("is not planned, on track, at risk or overdue while open", () => {
    expect(deliveryStatus(order({ deliveryDate: "2026-11-30" }), undefined, today).status).toBe("Not planned");
    expect(deliveryStatus(order({ deliveryDate: "2026-11-30" }), "2026-11-20", today)).toEqual({ status: "On track", daysLate: -10 });
    expect(deliveryStatus(order({ deliveryDate: "2026-11-30" }), "2026-12-03", today)).toEqual({ status: "At risk", daysLate: 3 });
    // Overdue counts to the planned finish when that is still ahead, else to today.
    expect(deliveryStatus(order({ deliveryDate: "2026-10-10" }), "2026-10-20", today)).toEqual({ status: "Overdue", daysLate: 10 });
    expect(deliveryStatus(order({ deliveryDate: "2026-10-10" }), undefined, today)).toEqual({ status: "Overdue", daysLate: 7 });
  });
  it("compares a closed PO's closing day with its delivery date", () => {
    expect(deliveryStatus(order({ deliveryDate: "2026-10-10", closedAt: "2026-10-09T04:00:00Z" }), undefined, today).status).toBe("Closed on time");
    expect(deliveryStatus(order({ deliveryDate: "2026-10-10", closedAt: "2026-10-12T04:00:00Z" }), undefined, today)).toMatchObject({ status: "Closed late", daysLate: 2 });
    expect(deliveryStatus(order({ closedAt: "2026-10-12T04:00:00Z" }), undefined, today).status).toBe("Closed");
  });
  it("gives the planned finish, over/under and the on-time share", () => {
    const rows = deliveryReport([order({ deliveryDate: "2026-10-20" }), order({ id: "c", poNumber: "PO-2", deliveryDate: "2026-10-10", closedAt: "2026-10-09T04:00:00Z", closedQuantity: 2006, closedUom: "boxes" })],
      [], [{ ...line, productionOrderId: "o", plannedDate: "2026-10-18", endDate: "2026-10-22" }], directory, [], today);
    expect(rows[0]).toMatchObject({ plannedFinish: "2026-10-22", status: "At risk", daysLate: 2 });
    expect(rows[1]).toMatchObject({ status: "Closed on time", overUnder: 6 });
    expect(deliverySummary(rows)).toMatchObject({ open: 1, atRisk: 1, overdue: 0, onTimePercent: 100 });
  });
});

describe("Production Flow", () => {
  const today = "2026-10-17";
  it("lists open activities past their last planned day, most late first", () => {
    const late = lateActivities([
      { ...line, id: "a", plannedDate: "2026-10-14", endDate: "2026-10-15" },
      { ...line, id: "b", plannedDate: "2026-10-01", startedAt: "2026-10-01" },
      { ...line, id: "done", plannedDate: "2026-10-01", completedAt: "2026-10-01T10:00:00Z" },
      { ...line, id: "today", plannedDate: today }
    ], directory, today);
    expect(late.map((item) => [item.line.id, item.daysLate, item.started])).toEqual([["b", 16, true], ["a", 2, false]]);
    expect(late[0].processName).toBe("Dispensing");
  });
  it("lists open activities not yet late that have no machine booked", () => {
    expect(unbookedActivities([{ ...line, id: "x", plannedDate: "2026-10-20", status: "Unscheduled" }, { ...line, id: "y", plannedDate: "2026-10-20", status: "Fully Scheduled" }, { ...line, id: "z", plannedDate: "2026-10-01", status: "Unscheduled" }], today).map((item) => item.id)).toEqual(["x"]);
  });
  it("counts plan adherence by the production date when keyed in", () => {
    const lines = [
      { ...line, id: "on", plannedDate: "2026-10-05", completedAt: "2026-10-09T10:00:00Z" },
      { ...line, id: "late", plannedDate: "2026-10-05", completedAt: "2026-10-07T10:00:00Z" },
      { ...line, id: "other-month", plannedDate: "2026-09-05", completedAt: "2026-09-05T10:00:00Z" },
      { ...line, id: "open", plannedDate: "2026-10-05" }
    ];
    // "on" was keyed in late but production says it was done on the day.
    const result = planAdherence(lines, [{ planLineId: "on", productionDate: "2026-10-05" }], directory, "2026-10-01", "2026-10-31");
    expect(result).toMatchObject({ completed: 2, onTime: 1, late: 1, percent: 50 });
    expect(result.byProcess).toEqual([{ calendarId: "cal", processName: "Dispensing", completed: 2, onTime: 1, late: 1, percent: 50 }]);
  });
  it("lists WIP not yet received, longest waiting first", () => {
    const transfer: WipTransfer = { id: "t1", sourceLineId: "s", sourceCalendarId: "cal", calendarId: "cal", productId: "product", quantity: 40, uom: "kg", notes: "", createdAt: "2026-10-15T12:00:00", createdBy: "Kumar" };
    const wip = waitingWip([transfer, { ...transfer, id: "t2", createdAt: "2026-10-10T12:00:00" }, { ...transfer, id: "t3", receivedAt: "2026-10-16T12:00:00" }], directory, today);
    expect(wip.map((item) => [item.transfer.id, item.daysWaiting])).toEqual([["t2", 7], ["t1", 2]]);
  });
  it("adds booked hours per machine per week from this week's Monday", () => {
    expect(weekStart("2026-10-17")).toBe("2026-10-12");
    const machine = { id: "m", code: "CFM/02", name: "Capsule filler", workCentreId: "w", active: "Active" } as Machine;
    const entry = (id: string, startAt: string, endAt: string, status: ScheduleEntry["status"] = "Confirmed"): ScheduleEntry => ({ id, machineId: "m", productId: "product", workCentreId: "w", startAt, endAt, status });
    const load = machineLoad([
      entry("a", "2026-10-13T08:00:00", "2026-10-13T17:00:00"),
      entry("b", "2026-10-14T08:00:00", "2026-10-14T12:00:00"),
      entry("c", "2026-10-20T08:00:00", "2026-10-21T17:00:00"),
      entry("x", "2026-10-15T08:00:00", "2026-10-15T17:00:00", "Cancelled")
    ], [machine], "2026-10-17", 2);
    expect(load.weeks).toEqual(["2026-10-12", "2026-10-19"]);
    expect(load.rows[0].weeks).toEqual([{ hours: 13, days: 2 }, { hours: 33, days: 2 }]);
    expect(load.rows[0].total).toBe(46);
  });
});

describe("Batch Yield & Release", () => {
  const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
  const { jobOrders, orders, lines, transfers, actuals } = state.data;
  const rows = batchReport(jobOrders, orders, lines, transfers, actuals, state.directory, state.products, { byProcess: {}, final: { min: 98 } }, "2026-10-17");
  it("has one row per batch and PO, with its stages and status", () => {
    expect(rows.length).toBe(jobOrders.reduce((sum, job) => sum + 1 + (job.shares?.length ?? 0), 0));
    expect(rows.every((row) => row.order && row.status)).toBe(true);
  });
  it("counts days finished to released, or waiting while in QC or QA", () => {
    for (const row of rows) {
      if (row.releasedOn && row.finishedOn) expect(row.daysToRelease).toBeGreaterThanOrEqual(0);
      if (row.daysWaiting !== undefined) expect(["Awaiting testing", "Under investigation", "Failed testing", "Awaiting release"]).toContain(row.status);
    }
    expect(batchSummary(rows).quarantine).toBe(rows.filter((row) => row.daysWaiting !== undefined || (["Awaiting testing", "Under investigation", "Failed testing", "Awaiting release"].includes(row.status) && !row.finishedOn)).length);
  });
  it("flags a final yield below QA's limit", () => {
    const low = rows.filter((row) => row.final?.percent !== undefined && row.final.percent < 98);
    expect(low.every((row) => row.outOfLimits)).toBe(true);
  });
});

describe("report Excel", () => {
  it("numbers the rows, keeps dates and numbers real, and says what it covers", async () => {
    const { reportWorkbook } = await import("../src/lib/services/reportsExcel");
    const book = await reportWorkbook([{ header: "PO", width: 12 }, { header: "Delivery", width: 12, kind: "date" }, { header: "Qty", width: 10, kind: "number" }],
      [["PO-1", "2026-10-20", 2000], ["PO-2", undefined, 5]], { title: "Orders & Delivery", caption: "BTP · Open", sheet: "Orders & Delivery", at: "17/10/2026 09:00" });
    const sheet = book.worksheets[0];
    expect(sheet.getCell("A1").value).toBe("Orders & Delivery");
    expect(String(sheet.getCell("A2").value)).toBe("BTP · Open · 2 rows · downloaded 17/10/2026 09:00");
    expect(sheet.getRow(4).values).toEqual([undefined, "No.", "PO", "Delivery", "Qty"]);
    expect(sheet.getCell("A5").value).toBe(1);
    expect(sheet.getCell("C5").value).toEqual(new Date("2026-10-20T00:00:00Z"));
    expect(sheet.getCell("C5").numFmt).toBe("dd/mm/yyyy");
    expect(sheet.getCell("D5").value).toBe(2000);
    expect(sheet.getCell("C6").value).toBe("");
  });
});
