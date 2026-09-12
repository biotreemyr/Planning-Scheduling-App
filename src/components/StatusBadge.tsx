import type { PlanLineStatus, Priority, ProductionPlanStatus, ScheduleEntryStatus } from "@/lib/domain/types";

type BadgeKind =
  | ScheduleEntryStatus
  | PlanLineStatus
  | ProductionPlanStatus
  | Priority
  | "Conflict"
  | "Active"
  | "Inactive";

const classByKind: Record<string, string> = {
  Draft: "badge neutral",
  Proposed: "badge info",
  Accepted: "badge success",
  Archived: "badge muted",
  Unscheduled: "badge warning",
  "Partially Scheduled": "badge info",
  "Fully Scheduled": "badge success",
  Confirmed: "badge info",
  "In Progress": "badge amber",
  Completed: "badge success",
  Blocked: "badge danger",
  Cancelled: "badge muted",
  Low: "badge muted",
  Normal: "badge neutral",
  High: "badge amber",
  Urgent: "badge danger",
  Conflict: "badge danger",
  Active: "badge success",
  Inactive: "badge muted"
};

export function StatusBadge({ value }: { value: BadgeKind }) {
  return <span className={classByKind[value] ?? "badge neutral"}>{value}</span>;
}
