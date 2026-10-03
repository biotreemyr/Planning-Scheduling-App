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

export type CalendarPrintInput = { title: string; date: string; view: CalendarView; lines: PlanLine[]; products: Product[]; processNames: Record<string, string> };

export function printedActivity(line: PlanLine, products: Product[]) {
  const product = products.find((product) => product.id === line.productId);
  const uom = line.uom ?? product?.uom ?? "";
  return {
    productName: product?.name ?? "Unknown product",
    quantity: `${line.quantity.toLocaleString("en-GB")} ${uom}`.trim()
  };
}

// The list layout shows the batch reference too, matching the planning spreadsheet.
export type PrintColumn = { id: string; name: string };
export type ListPrintInput = Omit<CalendarPrintInput, "view" | "processNames"> & { columns: PrintColumn[]; orders?: PurchaseOrder[] };
// Colour may not survive printing, so the order's running number and PO are printed as text.
export function printedListActivity(line: PlanLine, products: Product[], orders: PurchaseOrder[] = []) {
  const activity = printedActivity(line, products);
  const order = orders.find((item) => item.id === line.productionOrderId);
  const number = order ? orderNumbers(orders).get(order.id) : undefined;
  return { productName: activity.productName, detail: [order ? `#${number} ${order.poNumber}` : "", line.orderReference?.trim(), activity.quantity].filter(Boolean).join(" · ") };
}
export function listPrintCells(day: string, lines: PlanLine[], columns: PrintColumn[]) {
  return columns.map((column) => lines.filter((line) => line.plannedDate === day && line.calendarId === column.id));
}
