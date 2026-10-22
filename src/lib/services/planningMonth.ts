import type { PlanLine } from "@/lib/domain/types";
import { localDateKey } from "./calendarPrint";
import { daysBetween, lineEnd, shiftTimestamp } from "./scheduling";

export function monthDates(date: string): string[] {
  const start = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(start.getTime())) return [];
  const count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => localDateKey(new Date(start.getFullYear(), start.getMonth(), index + 1, 12)));
}

export function canMovePlan(line: PlanLine | undefined, canPlan: boolean) {
  return canPlan && !!line;
}

/**
 * The day a month's list shows an activity's card: its start day, or the month's first day for one
 * carried in from the month before (it started earlier and is still running). Undefined when the
 * activity is not on any day of the month.
 */
export function shownOn(line: PlanLine, dates: string[]) {
  const first = dates[0], last = dates.at(-1);
  if (!first || !last || line.plannedDate > last || lineEnd(line) < first) return undefined;
  return line.plannedDate < first ? first : line.plannedDate;
}

// Dropping a card shown on `shown` onto `target` moves the activity by the same number of days.
export function movedStart(line: PlanLine, shown: string, target: string) {
  return shiftTimestamp(`${line.plannedDate}T12:00`, daysBetween(shown, target)).slice(0, 10);
}
