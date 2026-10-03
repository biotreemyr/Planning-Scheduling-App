import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { moveActivity } from "../src/lib/services/planChanges";
import { batchRoute, orderBatchMatrix, orderProcessRows, orderProgress } from "../src/lib/services/orders";
import { listPrintCells } from "../src/lib/services/calendarPrint";
import { checkProcessFlow } from "../src/lib/services/processRules";
import { getScheduleReport } from "../src/lib/services/reports";
import { findMachineConflicts } from "../src/lib/services/conflicts";

// Beta test: every screen reads the same lines and bookings, so one date change must show everywhere.
const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const order = state.data.orders.find((item) => item.poNumber === "PO-2610-131")!;
const target = state.data.lines.find((line) => line.productionOrderId === order.id && line.orderReference === "Batch 8" && line.activityType === "Dispensing")!;
const booked = () => state.data.entries.filter((entry) => entry.planLineId === target.id);
const dayOf = (value: string) => value.slice(0, 10);

describe("one date change reaches every view", () => {
  const before = target.plannedDate;
  const after = "2026-10-12";
  const moved = moveActivity(state.data.lines, state.data.entries, target.id, after, "Tester");
  if ("error" in moved) throw new Error(moved.error);
  const lines = moved.lines, entries = moved.entries;
  const line = lines.find((item) => item.id === target.id)!;

  it("moves the activity and its open machine bookings together", () => {
    expect(before).not.toBe(after);
    expect(line.plannedDate).toBe(after);
    expect(booked().length).toBeGreaterThan(0);
    for (const entry of entries.filter((item) => item.planLineId === target.id)) expect(dayOf(entry.startAt)).toBe(after);
    expect(moved.movedEntryIds.sort()).toEqual(booked().map((entry) => entry.id).sort());
  });
  it("calendar, list and print show it on the new day only", () => {
    // Calendar events and list cells are both built from plannedDate.
    expect(lines.filter((item) => item.plannedDate === after).map((item) => item.id)).toContain(target.id);
    expect(lines.filter((item) => item.plannedDate === before).map((item) => item.id)).not.toContain(target.id);
    const column = [{ id: target.calendarId!, name: "Dispensing" }];
    expect(listPrintCells(after, lines, column)[0].map((item) => item.id)).toContain(target.id);
    expect(listPrintCells(before, lines, column)[0].map((item) => item.id)).not.toContain(target.id);
  });
  it("the order's batch grid, process rows, progress and the activity's route agree", () => {
    const cell = orderBatchMatrix(order, lines, state.directory, "2026-10-07").rows.find((row) => row.processName === "Dispensing")!.cells["Batch 8"];
    expect([cell.firstDate, cell.lastDate]).toEqual([after, after]);
    const rows = orderProcessRows(order, lines, state.directory);
    expect(rows.find((row) => row.processName === "Dispensing")!.lastDate >= after).toBe(true);
    expect(orderProgress(order, rows, "2026-10-07", lines).status).toBe(orderProgress(order, orderProcessRows(order, state.data.lines, state.directory), "2026-10-07", state.data.lines).status);
    const route = batchRoute(line, lines, state.directory);
    expect(route.find((step) => step.processName === "Dispensing")!.lines.map((item) => item.plannedDate)).toEqual([after]);
  });
  it("reports and machine conflicts see the moved booking, and no booking is left behind", () => {
    const report = getScheduleReport(lines, entries, state.workCentres, state.machines as never, state.products);
    expect(report.totalEntries).toBe(getScheduleReport(state.data.lines, state.data.entries, state.workCentres, state.machines as never, state.products).totalEntries);
    expect(checkProcessFlow(lines, entries, state.data.orders, state.products, state.directory).filter((warning) => warning.kind === "booking")).toEqual([]);
    expect(findMachineConflicts(entries, state.machines as never, state.products).every((conflict) => conflict.entryIds.every((id) => entries.some((entry) => entry.id === id)))).toBe(true);
  });
  it("the changed workspace is still valid to save", () => {
    expect(() => parseWorkspace({ ...state, data: { ...state.data, lines, entries } })).not.toThrow();
  });
});

