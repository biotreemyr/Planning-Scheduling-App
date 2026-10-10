import type { CalendarDirectory, UnitCalendar } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { ProductFormat } from "./processRules";
import { lineDays, lineEnd } from "./scheduling";
import { calendarSettings, type ProcessSettings } from "./processSetup";

// One product line item of a customer purchase order. A PO with several products is several of
// these sharing a PO number, numbered by `item`. Plan lines link to one through `productionOrderId`.
export type PurchaseOrder = {
  id: string; poNumber: string; productId: string; quantity: number; uom: string;
  // Optional only so orders saved before the field existed still load.
  customerName?: string;
  // The customer record (customer ID and name). Older orders carry only the name.
  customerId?: string;
  // Running number given when the order is entered; it picks the order's colour and never changes.
  number?: number;
  // Line item within its PO, from 1. Orders saved before items existed are item 1.
  item?: number;
  // Capsule, tablet or sachet: decides the required process route. Older orders infer it from the product.
  format?: ProductFormat;
  // The production unit (BTP, BTB...) that makes it; its job orders are planned on that unit's board.
  unitId?: string;
  // When the customer expects the goods (YYYY-MM-DD); the one date people follow an order by.
  deliveryDate?: string;
  // When the customer's PO was received (YYYY-MM-DD).
  receivedDate?: string;
  // The SQL Account sales order (SO) number for this PO, keyed in by the planner for reference.
  soNumber?: string;
  // Per-process expected completion dates from before delivery dates; no longer entered or shown.
  expectedDates: Record<string, string>;
  notes?: string; createdAt: string; createdBy: string;
};

const samePo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const poItem = (order: Pick<PurchaseOrder, "item">) => order.item ?? 1;
// The other line items keyed under the same PO number.
export const poItems = (poNumber: string, orders: PurchaseOrder[]) => orders.filter((item) => samePo(item.poNumber, poNumber));
export const nextPoItem = (poNumber: string, orders: PurchaseOrder[]) => Math.max(0, ...poItems(poNumber, orders).map(poItem)) + 1;
// "PO-123 · item 2 of 3" for a PO with several items, just the PO number otherwise.
export function poLabel(order: PurchaseOrder, orders: PurchaseOrder[]) {
  const count = poItems(order.poNumber, orders).length;
  return count > 1 ? `${order.poNumber} · item ${poItem(order)} of ${count}` : order.poNumber;
}

export function validateOrder(order: Pick<PurchaseOrder, "id" | "poNumber" | "productId" | "quantity" | "customerName" | "number" | "item" | "unitId">, orders: PurchaseOrder[], products: Product[]) {
  const errors: string[] = [];
  if (order.number !== undefined && orders.some((item) => item.id !== order.id && item.number === order.number)) errors.push("This order number is already in use.");
  if (!order.customerName?.trim()) errors.push("Enter the customer name.");
  const po = order.poNumber.trim();
  const others = poItems(po, orders).filter((item) => item.id !== order.id);
  const owner = others.find((item) => item.customerName?.trim() && !samePo(item.customerName, order.customerName ?? ""));
  if (!po) errors.push("Enter a PO number.");
  // A PO may hold several products, but it belongs to one customer and each item number is used once.
  else if (owner) errors.push(`PO ${po} already belongs to ${owner.customerName!.trim()}.`);
  else if (others.some((item) => poItem(item) === poItem(order))) errors.push(`Item ${poItem(order)} of PO ${po} already exists.`);
  if (!products.some((product) => product.id === order.productId)) errors.push("Choose a product.");
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) errors.push("Quantity must be greater than zero.");
  return errors;
}

// Eight tab colours, repeated in order: #1 and #9 share green, #2 and #10 blue, and so on.
// Neighbouring hues are kept far apart; #8 is light grey, so "no PO" uses a dashed outline instead of grey.
export const ORDER_COLORS = ["#2b8a3e", "#1971c2", "#e8590c", "#7048e8", "#15aabf", "#d6336c", "#fab005", "#ced4da"] as const;
export const orderColor = (number: number) => ORDER_COLORS[(Math.max(1, Math.trunc(number)) - 1) % ORDER_COLORS.length];

// Each order's running number. Orders saved before numbering existed are numbered after the
// highest stored number, oldest first, so existing numbers never shift.
export function orderNumbers(orders: PurchaseOrder[]) {
  const numbers = new Map<string, number>();
  let next = Math.max(0, ...orders.map((order) => order.number ?? 0));
  for (const order of orders) if (order.number) numbers.set(order.id, order.number);
  for (const order of [...orders].filter((item) => !item.number).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.poNumber.localeCompare(b.poNumber))) numbers.set(order.id, ++next);
  return numbers;
}
export const nextOrderNumber = (orders: PurchaseOrder[]) => Math.max(0, ...orderNumbers(orders).values()) + 1;

export type OrderProcessRow = {
  calendar: UnitCalendar; processName: string; unitName: string;
  firstDate: string; lastDate: string; plannedQuantity: number; completedQuantity: number; lineCount: number; completedCount: number;
  // The process's own measure: kg at dispensing, tablets or capsules, bottles at filling, boxes at packing.
  uom: string;
};

