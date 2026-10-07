export const APP_KEY = "scheduler";

// These are Core's permission_key values, not names chosen here. Core owns the
// list (bio-tree-dashboard/migrations/0003 and 0007) and grants them through
// app roles and the per-user permission picker. Renaming one here silently
// denies everyone holding it, so change Core first and follow.
export const permissions = {
  viewPlanning: "scheduler.planning.view",
  viewSchedule: "scheduler.schedule.view",
  createPlanLine: "scheduler.planning.create",
  editPlanLine: "scheduler.planning.edit",
  // Core has no separate schedule-create key; creating and editing an entry are
  // the same grant there. Split them again only when Core defines the key.
  createEntry: "scheduler.schedule.edit",
  editEntry: "scheduler.schedule.edit",
  submitEntry: "scheduler.schedule.submit",
  reviewEntry: "scheduler.schedule.review",
  cancelEntry: "scheduler.schedule.cancel",
  confirmEntry: "scheduler.schedule.approve",
  reports: "scheduler.reports.view",
  manageMasterData: "scheduler.master_data.manage"
} as const;

// Opening the workspace at all needs at least one of these.
export const boardPermissions = [permissions.viewPlanning, permissions.viewSchedule] as const;

/**
 * What a signed-in user may do in the scheduler. While SCHEDULER_OPEN_ACCESS is "true", anyone who
 * can open the scheduler from Core may plan, edit orders and record production without roles being
 * set up; Admin (master data) still follows Core: tick "Manage scheduler master data" for a person
 * in Core to give them the Admin tab. Otherwise their Core permissions apply as granted.
 */
export function effectivePermissions(granted: readonly string[], env: Record<string, string | undefined> = process.env) {
  if (env.SCHEDULER_OPEN_ACCESS !== "true") return [...granted];
  const everyday = Object.values(permissions).filter((key) => key !== permissions.manageMasterData);
  return [...new Set<string>([...everyday, ...granted.filter((key) => key === permissions.manageMasterData)])];
}

export type Permission = (typeof permissions)[keyof typeof permissions];
export type BioTreeUser = {
  id: string;
  clerkUserId: string;
  // Display name from Core, for showing who is signed in and for the audit log.
  name?: string;
  active: boolean;
  apps: { appKey: string; active: boolean; assigned: boolean; permissions: string[]; teamIds?: string[] }[];
};

// Rendering hint only. Server guards independently check fresh Core access.
export function can(user: BioTreeUser | null, permission: Permission): boolean {
  return Boolean(user?.active && user.apps.some((app) =>
    app.appKey === APP_KEY && app.active && app.assigned && app.permissions.includes(permission)
  ));
}

export function canAny(user: BioTreeUser | null, allowed: readonly Permission[]): boolean {
  return allowed.some((permission) => can(user, permission));
}
