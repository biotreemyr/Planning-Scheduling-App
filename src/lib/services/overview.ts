import type { CalendarDirectory, UnitCalendar } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, ScheduleEntry } from "@/lib/domain/types";
import { localDateKey } from "./calendarPrint";
import { batchStatus, type BatchStatus, type JobOrder } from "./jobOrders";
import { orderProcessRows, orderProgress, type OrderStatus, type PurchaseOrder } from "./orders";
import { calendarProcessName } from "./processSetup";
import { lineEnd } from "./scheduling";
import { spanDays, type WorkingCalendar } from "./workingDays";
import { batchYield, type YieldLimits, type YieldRange } from "./yields";

/**
 * Reports → Overview: the unit's key production figures for a month, quarter or year, worked out
 * from the workspace (activities, machine bookings, POs, job orders, QA's yield limits, off days).
 * Figures about the period count what was planned or finished in it; "now" figures (late work,
 * overdue POs, batches waiting) are as of today.
 */
export type PeriodKind = "month" | "quarter" | "year";
export type Period = { kind: PeriodKind; value: string; from: string; to: string; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value: number) => String(value).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const shift = (date: string, days: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };
// A timestamp's local day; a plain day as it is.
export const dayOf = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateKey(new Date(value));
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// value: "2026-10" for a month, "2026-Q4" for a quarter, "2026" for a year.
export function periodFor(kind: PeriodKind, value: string): Period {
  const year = Number(value.slice(0, 4));
  if (kind === "year") return { kind, value, from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  if (kind === "quarter") {
    const quarter = Number(value.slice(6)) || 1;
    const first = quarter * 3 - 2, last = quarter * 3;
    return { kind, value, from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${lastDay(year, last)}`, label: `Q${quarter} ${year}` };
  }
  const month = Number(value.slice(5, 7)) || 1;
  return { kind, value, from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${lastDay(year, month)}`, label: monthLabel(value) };
}

export const periodValue = (kind: PeriodKind, date: string) => kind === "year" ? date.slice(0, 4) : kind === "quarter" ? `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}` : date.slice(0, 7);

// The periods to choose from, newest first: from the earliest planned day (or today) to the latest
// planned day (or today), so next month's plan can be looked at too.
export function periodChoices(kind: PeriodKind, today: string, dates: string[]): { value: string; label: string }[] {
  const sorted = [...dates, today].filter(Boolean).sort();
  const values = new Set<string>();
  for (let month = sorted[0].slice(0, 7); month <= sorted.at(-1)!.slice(0, 7);) {
    values.add(periodValue(kind, `${month}-01`));
    const [year, number] = month.split("-").map(Number);
    month = number === 12 ? `${year + 1}-01` : `${year}-${pad(number + 1)}`;
  }
  return [...values].sort().reverse().map((value) => ({ value, label: periodFor(kind, value).label }));
}

// The bars along the period: weeks (from Monday) for a month, months for a quarter or year.
export function periodSlots(period: Period): { label: string; from: string; to: string }[] {
  if (period.kind !== "month") {
    const slots = [];
    for (let month = period.from.slice(0, 7); month <= period.to.slice(0, 7);) {
      const [year, number] = month.split("-").map(Number);
      slots.push({ label: MONTHS[number - 1], from: `${month}-01`, to: `${month}-${lastDay(year, number)}` });
      month = number === 12 ? `${year + 1}-01` : `${year}-${pad(number + 1)}`;
    }
    return slots;
  }
  const slots = [];
  for (let from = period.from; from <= period.to;) {
    const weekday = new Date(`${from}T12:00:00Z`).getUTCDay();
    const sunday = shift(from, (7 - weekday) % 7);
    const to = sunday < period.to ? sunday : period.to;
    slots.push({ label: `${from.slice(8, 10)}/${from.slice(5, 7)}`, from, to });
    from = shift(to, 1);
  }
  return slots;
}

const overlaps = (line: Pick<PlanLine, "plannedDate" | "endDate">, from: string, to: string) => line.plannedDate <= to && lineEnd(line) >= from;
const inRange = (date: string | undefined, from: string, to: string) => !!date && date >= from && date <= to;

export type ProcessActivity = { calendarId: string; processName: string; planned: number; completed: number };
export type ProcessYield = { calendarId: string; processName: string; stages: number; average?: number; lowest?: number; highest?: number; limit?: YieldRange; ok: number; near: number; out: number; none: number };
export type MachineUse = { machineId: string; name: string; daysBooked: number; workingDays: number; percent: number };
export type LateActivity = { line: PlanLine; processName: string; jobNumber?: string; batchNumber?: string; daysLate: number };
export type OrderCounts = Record<OrderStatus, number>;
export const ORDER_STATUSES: OrderStatus[] = ["Completed", "In production", "Scheduled", "Not scheduled"];
// Batches still on their way: released and rejected ones are counted for the period instead.
export const OPEN_BATCH_STATUSES: BatchStatus[] = ["In production", "Awaiting testing", "Under investigation", "Failed testing", "Awaiting release"];

export type OverviewInput = {
  // The activities and bookings in scope (the unit's processes shown), and every activity for routes.
  lines: PlanLine[]; entries: ScheduleEntry[]; allLines: PlanLine[];
  orders: PurchaseOrder[]; jobs: JobOrder[]; transfers: { sourceLineId: string }[];
  calendars: UnitCalendar[]; machines: Machine[]; directory: CalendarDirectory;
  workDays: WorkingCalendar; yieldLimits?: YieldLimits; period: Period; today: string;
};

export function productionOverview(input: OverviewInput) {
  const { lines, entries, allLines, orders, jobs, transfers, calendars, machines, directory, workDays, yieldLimits, period, today } = input;
  const { from, to } = period;
  const inPeriod = lines.filter((line) => overlaps(line, from, to));
  const done = (line: PlanLine) => !!line.completedAt;

  const byProcess: ProcessActivity[] = calendars.map((calendar) => {
    const own = inPeriod.filter((line) => line.calendarId === calendar.id);
    return { calendarId: calendar.id, processName: calendarProcessName(directory, calendar.id), planned: own.length, completed: own.filter(done).length };
  });
  // Each activity in the slot its planned (first) day falls in, so none is counted twice.
  const bySlot = periodSlots(period).map((slot) => {
    const own = inPeriod.filter((line) => inRange(line.plannedDate < from ? from : line.plannedDate, slot.from, slot.to));
    return { ...slot, planned: own.length, completed: own.filter(done).length };
  });

  const late: LateActivity[] = lines.filter((line) => !line.completedAt && lineEnd(line) < today).map((line) => {
    const job = jobs.find((item) => item.id === line.jobOrderId);
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lineEnd(line)}T12:00:00Z`)) / 864e5);
    return { line, processName: calendarProcessName(directory, line.calendarId), jobNumber: job?.number, batchNumber: job?.batchNumber, daysLate: days };
  }).sort((a, b) => lineEnd(b.line).localeCompare(lineEnd(a.line)) || b.line.plannedDate.localeCompare(a.line.plannedDate));

  // Yield: each process stage of a batch finished in the period, its % of theoretical against QA's limit.
  const calendarIds = new Set(calendars.map((item) => item.id));
  const jobIds = new Set(lines.map((line) => line.jobOrderId).filter(Boolean));
  const scopedJobs = jobs.filter((job) => jobIds.has(job.id));
  const yields = new Map<string, { values: number[]; tone: Record<"ok" | "near" | "out" | "none", number>; limit?: YieldRange }>();
  for (const job of scopedJobs) {
    for (const stage of batchYield(job, job.orderId, allLines, orders, directory, yieldLimits).stages) {
      if (!calendarIds.has(stage.calendarId) || !stage.done || stage.ofTheoretical === undefined) continue;
      const finished = allLines.filter((line) => line.jobOrderId === job.id && line.calendarId === stage.calendarId && line.completedAt).map((line) => dayOf(line.completedAt!)).sort().at(-1);
      if (!inRange(finished, from, to)) continue;
      const current = yields.get(stage.calendarId) ?? { values: [], tone: { ok: 0, near: 0, out: 0, none: 0 }, limit: stage.limit };
      current.values.push(stage.ofTheoretical);
      current.tone[stage.tone] += 1;
      yields.set(stage.calendarId, current);
    }
  }
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const yieldByProcess: ProcessYield[] = calendars.map((calendar) => {
    const found = yields.get(calendar.id);
    const values = found?.values ?? [];
    return {
      calendarId: calendar.id, processName: calendarProcessName(directory, calendar.id), stages: values.length,
      average: values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined,
      lowest: values.length ? round1(Math.min(...values)) : undefined, highest: values.length ? round1(Math.max(...values)) : undefined,
      limit: found?.limit ?? yieldLimits?.byProcess[calendar.processId], ...(found?.tone ?? { ok: 0, near: 0, out: 0, none: 0 })
    };
  });
  const yieldTones = yieldByProcess.reduce((sum, row) => ({ ok: sum.ok + row.ok, near: sum.near + row.near, out: sum.out + row.out, none: sum.none + row.none }), { ok: 0, near: 0, out: 0, none: 0 });

  // Machine use: the working days in the period each machine is booked on, out of the period's working days.
  const days = spanDays(workDays, from, to);
  const workingDates = new Set<string>();
  for (let date = from; date <= to; date = shift(date, 1)) if (!days.off.some((item) => item.date === date)) workingDates.add(date);
  const machineUse: MachineUse[] = machines.filter((machine) => machine.active === "Active" || entries.some((entry) => entry.machineId === machine.id)).map((machine) => {
    const booked = new Set<string>();
    for (const entry of entries) {
      if (entry.machineId !== machine.id || entry.status === "Cancelled") continue;
      for (let date = dayOf(entry.startAt); date <= dayOf(entry.endAt); date = shift(date, 1)) if (workingDates.has(date)) booked.add(date);
    }
    return { machineId: machine.id, name: machine.name, daysBooked: booked.size, workingDays: days.working, percent: days.working ? Math.round(booked.size / days.working * 100) : 0 };
  }).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));

  // POs of these processes: those due (delivery date) in the period by status, and those overdue now.
  const orderIds = new Set(lines.map((line) => line.productionOrderId).filter(Boolean));
  const progress = orders.filter((order) => orderIds.has(order.id)).map((order) => ({ order, progress: orderProgress(order, orderProcessRows(order, allLines, directory), today, allLines) }));
  const ordersDue = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as OrderCounts;
  for (const item of progress) if (inRange(item.order.deliveryDate, from, to)) ordersDue[item.progress.status] += 1;
  const ordersOverdue = progress.filter((item) => item.progress.overdue).length;

  const batches = Object.fromEntries(OPEN_BATCH_STATUSES.map((status) => [status, 0])) as Record<BatchStatus, number>;
  for (const job of scopedJobs) { const status = batchStatus(job, allLines, transfers); if (status in batches) batches[status] += 1; }
  const released = scopedJobs.filter((job) => job.releasedAt && inRange(dayOf(job.releasedAt), from, to)).length;

  const offDays = {
    working: days.working,
    overtime: [...workingDates].filter((date) => workDays.specialDays.some((day) => day.date === date && day.kind === "working")).length,
    closed: days.off.filter((item) => item.status.kind === "closed").length,
    holidays: days.off.filter((item) => item.status.kind === "holiday").length,
    weeklyOff: days.off.filter((item) => item.status.kind === "weekly-off").length
  };

  return {
    activities: { planned: inPeriod.length, completed: inPeriod.filter(done).length },
    byProcess, bySlot, late, yieldByProcess, yieldTones, machineUse,
    ordersDue, ordersOverdue, batches, released, offDays
  };
}
export type ProductionOverview = ReturnType<typeof productionOverview>;
