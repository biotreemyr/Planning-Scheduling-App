import type { PlanLine, ScheduleEntry } from "@/lib/domain/types";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import { daysBetween, shiftTimestamp } from "./scheduling";
import { batchKilograms } from "./measurements";
import type { PurchaseOrder } from "./orders";
import { ROUTES, routeLabel, stepOf, type ProductFormat } from "./processRules";

/**
 * Move an activity to a new date. Its open machine bookings move by the same number of
 * days, so the calendar, list, machine schedule, orders and reports all stay in step.
 * Every way of changing a planned date goes through here.
 */
export function moveActivity<L extends PlanLine, E extends ScheduleEntry>(lines: L[], entries: E[], lineId: string, date: string, changedBy: string):
  { lines: L[]; entries: E[]; movedEntryIds: string[] } | { error: string } {
  const line = lines.find((item) => item.id === lineId);
  if (!line) return { error: "This activity no longer exists." };
  if (line.completedAt) return { error: "Completed activities cannot be moved." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a valid date." };
  const days = daysBetween(line.plannedDate, date);
  if (!days) return { lines, entries, movedEntryIds: [] };
  const moving = new Set(entries.filter((entry) => entry.planLineId === lineId && entry.status !== "Completed" && entry.status !== "Cancelled").map((entry) => entry.id));
  return {
    lines: lines.map((item) => item.id === lineId ? { ...item, plannedDate: date } : item),
    entries: entries.map((entry) => moving.has(entry.id) ? { ...entry, startAt: shiftTimestamp(entry.startAt, days), endAt: shiftTimestamp(entry.endAt, days), changedBy } : entry),
    movedEntryIds: [...moving]
  };
}

// With a job order, the activities carry its ID and are labelled with its JO number.
export type NewBatch = { label: string; quantity: number; startDate: string; jobOrderId?: string };
type BatchContext = {
  order: PurchaseOrder; format: ProductFormat; lines: PlanLine[]; directory: CalendarDirectory; uom: string;
  newId: () => string;
};
const nextWorkday = (date: Date) => { do { date.setDate(date.getDate() + 1); } while (date.getDay() === 0 || date.getDay() === 6); return date; };
const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Create a batch: one activity per step of the order's format route, one working day each,
 * in the unit the order already runs in (or the first unit set up for the whole route).
 */
export function createBatchLines(batch: NewBatch, context: BatchContext): { lines: PlanLine[] } | { error: string } {
  const { order, format, lines, directory } = context;
  const label = batch.label.trim();
  if (format === "Other") return { error: "Set the order's format to Capsule, Tablet or Sachet to create batches from its route." };
  if (!label) return { error: "Enter a batch name." };
  if (lines.some((line) => line.productionOrderId === order.id && line.orderReference?.trim().toLowerCase() === label.toLowerCase())) return { error: `${label} already exists on this order.` };
  if (!Number.isFinite(batch.quantity) || batch.quantity <= 0) return { error: "Quantity must be greater than zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(batch.startDate)) return { error: "Choose a start date." };
  const route = ROUTES[format];
  const stepCalendar = (unitId: string, step: string) => directory.calendars.find((calendar) => calendar.unitId === unitId && stepOf(directory.processes.find((process) => process.id === calendar.processId)?.name ?? calendar.name) === step);
  const usedUnit = directory.calendars.find((calendar) => lines.some((line) => line.productionOrderId === order.id && line.calendarId === calendar.id))?.unitId;
  const unitId = usedUnit ?? directory.units.find((unit) => route.every((step) => stepCalendar(unit.id, step)))?.id;
  if (!unitId) return { error: `No unit is set up with every ${format.toLowerCase()} process (${routeLabel(format)}).` };
  const missing = route.filter((step) => !stepCalendar(unitId, step));
  if (missing.length) return { error: `${directory.units.find((unit) => unit.id === unitId)?.name ?? "This unit"} has no ${missing.map((step) => step[0].toUpperCase() + step.slice(1)).join(", ")} process set up.` };
  const sample = lines.find((line) => line.productionOrderId === order.id);
  const day = new Date(`${batch.startDate}T12:00:00`);
  if (day.getDay() === 0 || day.getDay() === 6) nextWorkday(day);
  return { lines: route.map((step, index) => {
    if (index) nextWorkday(day);
    const calendar = stepCalendar(unitId, step)!;
    return {
      id: context.newId(), planId: "production-plan", calendarId: calendar.id, productId: order.productId, productionOrderId: order.id,
      quantity: batch.quantity, uom: context.uom, plannedDate: key(day), priority: sample?.priority ?? "Normal", status: "Unscheduled" as const,
      activityType: directory.processes.find((process) => process.id === calendar.processId)?.name ?? calendar.name, orderReference: label,
      ...(batch.jobOrderId ? { jobOrderId: batch.jobOrderId } : {}),
      ...(sample?.unitWeightMg ? { unitWeightMg: sample.unitWeightMg } : {}), batchSizeKg: batchKilograms(batch.quantity, context.uom, sample?.unitWeightMg)
    };
  }) };
}
