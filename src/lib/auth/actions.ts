import "server-only";
import { requirePermission, requireTeamPermission } from "./guards";
import { permissions, type BioTreeUser, type Permission } from "./permissions";
import type { ScheduleEntryStatus } from "@/lib/domain/types";

export const actionPermissions = {
  readBoard: permissions.view,
  createPlanLine: permissions.createPlanLine,
  movePlanLine: permissions.editPlanLine,
  createEntry: permissions.createEntry,
  duplicateEntry: permissions.createEntry,
  editEntry: permissions.editEntry,
  cancelEntry: permissions.cancelEntry,
  confirmEntry: permissions.confirmEntry,
  readReports: permissions.reports,
  manageMasterData: permissions.manageMasterData
} as const;

export function statusPermission(status: ScheduleEntryStatus): Permission {
  if (status === "Cancelled") return permissions.cancelEntry;
  if (status === "Confirmed") return permissions.confirmEntry;
  return permissions.editEntry;
}

// Future server routes/actions wrap persistence with this guard. Use the Core
// actor for audit records, never a browser-submitted changedBy field.
export async function withPermission<T>(permission: Permission, work: (actor: BioTreeUser) => Promise<T>): Promise<T> {
  const actor = await requirePermission(permission);
  return work(actor);
}

// Future repositories must use both id and this scope on reads/updates/deletes.
// Creates set teamId from this validated scope, not from a separate request body.
export async function withTeamPermission<T>(permission: Permission, teamId: string,
  work: (context: { actor: BioTreeUser; where: { teamId: string } }) => Promise<T>): Promise<T> {
  return work(await requireTeamPermission(permission, teamId));
}