// Processes the order has been scheduled into so far, in the unit's process order.
export function orderProcessRows(order: PurchaseOrder, lines: PlanLine[], directory: CalendarDirectory): OrderProcessRow[] {
  const linked = lines.filter((line) => line.productionOrderId === order.id);
  return directory.calendars.flatMap((calendar) => {
    const steps = linked.filter((line) => line.calendarId === calendar.id).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    if (!steps.length) return [];
    return [{
      calendar, processName: directory.processes.find((item) => item.id === calendar.processId)?.name ?? calendar.name,
      unitName: directory.units.find((item) => item.id === calendar.unitId)?.name ?? "",
      firstDate: steps[0].plannedDate, lastDate: steps.map(lineEnd).sort().at(-1)!,
      plannedQuantity: steps.reduce((total, line) => total + line.quantity, 0),
      completedQuantity: steps.reduce((total, line) => total + (line.yieldQuantity ?? 0), 0),
      lineCount: steps.length, completedCount: steps.filter((line) => line.completedAt).length, uom: steps[0].uom ?? order.uom
    }];
  });
}

export type RouteStep = { calendar: UnitCalendar; processName: string; lines: PlanLine[]; settings: ProcessSettings };

// The batch's path through every process of its unit; steps it has not been planned into have no lines.
export function batchRoute(line: PlanLine, lines: PlanLine[], directory: CalendarDirectory): RouteStep[] {
  const unitId = directory.calendars.find((item) => item.id === line.calendarId)?.unitId;
  const sameBatch = (other: PlanLine) => other.id === line.id || (!!line.orderReference?.trim() && other.productId === line.productId &&
    other.orderReference?.trim() === line.orderReference.trim() && other.productionOrderId === line.productionOrderId);
  return directory.calendars.filter((calendar) => calendar.unitId === unitId).map((calendar) => ({
    calendar, processName: directory.processes.find((item) => item.id === calendar.processId)?.name ?? calendar.name, settings: calendarSettings(directory, calendar.id),
    lines: lines.filter((other) => other.calendarId === calendar.id && sameBatch(other)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
  }));
}

export type OrderStatus = "Not scheduled" | "Scheduled" | "In production" | "Completed";
export type OrderProgress = {
  status: OrderStatus; processesDone: number; processCount: number;
  batchCount: number; batchesFinished: number;
  // Where the earliest unfinished batch is now, e.g. Batch 3 at Filling.
  nextStep?: { batch: string; processName: string };
  finishedQuantity: number; percent: number; expectedDate?: string; overdue: boolean;
};

// Progress through the scheduled work. Batches are the plan lines sharing a batch/order reference;
// finished output is what the final scheduled process has completed.
export function orderProgress(order: PurchaseOrder, rows: OrderProcessRow[], today: string, lines: PlanLine[] = []): OrderProgress {
  const done = (row: OrderProcessRow) => row.lineCount > 0 && row.completedCount === row.lineCount;
  const processesDone = rows.filter(done).length;
  const started = rows.some((row) => row.completedCount > 0);
  const finishedQuantity = finishedInOrderUnit(order, rows.at(-1), lines);
  const status: OrderStatus = !rows.length ? "Not scheduled" : processesDone === rows.length ? "Completed" : started ? "In production" : "Scheduled";
  const expectedDate = order.deliveryDate;
  const scheduled = lines.filter((line) => line.productionOrderId === order.id && rows.some((row) => row.calendar.id === line.calendarId));
  const batches = new Map<string, PlanLine[]>();
  for (const line of scheduled) { const key = line.orderReference?.trim() || line.id; batches.set(key, [...batches.get(key) ?? [], line]); }
  const open = [...batches.entries()].map(([batch, items]) => ({ batch, items: items.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)) }))
    .filter(({ items }) => items.some((line) => !line.completedAt)).sort((a, b) => a.items[0].plannedDate.localeCompare(b.items[0].plannedDate));
  const nextLine = open[0]?.items.find((line) => !line.completedAt);
  const nextRow = rows.find((row) => row.calendar.id === nextLine?.calendarId);
  return {
    status, processesDone, processCount: rows.length, batchCount: batches.size, batchesFinished: batches.size - open.length,
    nextStep: nextRow && open[0] ? { batch: open[0].batch, processName: nextRow.processName } : undefined,
    finishedQuantity, percent: Math.min(100, Math.round(finishedQuantity / order.quantity * 100)),
    expectedDate, overdue: status !== "Completed" && !!expectedDate && expectedDate < today
  };
}

