import type { PlanLine, PlanLineStatus, ScheduleEntry } from "@/lib/domain/types";

const scheduleCountsByPlanLine = (entries: ScheduleEntry[]) => {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.planLineId || entry.status === "Cancelled") {
      continue;
    }

    counts.set(entry.planLineId, (counts.get(entry.planLineId) ?? 0) + 1);
  }

  return counts;
};

export function derivePlanLineStatus(line: PlanLine, entries: ScheduleEntry[]): PlanLineStatus {
  const count = scheduleCountsByPlanLine(entries).get(line.id) ?? 0;

  if (count === 0) {
    return "Unscheduled";
  }

  return count > 1 || line.status === "Fully Scheduled" ? "Fully Scheduled" : "Partially Scheduled";
}

export function syncPlanLineStatuses(lines: PlanLine[], entries: ScheduleEntry[]): PlanLine[] {
  return lines.map((line) => ({
    ...line,
    status: derivePlanLineStatus(line, entries)
  }));
}

export function validateScheduleEntry(entry: Pick<ScheduleEntry, "startAt" | "endAt">): string[] {
  const errors: string[] = [];
  const start = new Date(entry.startAt);
  const end = new Date(entry.endAt);

  if (Number.isNaN(start.getTime())) {
    errors.push("Start time is required.");
  }

  if (Number.isNaN(end.getTime())) {
    errors.push("End time is required.");
  }

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
    errors.push("End time must be later than start time.");
  }

  return errors;
}
