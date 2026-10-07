export type CalendarView = "month" | "week" | "day";
export const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function printDates(date: string, view: CalendarView) {
  const start = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(start.getTime())) return [];
  let count = 1;
  if (view === "week") { start.setDate(start.getDate() - (start.getDay() + 6) % 7); count = 7; }
  if (view === "month") {
    start.setDate(1);
    const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    count = Math.ceil((days + offset) / 7) * 7;
  }
  return Array.from({ length: count }, (_, index) => { const day = new Date(start); day.setDate(day.getDate() + index); return localDateKey(day); });
}
import type { PlanLine, Product } from "@/lib/domain/types";
import { orderNumbers, type PurchaseOrder } from "./orders";
import type { JobOrder } from "./jobOrders";

export type CalendarPrintInput = { title: string; date: string; view: CalendarView; lines: PlanLine[]; products: Product[]; processNames: Record<string, string>; orders?: PurchaseOrder[]; jobOrders?: JobOrder[] };

// "bottles" -> "bottle", "boxes" -> "box", "pouches" -> "pouch"; "carton" stays.
export const singular = (unit: string) => /(x|ch|sh)es$/i.test(unit) ? unit.slice(0, -2) : unit.replace(/s$/i, "");

/**
 * Everything printed about one activity, the same on paper, PDF and Excel: product, process, the
 * job order's batch number, batch quantity (kg) and pack size, and the planned quantity.
 */
export function scheduleDetail(line: PlanLine, products: Product[], orders: PurchaseOrder[] = [], jobOrders: JobOrder[] = []) {
  const product = products.find((item) => item.id === line.productId);
  const uom = line.uom ?? product?.uom ?? "";
  const job = jobOrders.find((item) => item.id === line.jobOrderId);
  const order = orders.find((item) => item.id === line.productionOrderId);
  return {
    productName: product?.name ?? "Unknown product",
    process: line.activityType ?? "",
    jobNumber: job?.number ?? "", reference: line.orderReference?.trim() ?? "",
    batchNumber: job?.batchNumber ?? "",
    batchQuantity: job?.batchSizeKg !== undefined ? `${job.batchSizeKg.toLocaleString("en-GB", { maximumFractionDigits: 3 })} kg` : "",
    packSize: job?.packSize ? `${job.packSize.toLocaleString("en-GB")} ${job.uom}/${job.packUom ? singular(job.packUom) : "pack"}` : "",
    quantity: `${line.quantity.toLocaleString("en-GB")} ${uom}`.trim(),
    quantityValue: line.quantity, uom,
    poNumber: order?.poNumber ?? "", orderNumber: order ? orderNumbers(orders).get(order.id) : undefined, customer: order?.customerName ?? "",
    priority: line.priority, status: line.completedAt ? "Completed" : line.startedAt ? "In progress" : line.status
  };
}
// Batch facts on one line: "Batch FA-001 · 75 kg · Pack 30 tablets/bottle".
export const batchLine = (detail: ReturnType<typeof scheduleDetail>) =>
  [detail.batchNumber ? `Batch ${detail.batchNumber}` : detail.jobNumber ? `JO ${detail.jobNumber}` : "", detail.batchQuantity, detail.packSize ? `Pack ${detail.packSize}` : ""].filter(Boolean).join(" · ");

export function printedActivity(line: PlanLine, products: Product[], orders: PurchaseOrder[] = [], jobOrders: JobOrder[] = []) {
  const detail = scheduleDetail(line, products, orders, jobOrders);
  return { productName: detail.productName, batch: batchLine(detail), quantity: detail.quantity };
}

// The list layout shows the batch reference too, matching the planning spreadsheet.
export type PrintColumn = { id: string; name: string };
export type ListPrintInput = Omit<CalendarPrintInput, "view" | "processNames"> & { columns: PrintColumn[] };
// Colour may not survive printing, so the order's running number and PO are printed as text.
export function printedListActivity(line: PlanLine, products: Product[], orders: PurchaseOrder[] = [], jobOrders: JobOrder[] = []) {
  const detail = scheduleDetail(line, products, orders, jobOrders);
  // Without a job order, the activity's own batch reference stands in for it.
  return { productName: detail.productName, batch: batchLine(detail), detail: [detail.orderNumber ? `#${detail.orderNumber} ${detail.poNumber}` : "", detail.jobNumber ? "" : detail.reference, detail.quantity].filter(Boolean).join(" · ") };
}
export function listPrintCells(day: string, lines: PlanLine[], columns: PrintColumn[]) {
  return columns.map((column) => lines.filter((line) => line.plannedDate === day && line.calendarId === column.id));
}
