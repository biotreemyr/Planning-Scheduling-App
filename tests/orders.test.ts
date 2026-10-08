import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { ORDER_COLORS, batchRoute, nextOrderNumber, nextPoItem, poLabel, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder } from "../src/lib/services/orders";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const order = state.data.orders.find((item) => item.poNumber === "PO-2609-118")!;

describe("purchase orders", () => {
  it("rejects blank or duplicate PO numbers, unknown products and non-positive quantities", () => {
    const base = { id: "new", customerName: "Acme", poNumber: "PO-1", productId: state.products[0].id, quantity: 10 };
    expect(validateOrder(base, state.data.orders, state.products)).toEqual([]);
    expect(validateOrder({ ...base, poNumber: " po-2609-118 " }, state.data.orders, state.products)).toEqual([`PO po-2609-118 already belongs to ${order.customerName}.`]);
    expect(validateOrder({ ...base, customerName: order.customerName, poNumber: " po-2609-118 " }, state.data.orders, state.products)).toEqual(["Item 1 of PO po-2609-118 already exists."]);
    expect(validateOrder({ ...base, id: order.id, poNumber: order.poNumber }, state.data.orders, state.products)).toEqual([]);
    expect(validateOrder({ ...base, poNumber: "", productId: "missing", quantity: 0 }, state.data.orders, state.products)).toHaveLength(3);
    expect(validateOrder({ ...base, customerName: "  " }, state.data.orders, state.products)).toEqual(["Enter the customer name."]);
  });
  it("lists each scheduled process with its total quantity in process order", () => {
    const rows = orderProcessRows(order, state.data.lines, state.directory);
    expect(rows.map((row) => row.processName)).toEqual(["Dispensing", "Compression", "Coating", "Filling", "Packing"]);
    // Three batches of 280,000 tablets; multi-day steps split each batch across days. Each process
    // plans its own measure: kg dispensed, tablets pressed and coated, bottles filled, boxes packed.
    expect(rows.map((row) => row.uom)).toEqual(["kg", "tablets", "tablets", "bottles", "boxes"]);
    for (const row of rows.filter((item) => item.uom === order.uom)) expect(row.plannedQuantity).toBe(order.quantity);
    expect(rows.find((row) => row.uom === "bottles")!.plannedQuantity).toBe(3 * Math.ceil(280000 / 60));
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

describe("a PO with several products", () => {
  const product = (index: number) => state.products[index].id;
  const item = (id: string, productIndex: number, itemNumber: number, number: number) => ({ ...order, id, productId: product(productIndex), item: itemNumber, number, expectedDates: {} });
  it("keys further products under the same PO as numbered items, for the same customer only", () => {
    expect(nextPoItem(order.poNumber, state.data.orders)).toBe(2);
    expect(nextPoItem("PO-NEW", state.data.orders)).toBe(1);
    const second = item("second", 1, 2, 900);
    expect(validateOrder(second, state.data.orders, state.products)).toEqual([]);
    const orders = [...state.data.orders, second];
    expect(poLabel(second, orders)).toBe(`${order.poNumber} · item 2 of 2`);
    expect(poLabel(order, orders)).toBe(`${order.poNumber} · item 1 of 2`);
    expect(poLabel(order, state.data.orders)).toBe(order.poNumber);
    expect(validateOrder({ ...item("third", 2, 2, 901) }, orders, state.products)).toEqual([`Item 2 of PO ${order.poNumber} already exists.`]);
  });
  it("saves and reloads a multi-item PO, and refuses a PO shared by two customers", () => {
    const next = structuredClone(state);
    next.data.orders.push(item("second", 1, 2, 900), item("third", 2, 3, 901));
    expect(parseWorkspace(next).data.orders.filter((entry) => entry.poNumber === order.poNumber).map((entry) => entry.item ?? 1)).toEqual([1, 2, 3]);
    const repeated = structuredClone(next);
    repeated.data.orders.push(item("again", 3, 3, 902));
    expect(() => parseWorkspace(repeated)).toThrow();
    const shared = structuredClone(state);
    shared.data.orders.push({ ...item("other", 1, 2, 903), customerName: "Someone Else" });
    expect(() => parseWorkspace(shared)).toThrow();
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

describe("order month filter", () => {
  it("matches orders by scheduled work, expected completion or creation month", () => {
    const order = state.data.orders.find((item) => item.poNumber === "PO-2609-118")!;
    const rows = orderProcessRows(order, state.data.lines, state.directory);
    const first = rows[0].firstDate.slice(0, 7), last = rows.at(-1)!.lastDate.slice(0, 7);
    expect(orderInMonth(order, rows, {}, first, "scheduled")).toBe(true);
    expect(orderInMonth(order, rows, {}, last, "scheduled")).toBe(true);
    expect(orderInMonth(order, rows, {}, "2025-01", "scheduled")).toBe(false);
    expect(orderInMonth(order, rows, { expectedDate: "2026-11-04" }, "2026-11", "expected")).toBe(true);
    expect(orderInMonth(order, rows, {}, "2026-11", "expected")).toBe(false);
    expect(orderInMonth({ ...order, createdAt: new Date(2026, 8, 15, 9).toISOString() }, rows, {}, "2026-09", "created")).toBe(true);
    expect(orderInMonth(order, rows, {}, "", "created")).toBe(true);
  });
});

describe("order numbers and colours", () => {
  it("numbers sample orders in entry order and repeats eight colours", () => {
    const numbers = orderNumbers(state.data.orders);
    expect(state.data.orders.map((order) => numbers.get(order.id))).toEqual(state.data.orders.map((_, index) => index + 1));
    expect(nextOrderNumber(state.data.orders)).toBe(state.data.orders.length + 1);
    expect(orderColor(1)).toBe(ORDER_COLORS[0]);
    expect(orderColor(9)).toBe(orderColor(1));
    expect(orderColor(16)).toBe(ORDER_COLORS[7]);
    expect(new Set(ORDER_COLORS).size).toBe(8);
  });
  it("numbers older orders after the highest stored number without shifting existing ones", () => {
    const base = state.data.orders[0];
    const orders = [{ ...base, id: "a", number: 4, createdAt: "2026-09-02T00:00:00Z" }, { ...base, id: "b", number: undefined, createdAt: "2026-09-03T00:00:00Z" }, { ...base, id: "c", number: undefined, createdAt: "2026-09-01T00:00:00Z" }];
    expect([...orderNumbers(orders).entries()]).toEqual(expect.arrayContaining([["a", 4], ["c", 5], ["b", 6]]));
  });
  it("rejects a reused order number", () => {
    const order = state.data.orders[0];
    expect(validateOrder({ ...order, id: "new", poNumber: "PO-NEW" }, state.data.orders, state.products)).toEqual(["This order number is already in use."]);
    const duplicate = structuredClone(state);
    duplicate.data.orders[1].number = duplicate.data.orders[0].number;
    expect(() => parseWorkspace(duplicate)).toThrow();
  });
});

describe("order batch grid", () => {
  const order = state.data.orders.find((item) => item.poNumber === "PO-2609-125")!;
  it("lays out each process against each batch with batch sizes in kg and pieces", () => {
    const matrix = orderBatchMatrix(order, state.data.lines, state.directory, "2026-10-07");
    expect(matrix.batches.map((batch) => [batch.label, batch.quantity, batch.kg])).toEqual([["Batch 1", 300000, 75], ["Batch 2", 300000, 75], ["Batch 3", 300000, 75]]);
    expect(matrix.total).toEqual({ quantity: 900000, kg: 225 });
    expect(matrix.rows.map((row) => row.processName)).toEqual(["Dispensing", "Compression", "Coating", "Filling", "Packing"]);
    // Filling runs two days per batch; its days add back up to the batch.
    const filling = matrix.rows.find((row) => row.processName === "Filling")!;
    expect(filling.uom).toBe("bottles");
    expect(filling.cells["Batch 1"]).toMatchObject({ days: 2, planned: 5000 });
    expect(filling.planned).toBe(15000);
  });
  it("marks finished, late and planned batch steps", () => {
    const lines = structuredClone(state.data.lines);
    const target = lines.filter((line) => line.productionOrderId === order.id && line.orderReference === "Batch 3" && line.activityType === "Packing");
    for (const line of target) { delete line.completedAt; delete line.yieldQuantity; }
    const packing = (today: string) => orderBatchMatrix(order, lines, state.directory, today).rows.find((row) => row.processName === "Packing")!.cells["Batch 3"];
    expect(packing("2026-01-01")).toMatchObject({ daysDone: 0, late: false });
    expect(packing("2027-01-01")).toMatchObject({ daysDone: 0, late: true });
    expect(orderBatchMatrix(order, state.data.lines, state.directory, "2026-10-07").rows[0].cells["Batch 1"]).toMatchObject({ days: 1, daysDone: 1 });
  });
  it("keeps natural batch order and groups unlabelled lines", () => {
    const lines = state.data.lines.filter((line) => line.productionOrderId === order.id).map((line) => ({ ...line, orderReference: line.orderReference === "Batch 2" ? "Batch 10" : line.orderReference === "Batch 3" ? undefined : line.orderReference }));
    expect(orderBatchMatrix(order, lines, state.directory, "2026-10-07").batches.map((batch) => batch.label)).toEqual(["Batch 1", "Batch 10", "No batch"]);
  });
});