// What the final scheduled process has finished, in the PO's unit. A final process counted in another
// measure (boxes at packing) is converted per batch: its yield share of plan times the batch's
// planned quantity in the PO's unit.
function finishedInOrderUnit(order: PurchaseOrder, last: OrderProcessRow | undefined, lines: PlanLine[]) {
  if (!last) return 0;
  if (last.uom === order.uom) return last.completedQuantity;
  const linked = lines.filter((line) => line.productionOrderId === order.id);
  const batchKey = (line: PlanLine) => line.orderReference?.trim() || line.id;
  const total = linked.filter((line) => line.calendarId === last.calendar.id && line.completedAt && line.quantity > 0).reduce((sum, line) => {
    const inOrderUnit = Math.max(0, ...linked.filter((other) => batchKey(other) === batchKey(line) && other.uom === order.uom && other.calendarId !== last.calendar.id).map((other) => other.quantity));
    return sum + (line.yieldQuantity ?? 0) / line.quantity * inOrderUnit;
  }, 0);
  return Math.round(total);
}

export type MonthBasis = "scheduled" | "expected" | "received" | "created";
// Whether an order belongs to a "YYYY-MM" month: work scheduled in it, expected to finish in it, or created in it.
export function orderInMonth(order: PurchaseOrder, rows: OrderProcessRow[], progress: Pick<OrderProgress, "expectedDate">, month: string, basis: MonthBasis) {
  if (!month) return true;
  if (basis === "expected") return progress.expectedDate?.slice(0, 7) === month;
  if (basis === "received") return order.receivedDate?.slice(0, 7) === month;
  if (basis === "created") {
    const created = new Date(order.createdAt);
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}` === month;
  }
  return rows.some((row) => row.firstDate.slice(0, 7) <= month && row.lastDate.slice(0, 7) >= month);
}

export type BatchCell = { firstDate: string; lastDate: string; days: number; daysDone: number; planned: number; completed: number; late: boolean };
export type OrderBatch = { key: string; label: string; quantity: number; uom: string; kg?: number };
export type OrderBatchMatrix = {
  batches: OrderBatch[];
  rows: { calendar: UnitCalendar; processName: string; uom: string; cells: Record<string, BatchCell>; planned: number; completed: number }[];
  total: { quantity: number; kg?: number };
};
const batchOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// An order's work as a grid: one row per scheduled process, one column per batch.
// Batches are the order's plan lines sharing a batch/order reference.
export function orderBatchMatrix(order: PurchaseOrder, lines: PlanLine[], directory: CalendarDirectory, today: string, visibleCalendarIds?: string[]): OrderBatchMatrix {
  const linked = lines.filter((line) => line.productionOrderId === order.id && (!visibleCalendarIds || visibleCalendarIds.includes(line.calendarId ?? "")));
  const keyOf = (line: PlanLine) => line.orderReference?.trim() || "No batch";
  const rows = orderProcessRows(order, linked, directory).map((row) => {
    const cells: Record<string, BatchCell> = {};
    for (const line of linked.filter((item) => item.calendarId === row.calendar.id).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))) {
      // A several-day activity counts all its days.
      const cell = cells[keyOf(line)] ??= { firstDate: line.plannedDate, lastDate: lineEnd(line), days: 0, daysDone: 0, planned: 0, completed: 0, late: false };
      if (lineEnd(line) > cell.lastDate) cell.lastDate = lineEnd(line);
      cell.days += lineDays(line); cell.planned += line.quantity;
      if (line.completedAt) { cell.daysDone += lineDays(line); cell.completed += line.yieldQuantity ?? 0; } else if (lineEnd(line) < today) cell.late = true;
    }
    return { calendar: row.calendar, processName: row.processName, uom: row.uom, cells, planned: row.plannedQuantity, completed: row.completedQuantity };
  });
  // A batch's size is its largest process total in the PO's unit; a multi-day step splits the batch
  // across its days. Its kilograms are what dispensing weighs, else worked out from the unit weight.
  const batches = [...new Set(linked.map(keyOf))].sort(batchOrder).map((key) => {
    // With no process in the PO's unit, the batch has a size only when every process shares one unit.
    const counted = rows.filter((row) => row.uom === order.uom);
    const sameUnit = new Set(rows.map((row) => row.uom)).size === 1;
    const quantity = Math.max(0, ...(counted.length ? counted : sameUnit ? rows : []).map((row) => row.cells[key]?.planned ?? 0));
    const weighed = rows.find((row) => row.uom === "kg" && row.cells[key]);
    const sample = linked.find((line) => keyOf(line) === key && line.uom === order.uom) ?? linked.find((line) => keyOf(line) === key)!;
    const kg = weighed ? weighed.cells[key].planned : sample.batchSizeKg !== undefined && sample.quantity > 0 ? Number((sample.batchSizeKg / sample.quantity * quantity).toPrecision(6)) : undefined;
    return { key, label: key, quantity, uom: counted.length ? order.uom : sample.uom ?? order.uom, kg };
  });
  const kgKnown = batches.length > 0 && batches.every((batch) => batch.kg !== undefined);
  return { batches, rows, total: { quantity: batches.reduce((sum, batch) => sum + batch.quantity, 0), kg: kgKnown ? Number(batches.reduce((sum, batch) => sum + batch.kg!, 0).toPrecision(6)) : undefined } };
}
