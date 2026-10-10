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
  manageMasterData: "scheduler.master_data.manage",
  // Per-feature access added in Core migration 0011: view, create, edit and print per feature.
  printPlanning: "scheduler.planning.print",
  viewOrders: "scheduler.orders.view",
  createOrders: "scheduler.orders.create",
  editOrders: "scheduler.orders.edit",
  printOrders: "scheduler.orders.print",
  viewTesting: "scheduler.testing.view",
  passTesting: "scheduler.testing.edit",
  printTesting: "scheduler.testing.print",
  viewRelease: "scheduler.release.view",
  releaseBatches: "scheduler.release.edit",
  printRelease: "scheduler.release.print"
} as const;

// Opening the workspace at all needs at least one of these.
export const boardPermissions = [permissions.viewPlanning, permissions.viewSchedule, permissions.viewOrders, permissions.viewTesting, permissions.viewRelease] as const;

// Still open to everyone under open access: production updates (the detailed schedule) and reports.
// Everything else, Planner Board, Orders, QA/QC and Admin, is granted only as ticked in Core, so
// "view" alone means look only.
const openKeys = new Set<string>([permissions.viewSchedule, permissions.editEntry, permissions.submitEntry, permissions.reviewEntry, permissions.cancelEntry, permissions.confirmEntry, permissions.reports]);
const coreOnly = new Set<string>(Object.values(permissions).filter((key) => !openKeys.has(key)));

/**
 * What a signed-in user may do in the scheduler. While SCHEDULER_OPEN_ACCESS is "true", anyone who
 * can open the scheduler from Core may record production and see reports without roles being set
 * up; the Planner Board, Orders, QA/QC and Admin follow Core's ticks. Otherwise every Core
 * permission applies exactly as granted.
 */
export function effectivePermissions(granted: readonly string[], env: Record<string, string | undefined> = process.env) {
  if (env.SCHEDULER_OPEN_ACCESS !== "true") return [...granted];
  const everyday = Object.values(permissions).filter((key) => !coreOnly.has(key));
  return [...new Set<string>([...everyday, ...granted.filter((key) => coreOnly.has(key))])];
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
