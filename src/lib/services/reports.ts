import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, Product, ScheduleConflict, ScheduleEntry } from "@/lib/domain/types";
import type { ProductionActual } from "./actuals";
import { localDateKey } from "./calendarPrint";
import { findMachineConflicts } from "./conflicts";
import { batchStatus, finishedOn, testResult, type BatchStatus, type JobOrder, type TestResult } from "./jobOrders";
import { isNonProduction, orderProcessRows, orderProgress, type PurchaseOrder } from "./orders";
import { calendarProcessName } from "./processSetup";
import type { WipTransfer } from "./productionFlow";
import { daysBetween, lineEnd } from "./scheduling";
import { isPerOrderLine, jobParts, jobsServing, orderViewLines, releaseFor, releasedToOrder } from "./sharedJobs";
import { batchYield, type FinalYield, type StageYield, type YieldLimits } from "./yields";

/**
 * The three reports, each one row per record with everything known about it:
 * - Orders & Delivery: one row per PO item. Will it be delivered on time and in full?
 * - Production Flow: what on the floor is late, waiting or overbooked, and is the plan kept?
 * - Batch Yield & Release: one row per batch (a shared batch once per PO). How did it do, where is it in QA?
 * Dates in and out are YYYY-MM-DD days; `today` is the viewer's local day.
 */

// ---- Orders & Delivery ----

export type DeliveryStatus = "Not planned" | "On track" | "At risk" | "Overdue" | "Closed on time" | "Closed late" | "Closed";
export const DELIVERY_STATUSES: { key: DeliveryStatus; hint: string }[] = [
  { key: "Not planned", hint: "Open, with no activity planned yet" },
  { key: "On track", hint: "Planned to finish by the delivery date" },
  { key: "At risk", hint: "Planned to finish after the delivery date" },
  { key: "Overdue", hint: "The delivery date has passed and the PO is not closed" },
  { key: "Closed on time", hint: "Closed on or before the delivery date" },
  { key: "Closed late", hint: "Closed after the delivery date" },
  { key: "Closed", hint: "Closed, with no delivery date to compare" }
];
export const isClosedStatus = (status: DeliveryStatus) => status.startsWith("Closed");

export type DeliveryRow = {
  order: PurchaseOrder; product?: Product;
  jobCount: number;
  // What the last planned process has finished, in the PO's unit, and what QA released to the PO.
  finished: number; released: { quantity: number; uom: string }[];
  // The last day any of the PO's activities is planned to run.
  plannedFinish?: string;
  closedOn?: string;
  // Positive: days after the delivery date (planned finish while open, closing day once closed).
  daysLate?: number;
  // Closed quantity less the order quantity, when both are in the PO's unit.
  overUnder?: number;
  status: DeliveryStatus;
};

export function deliveryStatus(order: PurchaseOrder, plannedFinish: string | undefined, today: string): { status: DeliveryStatus; daysLate?: number; closedOn?: string } {
  const due = order.deliveryDate;
  if (order.closedAt) {
    const closedOn = localDateKey(new Date(order.closedAt));
    if (!due) return { status: "Closed", closedOn };
    const daysLate = daysBetween(due, closedOn);
    return { status: daysLate > 0 ? "Closed late" : "Closed on time", daysLate, closedOn };
  }
  const daysLate = due && plannedFinish ? daysBetween(due, plannedFinish) : undefined;
  if (due && due < today) return { status: "Overdue", daysLate: daysBetween(due, plannedFinish && plannedFinish > today ? plannedFinish : today) };
  if (!plannedFinish) return { status: "Not planned" };
  return { status: daysLate !== undefined && daysLate > 0 ? "At risk" : "On track", daysLate };
}

