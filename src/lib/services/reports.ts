import type { PlanLine, ScheduleEntry } from "@/lib/domain/types";
import { findMachineConflicts } from "@/lib/services/conflicts";
import type { Machine, Product } from "@/lib/domain/types";

// Machine bookings per process (dispensing, blending...), with their scheduled hours.
export type ProcessLoad = {
  calendarId: string;
  processName: string;
  confirmedHours: number;
  entryCount: number;
};

function hoursBetween(startAt: string, endAt: string) {
  return Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 36e5);
}

export function getUnscheduledPlanLines(lines: PlanLine[]) {
  return lines.filter((line) => !line.completedAt && (line.status === "Unscheduled" || line.status === "Partially Scheduled"));
}

export function getProcessLoad(entries: ScheduleEntry[], processName: (calendarId: string) => string): ProcessLoad[] {
  const totals = new Map<string, { hours: number; count: number }>();
  for (const entry of entries) {
    if (entry.status === "Cancelled") continue;
    const key = entry.calendarId ?? "";
    const current = totals.get(key) ?? { hours: 0, count: 0 };
    current.hours += hoursBetween(entry.startAt, entry.endAt);
    current.count += 1;
    totals.set(key, current);
  }
  return [...totals].map(([calendarId, total]) => ({ calendarId, processName: calendarId ? processName(calendarId) : "No process", confirmedHours: Math.round(total.hours * 10) / 10, entryCount: total.count }));
}

export function getScheduleReport(
  lines: PlanLine[],
  entries: ScheduleEntry[],
  processName: (calendarId: string) => string,
  machines: Machine[],
  products: Product[]
) {
  const conflicts = findMachineConflicts(entries, machines, products);
  const completed = entries.filter((entry) => entry.status === "Completed").length;

  return {
    unscheduledLines: getUnscheduledPlanLines(lines),
    conflicts,
    processLoad: getProcessLoad(entries, processName),
    completed,
    totalEntries: entries.length
  };
}
