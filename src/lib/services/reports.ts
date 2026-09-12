import type { PlanLine, ScheduleEntry, WorkCentre } from "@/lib/domain/types";
import { findMachineConflicts } from "@/lib/services/conflicts";
import type { Machine, Product } from "@/lib/domain/types";

export type WorkCentreLoad = {
  workCentreId: string;
  workCentreName: string;
  confirmedHours: number;
  entryCount: number;
};

function hoursBetween(startAt: string, endAt: string) {
  return Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 36e5);
}

export function getUnscheduledPlanLines(lines: PlanLine[]) {
  return lines.filter((line) => !line.completedAt && (line.status === "Unscheduled" || line.status === "Partially Scheduled"));
}

export function getWorkCentreLoad(entries: ScheduleEntry[], workCentres: WorkCentre[]): WorkCentreLoad[] {
  const totals = new Map<string, { hours: number; count: number }>();

  for (const entry of entries) {
    if (entry.status === "Cancelled") {
      continue;
    }

    const current = totals.get(entry.workCentreId) ?? { hours: 0, count: 0 };
    current.hours += hoursBetween(entry.startAt, entry.endAt);
    current.count += 1;
    totals.set(entry.workCentreId, current);
  }

  return workCentres.map((workCentre) => {
    const total = totals.get(workCentre.id) ?? { hours: 0, count: 0 };
    return {
      workCentreId: workCentre.id,
      workCentreName: workCentre.name,
      confirmedHours: Math.round(total.hours * 10) / 10,
      entryCount: total.count
    };
  });
}

export function getScheduleReport(
  lines: PlanLine[],
  entries: ScheduleEntry[],
  workCentres: WorkCentre[],
  machines: Machine[],
  products: Product[]
) {
  const conflicts = findMachineConflicts(entries, machines, products);
  const completed = entries.filter((entry) => entry.status === "Completed").length;

  return {
    unscheduledLines: getUnscheduledPlanLines(lines),
    conflicts,
    workCentreLoad: getWorkCentreLoad(entries, workCentres),
    completed,
    totalEntries: entries.length
  };
}