export function deliveryReport(orders: PurchaseOrder[], jobs: JobOrder[], lines: PlanLine[], directory: CalendarDirectory, products: Product[], today: string): DeliveryRow[] {
  // A shared batch's common processes count for every PO it serves, as on the Orders tab.
  const viewLines = orderViewLines(lines, jobs, directory);
  return orders.map((order) => {
    const own = viewLines.filter((line) => line.productionOrderId === order.id);
    const plannedFinish = own.length ? own.map(lineEnd).sort().at(-1) : undefined;
    const progress = orderProgress(order, orderProcessRows(order, own, directory), today, own);
    const sameUnit = (order.closedUom ?? order.uom) === order.uom;
    return {
      order, product: products.find((item) => item.id === order.productId),
      jobCount: jobsServing(order.id, jobs).length,
      finished: progress.finishedQuantity, released: releasedToOrder(order.id, jobs), plannedFinish,
      ...(order.closedAt && order.closedQuantity !== undefined && sameUnit ? { overUnder: Number((order.closedQuantity - order.quantity).toPrecision(12)) } : {}),
      ...deliveryStatus(order, plannedFinish, today)
    };
  });
}

export function deliverySummary(rows: DeliveryRow[]) {
  const closedDated = rows.filter((row) => row.status === "Closed on time" || row.status === "Closed late");
  return {
    open: rows.filter((row) => !isClosedStatus(row.status)).length,
    atRisk: rows.filter((row) => row.status === "At risk").length,
    overdue: rows.filter((row) => row.status === "Overdue").length,
    notPlanned: rows.filter((row) => row.status === "Not planned").length,
    // Share of POs closed by their delivery date; undefined until one with a delivery date is closed.
    onTimePercent: closedDated.length ? Math.round(closedDated.filter((row) => row.status === "Closed on time").length / closedDated.length * 100) : undefined
  };
}

// ---- Production Flow ----

export type LateActivity = { line: PlanLine; processName: string; end: string; daysLate: number; started: boolean };
// Open activities whose last planned day has passed, latest-planned last.
export function lateActivities(lines: PlanLine[], directory: CalendarDirectory, today: string): LateActivity[] {
  return lines.filter((line) => !line.completedAt && lineEnd(line) < today).map((line) => ({
    line, processName: calendarProcessName(directory, line.calendarId), end: lineEnd(line), daysLate: daysBetween(lineEnd(line), today), started: !!line.startedAt || line.progressQuantity !== undefined
  })).sort((a, b) => b.daysLate - a.daysLate || a.line.plannedDate.localeCompare(b.line.plannedDate));
}

// Open activities not late yet that have no machine booked.
export const unbookedActivities = (lines: PlanLine[], today: string) =>
  lines.filter((line) => !line.completedAt && lineEnd(line) >= today && (line.status === "Unscheduled" || line.status === "Partially Scheduled"))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));

// Kept for the header's conflict count and older callers: open activities not yet fully booked.
export const getUnscheduledPlanLines = (lines: PlanLine[]) => lines.filter((line) => !line.completedAt && (line.status === "Unscheduled" || line.status === "Partially Scheduled"));

export type AdherenceRow = { calendarId: string; processName: string; completed: number; onTime: number; late: number; percent: number };
// The day production says an activity was done: its result's production date, else the day it was keyed in.
export const completedOn = (line: PlanLine, actuals: Pick<ProductionActual, "planLineId" | "productionDate">[]) =>
  actuals.find((actual) => actual.planLineId === line.id)?.productionDate ?? (line.completedAt ? localDateKey(new Date(line.completedAt)) : undefined);

/** Activities completed in the period, on or before their last planned day vs after it, by process in route order. */
export function planAdherence(lines: PlanLine[], actuals: Pick<ProductionActual, "planLineId" | "productionDate">[], directory: CalendarDirectory, from: string, to: string) {
  const rows = new Map<string, AdherenceRow>();
  for (const line of lines) {
    const day = completedOn(line, actuals);
    if (!line.completedAt || !day || day < from || day > to) continue;
    const row = rows.get(line.calendarId ?? "") ?? { calendarId: line.calendarId ?? "", processName: calendarProcessName(directory, line.calendarId), completed: 0, onTime: 0, late: 0, percent: 0 };
    row.completed += 1;
    if (day <= lineEnd(line)) row.onTime += 1; else row.late += 1;
    rows.set(row.calendarId, row);
  }
  const order = directory.calendars.map((item) => item.id);
  const byProcess = [...rows.values()].map((row) => ({ ...row, percent: Math.round(row.onTime / row.completed * 100) }))
    .sort((a, b) => order.indexOf(a.calendarId) - order.indexOf(b.calendarId));
  const completed = byProcess.reduce((sum, row) => sum + row.completed, 0), onTime = byProcess.reduce((sum, row) => sum + row.onTime, 0);
  return { byProcess, completed, onTime, late: completed - onTime, percent: completed ? Math.round(onTime / completed * 100) : undefined };
}

