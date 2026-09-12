import type { PlanLine } from "@/lib/domain/types";
import { localDateKey } from "./calendarPrint";

export function monthDates(date: string): string[] {
  const start = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(start.getTime())) return [];
  const count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => localDateKey(new Date(start.getFullYear(), start.getMonth(), index + 1, 12)));
}

export function canMovePlan(line: PlanLine | undefined, canPlan: boolean) {
  return canPlan && !!line && !line.completedAt;
}
