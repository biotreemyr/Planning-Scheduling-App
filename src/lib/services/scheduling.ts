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

// Move a booking timestamp by whole days, keeping its time of day and its stored format
// (UTC ISO strings stay UTC; local "YYYY-MM-DDTHH:mm" values stay local).
export function shiftTimestamp(value: string, days: number): string {
  const date = new Date(value);
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(date.getTime() + days * 86400000).toISOString();
  date.setDate(date.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}