export type WaitingWip = { transfer: WipTransfer; fromName: string; toName: string; sentOn: string; daysWaiting: number };
// Handovers not yet received, longest waiting first.
export function waitingWip(transfers: WipTransfer[], directory: CalendarDirectory, today: string): WaitingWip[] {
  return transfers.filter((item) => !item.receivedAt).map((transfer) => {
    const sentOn = localDateKey(new Date(transfer.createdAt));
    return { transfer, fromName: calendarProcessName(directory, transfer.sourceCalendarId), toName: calendarProcessName(directory, transfer.calendarId), sentOn, daysWaiting: Math.max(0, daysBetween(sentOn, today)) };
  }).sort((a, b) => b.daysWaiting - a.daysWaiting);
}

// The Monday of the week holding `day`.
export function weekStart(day: string) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDateKey(date);
}
const addDays = (day: string, days: number) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + days); return localDateKey(date); };

export type MachineLoad = { machine: Machine; weeks: { hours: number; days: number }[]; total: number };
/** Hours booked on each machine in each of `weekCount` weeks from this week's Monday, and on how many days. */
export function machineLoad(entries: ScheduleEntry[], machines: Machine[], today: string, weekCount = 4) {
  const weeks = Array.from({ length: weekCount }, (_, index) => addDays(weekStart(today), index * 7));
  const bounds = weeks.map((start) => [new Date(`${start}T00:00:00`).getTime(), new Date(`${addDays(start, 7)}T00:00:00`).getTime()] as const);
  const rows: MachineLoad[] = machines.map((machine) => {
    const own = entries.filter((entry) => entry.machineId === machine.id && entry.status !== "Cancelled");
    const cells = bounds.map(([from, to]) => {
      let ms = 0; const days = new Set<string>();
      for (const entry of own) {
        const start = Math.max(from, Date.parse(entry.startAt)), end = Math.min(to, Date.parse(entry.endAt));
        if (end <= start) continue;
        ms += end - start;
        for (let at = start; at < end; at += 864e5) days.add(localDateKey(new Date(at)));
        days.add(localDateKey(new Date(end - 1)));
      }
      return { hours: Math.round(ms / 36e5 * 10) / 10, days: days.size };
    });
    return { machine, weeks: cells, total: Math.round(cells.reduce((sum, cell) => sum + cell.hours, 0) * 10) / 10 };
  });
  return { weeks, rows: rows.sort((a, b) => b.total - a.total || a.machine.code.localeCompare(b.machine.code)) };
}

export type FlowReport = { late: LateActivity[]; unbooked: PlanLine[]; conflicts: ScheduleConflict[]; wip: WaitingWip[] };
export function flowAttention(lines: PlanLine[], entries: ScheduleEntry[], transfers: WipTransfer[], machines: Machine[], products: Product[], directory: CalendarDirectory, today: string): FlowReport {
  return { late: lateActivities(lines, directory, today), unbooked: unbookedActivities(lines, today), conflicts: findMachineConflicts(entries, machines, products), wip: waitingWip(transfers, directory, today) };
}

// ---- Batch Yield & Release ----

