import type { CalendarDirectory, UnitCalendar } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";

// A customer purchase order. Plan lines link to it through `productionOrderId`.
export type PurchaseOrder = {
  id: string; poNumber: string; productId: string; quantity: number; uom: string;
  // Optional only so orders saved before the field existed still load.
  customerName?: string;
  // Expected completion date keyed by the unit-process calendar the work runs in.
  expectedDates: Record<string, string>;
  notes?: string; createdAt: string; createdBy: string;
};

export function validateOrder(order: Pick<PurchaseOrder, "id" | "poNumber" | "productId" | "quantity" | "customerName">, orders: PurchaseOrder[], products: Product[]) {
  const errors: string[] = [];
  if (!order.customerName?.trim()) errors.push("Enter the customer name.");
  const po = order.poNumber.trim();
  if (!po) errors.push("Enter a PO number.");
  else if (orders.some((item) => item.id !== order.id && item.poNumber.trim().toLowerCase() === po.toLowerCase())) errors.push("This PO number already exists.");
  if (!products.some((product) => product.id === order.productId)) errors.push("Choose a product.");
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) errors.push("Quantity must be greater than zero.");
  return errors;
}

export type OrderProcessRow = {
  calendar: UnitCalendar; processName: string; unitName: string;
  firstDate: string; lastDate: string; plannedQuantity: number; completedQuantity: number; lineCount: number; completedCount: number;
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
      firstDate: steps[0].plannedDate, lastDate: steps.at(-1)!.plannedDate,
      plannedQuantity: steps.reduce((total, line) => total + line.quantity, 0),
      completedQuantity: steps.reduce((total, line) => total + (line.yieldQuantity ?? 0), 0),
      lineCount: steps.length, completedCount: steps.filter((line) => line.completedAt).length
    }];
  });
}

export type RouteStep = { calendar: UnitCalendar; processName: string; lines: PlanLine[] };

// The batch's path through every process of its unit; steps it has not been planned into have no lines.
export function batchRoute(line: PlanLine, lines: PlanLine[], directory: CalendarDirectory): RouteStep[] {
  const unitId = directory.calendars.find((item) => item.id === line.calendarId)?.unitId;
  const sameBatch = (other: PlanLine) => other.id === line.id || (!!line.orderReference?.trim() && other.productId === line.productId &&
    other.orderReference?.trim() === line.orderReference.trim() && other.productionOrderId === line.productionOrderId);
  return directory.calendars.filter((calendar) => calendar.unitId === unitId).map((calendar) => ({
    calendar, processName: directory.processes.find((item) => item.id === calendar.processId)?.name ?? calendar.name,
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
  const finishedQuantity = rows.at(-1)?.completedQuantity ?? 0;
  const status: OrderStatus = !rows.length ? "Not scheduled" : processesDone === rows.length ? "Completed" : started ? "In production" : "Scheduled";
  const expectedDate = Object.entries(order.expectedDates).filter(([calendarId]) => rows.some((row) => row.calendar.id === calendarId)).map(([, value]) => value).sort().at(-1);
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

export type MonthBasis = "scheduled" | "expected" | "created";
// Whether an order belongs to a "YYYY-MM" month: work scheduled in it, expected to finish in it, or created in it.
export function orderInMonth(order: PurchaseOrder, rows: OrderProcessRow[], progress: Pick<OrderProgress, "expectedDate">, month: string, basis: MonthBasis) {
  if (!month) return true;
  if (basis === "expected") return progress.expectedDate?.slice(0, 7) === month;
  if (basis === "created") {
    const created = new Date(order.createdAt);
    return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}` === month;
  }
  return rows.some((row) => row.firstDate.slice(0, 7) <= month && row.lastDate.slice(0, 7) >= month);
}