describe("moves that break the process flow warn", () => {
  it("moving dispensing after compression warns about the sequence; moving back clears it", () => {
    const later = moveActivity(state.data.lines, state.data.entries, target.id, "2026-12-31", "Tester");
    if ("error" in later) throw new Error(later.error);
    const warnings = checkProcessFlow(later.lines, later.entries, state.data.orders, state.products, state.directory);
    expect(warnings.some((warning) => warning.kind === "sequence" && warning.batch === "Batch 8")).toBe(true);
    const back = moveActivity(later.lines, later.entries, target.id, target.plannedDate, "Tester");
    if ("error" in back) throw new Error(back.error);
    expect(checkProcessFlow(back.lines, back.entries, state.data.orders, state.products, state.directory).some((warning) => warning.batch === "Batch 8" && warning.orderId === order.id)).toBe(false);
    expect(back.entries).toEqual(state.data.entries.map((entry) => ({ ...entry, ...(back.entries.find((item) => item.id === entry.id)!.changedBy === "Tester" ? { changedBy: "Tester" } : {}) })));
  });
  it("refuses to move completed work and keeps everything unchanged", () => {
    const done = state.data.lines.find((line) => line.completedAt)!;
    expect(moveActivity(state.data.lines, state.data.entries, done.id, "2026-12-01", "Tester")).toEqual({ error: "Completed activities cannot be moved." });
    expect(moveActivity(state.data.lines, state.data.entries, "missing", "2026-12-01", "Tester")).toEqual({ error: "This activity no longer exists." });
  });
  it("a same-day move changes nothing", () => {
    const same = moveActivity(state.data.lines, state.data.entries, target.id, target.plannedDate, "Tester");
    expect(same).toEqual({ lines: state.data.lines, entries: state.data.entries, movedEntryIds: [] });
  });
});

describe("adding a batch from the grid", async () => {
  const { createBatchLines, nextBatchLabel } = await import("../src/lib/services/planChanges");
  const tablets = state.data.orders.find((item) => item.poNumber === "PO-2610-131")!;
  let n = 0;
  const context = (order = tablets, format: "Tablet" | "Capsule" | "Sachet" | "Other" = "Tablet") => ({ order, format, lines: state.data.lines, directory: state.directory, uom: order.uom, newId: () => `new-${++n}` });
  it("suggests the next batch number", () => {
    expect(nextBatchLabel(tablets, state.data.lines)).toBe("Batch 9");
  });
  it("creates one activity per route step on consecutive working days, in the order's unit", () => {
    const result = createBatchLines({ label: "Batch 9", quantity: 280000, startDate: "2026-10-23" }, context());
    if ("error" in result) throw new Error(result.error);
    expect(result.lines.map((line) => [line.activityType, line.plannedDate])).toEqual([["Dispensing", "2026-10-23"], ["Compression", "2026-10-26"], ["Coating", "2026-10-27"], ["Filling", "2026-10-28"], ["Packing", "2026-10-29"]]);
    expect(result.lines.every((line) => line.productionOrderId === tablets.id && line.orderReference === "Batch 9" && line.quantity === 280000)).toBe(true);
    expect(result.lines[0].batchSizeKg).toBe(406);
    // The new batch follows its route, so it raises no process-flow warnings.
    const all = [...state.data.lines, ...result.lines];
    expect(checkProcessFlow(all, state.data.entries, state.data.orders, state.products, state.directory).filter((item) => item.batch === "Batch 9")).toEqual([]);
    expect(() => parseWorkspace({ ...state, data: { ...state.data, lines: all } })).not.toThrow();
  });
  it("starts on Monday when the chosen start is a weekend, and refuses duplicates or bad input", () => {
    const weekend = createBatchLines({ label: "Batch 10", quantity: 5, startDate: "2026-10-24" }, context());
    expect("lines" in weekend && weekend.lines[0].plannedDate).toBe("2026-10-26");
    expect(createBatchLines({ label: "batch 8", quantity: 5, startDate: "2026-10-26" }, context())).toEqual({ error: "batch 8 already exists on this order." });
    expect(createBatchLines({ label: "Batch 11", quantity: 0, startDate: "2026-10-26" }, context())).toEqual({ error: "Quantity must be greater than zero." });
    expect(createBatchLines({ label: "Batch 11", quantity: 5, startDate: "2026-10-26" }, context(tablets, "Other"))).toMatchObject({ error: expect.stringContaining("Set the order's format") });
  });
});