export type BatchRow = {
  job: JobOrder; order?: PurchaseOrder; product?: Product;
  stages: StageYield[]; final?: FinalYield;
  // A stage or the final yield outside QA's limits.
  outOfLimits: boolean;
  deviations: number;
  status: BatchStatus;
  finishedOn?: string; testedOn?: string; result?: TestResult; releasedOn?: string; rejectedOn?: string;
  // Finished to released or rejected; while waiting, finished to today.
  daysToRelease?: number; daysWaiting?: number;
  released?: { quantity: number; uom: string }; otherUses: number;
};
export const BATCH_STATUSES: { key: BatchStatus; hint: string }[] = [
  { key: "In production", hint: "Not all processes are finished" },
  { key: "Awaiting testing", hint: "Finished, waiting for QC's result" },
  { key: "Under investigation", hint: "QC is investigating a result" },
  { key: "Failed testing", hint: "Failed, waiting for QA to reject" },
  { key: "Awaiting release", hint: "Passed, waiting for QA's release" },
  { key: "Released", hint: "Released by QA" },
  { key: "Rejected", hint: "Rejected by QA" }
];
// Made and waiting on QC or QA: not yet saleable.
export const inQuarantine = (status: BatchStatus) => ["Awaiting testing", "Under investigation", "Failed testing", "Awaiting release"].includes(status);

export function batchReport(jobs: JobOrder[], orders: PurchaseOrder[], lines: PlanLine[], transfers: WipTransfer[], actuals: Pick<ProductionActual, "planLineId" | "hasDeviation">[], directory: CalendarDirectory, products: Product[], limits: YieldLimits | undefined, today: string): BatchRow[] {
  const day = (value?: string) => value ? localDateKey(new Date(value)) : undefined;
  return jobs.flatMap((job) => jobParts(job).map((part) => {
    const order = orders.find((item) => item.id === part.orderId);
    const yields = batchYield(job, part.orderId, lines, orders, directory, limits);
    const status = batchStatus(job, lines, transfers);
    const release = releaseFor(job, part.orderId);
    const finished = day(finishedOn(job, lines, transfers));
    const releasedOn = day(release?.releasedAt), rejectedOn = day(job.rejectedAt);
    const closedOn = releasedOn ?? rejectedOn;
    // The batch's common processes, and this PO's own filling and packing.
    const jobLineIds = new Set(lines.filter((line) => line.jobOrderId === job.id && (line.productionOrderId === part.orderId || !isPerOrderLine(line, directory))).map((line) => line.id));
    return {
      job, order, product: products.find((item) => item.id === order?.productId),
      stages: yields.stages, final: yields.final,
      outOfLimits: yields.stages.some((stage) => stage.tone === "out") || yields.final?.tone === "out",
      deviations: actuals.filter((actual) => actual.hasDeviation && jobLineIds.has(actual.planLineId)).length,
      status, finishedOn: finished, testedOn: day(job.testedAt), result: testResult(job), releasedOn, rejectedOn,
      ...(finished && closedOn ? { daysToRelease: Math.max(0, daysBetween(finished, closedOn)) } : {}),
      ...(finished && !closedOn && inQuarantine(status) ? { daysWaiting: Math.max(0, daysBetween(finished, today)) } : {}),
      ...(release ? { released: { quantity: release.quantity, uom: release.uom } } : {}),
      otherUses: Number((release?.otherUses ?? []).reduce((sum, use) => sum + use.quantity, 0).toPrecision(12))
    };
  }));
}

export function batchSummary(rows: BatchRow[]) {
  const finals = rows.map((row) => row.final?.percent).filter((value): value is number => value !== undefined);
  const turnarounds = rows.map((row) => row.releasedOn ? row.daysToRelease : undefined).filter((value): value is number => value !== undefined);
  return {
    averageFinal: finals.length ? Math.round(finals.reduce((sum, value) => sum + value, 0) / finals.length * 10) / 10 : undefined,
    outOfLimits: rows.filter((row) => row.outOfLimits).length,
    quarantine: rows.filter((row) => inQuarantine(row.status)).length,
    averageDaysToRelease: turnarounds.length ? Math.round(turnarounds.reduce((sum, value) => sum + value, 0) / turnarounds.length * 10) / 10 : undefined
  };
}

// Whether an order belongs to the reports' stream choice (production, non-production or both).
export const inStreams = (order: PurchaseOrder | undefined, streams: { production: boolean; nonProduction: boolean }) => isNonProduction(order) ? streams.nonProduction : streams.production;
