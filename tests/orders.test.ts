import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { batchRoute, orderProcessRows, orderProgress, validateOrder } from "../src/lib/services/orders";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const order = state.data.orders.find((item) => item.poNumber === "PO-2609-118")!;

describe("purchase orders", () => {
  it("rejects blank or duplicate PO numbers, unknown products and non-positive quantities", () => {
    const base = { id: "new", customerName: "Acme", poNumber: "PO-1", productId: state.products[0].id, quantity: 10 };
    expect(validateOrder(base, state.data.orders, state.products)).toEqual([]);
    expect(validateOrder({ ...base, poNumber: " po-2609-118 " }, state.data.orders, state.products)).toEqual(["This PO number already exists."]);
    expect(validateOrder({ ...base, id: order.id, poNumber: order.poNumber }, state.data.orders, state.products)).toEqual([]);
    expect(validateOrder({ ...base, poNumber: "", productId: "missing", quantity: 0 }, state.data.orders, state.products)).toHaveLength(3);
    expect(validateOrder({ ...base, customerName: "  " }, state.data.orders, state.products)).toEqual(["Enter the customer name."]);
  });
  it("lists each scheduled process with its total quantity in process order", () => {
    const rows = orderProcessRows(order, state.data.lines, state.directory);
    expect(rows.map((row) => row.processName)).toEqual(["Dispensing", "Compression", "Coating", "Filling", "Packing"]);
    // Three batches of 280,000 tablets; multi-day steps split each batch across days.
    for (const row of rows) expect(row.plannedQuantity).toBe(order.quantity);
    expect(rows[0].firstDate <= rows[0].lastDate).toBe(true);
  });
  it("keeps older workspaces without orders loadable", () => {
    const old = JSON.parse(JSON.stringify(newWorkspace()));
    delete old.data.orders;
    expect(parseWorkspace(old).data.orders).toEqual([]);
    const duplicate = structuredClone(state);
    duplicate.data.orders.push({ ...order, id: "copy" });
    expect(() => parseWorkspace(duplicate)).toThrow();
  });
});

describe("order progress", () => {
  const progress = (po: string, today: string) => { const order = state.data.orders.find((item) => item.poNumber === po)!; return orderProgress(order, orderProcessRows(order, state.data.lines, state.directory), today, state.data.lines); };
  it("reports completed, in-production and scheduled orders with the current stage", () => {
    expect(state.data.orders.every((order) => order.customerName?.endsWith("(Sample)"))).toBe(true);
    const done = progress("PO-2609-120", "2026-10-07");
    expect(done).toMatchObject({ status: "Completed", processesDone: 4, processCount: 4, overdue: false });
    expect(done.finishedQuantity).toBeGreaterThan(0);
    const running = progress("PO-2610-131", "2026-10-07");
    expect(running.status).toBe("In production");
    expect(running.processesDone).toBeLessThan(running.processCount);
    // Batch 6 is the earliest unfinished batch; its next open day is in a later process than dispensing.
    expect(running.batchCount).toBe(3);
    expect(running.nextStep?.batch).toBe("Batch 6");
    expect(done).toMatchObject({ batchCount: 2, batchesFinished: 2, nextStep: undefined });
  });
  it("flags an open order whose expected completion has passed", () => {
    const order = { ...state.data.orders.find((item) => item.poNumber === "PO-2610-131")! };
    const rows = orderProcessRows(order, state.data.lines, state.directory);
    order.expectedDates = { [rows.at(-1)!.calendar.id]: "2026-10-01" };
    expect(orderProgress(order, rows, "2026-10-07")).toMatchObject({ expectedDate: "2026-10-01", overdue: true });
    expect(orderProgress(order, [], "2026-10-07")).toMatchObject({ status: "Not scheduled", percent: 0, overdue: false });
  });
});

describe("production route", () => {
  it("shows every process of the unit and only the same batch's days", () => {
    const line = state.data.lines.find((item) => item.productionOrderId === order.id && item.orderReference === "Batch 4" && item.activityType === "Compression")!;
    const route = batchRoute(line, state.data.lines, state.directory);
    expect(route.map((step) => step.processName)).toEqual(["Dispensing", "Compression", "Capsulation", "Coating", "Filling", "Packing"]);
    expect(route.map((step) => step.lines.length)).toEqual([1, 2, 0, 2, 2, 1]);
    expect(route.flatMap((step) => step.lines).every((item) => item.orderReference === "Batch 4")).toBe(true);
  });
});
