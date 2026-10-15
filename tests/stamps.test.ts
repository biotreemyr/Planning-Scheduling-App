import { describe, expect, it } from "vitest";
import { stampChanges } from "../src/lib/services/stamps";
import type { PlanLine, ScheduleEntry } from "../src/lib/domain/types";
import type { JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";

const at = "2026-10-11T08:00:00.000Z";
const line: PlanLine = { id: "l1", planId: "p", productId: "x", quantity: 41.5, uom: "kg", plannedDate: "2026-10-12", priority: "Normal", status: "Unscheduled", calendarId: "c" };
const entry: ScheduleEntry = { id: "e1", calendarId: "c", planLineId: "l1", productId: "x", workCentreId: "w", machineId: "m1", startAt: "2026-10-12T08:00", endAt: "2026-10-12T16:00", status: "Draft" };
const order: PurchaseOrder = { id: "o1", poNumber: "PO-1", productId: "x", quantity: 2000, uom: "boxes", expectedDates: {}, createdAt: at, createdBy: "Planner A" };
const job: JobOrder = { id: "j1", number: "JO1", orderId: "o1", sequence: 1, quantity: 125000, uom: "tablets", createdAt: at, createdBy: "Planner A" };
const data = { lines: [line], entries: [entry], orders: [order], jobOrders: [job], actuals: [] as unknown[] };

describe("who changed what", () => {
  it("records the planner on a new or replanned activity, and production on an update", () => {
    const added = stampChanges({ ...data, lines: [] }, data, "Planner B", at);
    expect(added.lines[0]).toMatchObject({ plannedBy: "Planner B", plannedAt: at });
    const moved = stampChanges(data, { ...data, lines: [{ ...line, plannedDate: "2026-10-13" }] }, "Planner C", at);
    expect(moved.lines[0]).toMatchObject({ plannedBy: "Planner C" });
    expect(moved.lines[0].updatedBy).toBeUndefined();
    const produced = stampChanges(data, { ...data, lines: [{ ...line, startedAt: "2026-10-12", productionNotes: "Started" }] }, "Operator D", at);
    expect(produced.lines[0]).toMatchObject({ updatedBy: "Operator D", updatedAt: at });
    expect(produced.lines[0].plannedBy).toBeUndefined();
  });
  it("counts a machine change by planning as planning, and keeps the planned machine when production ran on another", () => {
    const rebooked = stampChanges(data, { ...data, entries: [{ ...entry, machineId: "m2" }] }, "Planner B", at);
    expect(rebooked.lines[0]).toMatchObject({ plannedBy: "Planner B" });
    const ranElsewhere = stampChanges(data, { ...data, lines: [{ ...line, completedAt: at, yieldQuantity: 41 }], entries: [{ ...entry, machineId: "m2", status: "Completed" }] }, "Operator D", at);
    expect(ranElsewhere.lines[0]).toMatchObject({ updatedBy: "Operator D", plannedMachineIds: ["m1"] });
    expect(ranElsewhere.lines[0].plannedBy).toBeUndefined();
  });
  it("records who edited an order or a job order, but not for steps that keep their own name", () => {
    const edited = stampChanges(data, { ...data, orders: [{ ...order, quantity: 3000 }], jobOrders: [{ ...job, packSize: 10 }] }, "Planner B", at);
    expect(edited.orders[0]).toMatchObject({ createdBy: "Planner A", updatedBy: "Planner B" });
    expect(edited.jobOrders[0]).toMatchObject({ updatedBy: "Planner B" });
    const tested = stampChanges(data, { ...data, jobOrders: [{ ...job, testedAt: at, testedBy: "QC E", testResult: "Passed" }] }, "QC E", at);
    expect(tested.jobOrders[0].updatedBy).toBeUndefined();
  });
  it("leaves unchanged data exactly as it was", () => {
    const same = { ...data };
    expect(stampChanges(data, same, "Anyone", at)).toBe(same);
    expect(stampChanges(data, { ...data, actuals: [1] }, "Anyone", at).lines).toBe(data.lines);
  });
});
