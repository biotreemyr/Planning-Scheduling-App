export const APP_KEY = "scheduler";

export const permissions = {
  view: "scheduler.board.view",
  createPlanLine: "scheduler.plan.create",
  editPlanLine: "scheduler.plan.edit",
  createEntry: "scheduler.schedule.create",
  editEntry: "scheduler.schedule.edit",
  cancelEntry: "scheduler.schedule.cancel",
  confirmEntry: "scheduler.schedule.approve",
  reports: "scheduler.reports.view",
  manageMasterData: "scheduler.master.manage"
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];
export type BioTreeUser = {
  id: string;
  clerkUserId: string;
  active: boolean;
  apps: { appKey: string; active: boolean; assigned: boolean; permissions: string[]; teamIds?: string[] }[];
};

// Rendering hint only. Server guards independently check fresh Core access.
export function can(user: BioTreeUser | null, permission: Permission): boolean {
  return Boolean(user?.active && user.apps.some((app) =>
    app.appKey === APP_KEY && app.active && app.assigned && app.permissions.includes(permission)
  ));
}
