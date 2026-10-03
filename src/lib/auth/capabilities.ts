import { permissions } from "./permissions";

// What a person may do in the workspace. In Core mode this comes only from Core
// permission keys; in the local demo it comes from the demo role.
export type WorkspaceCapabilities = {
  manage: boolean; createPlan: boolean; editPlan: boolean; produce: boolean;
  approve: boolean; cancel: boolean; reports: boolean;
};

export function capabilitiesFromPermissions(granted: readonly string[]): WorkspaceCapabilities {
  const has = (key: string) => granted.includes(key);
  return {
    manage: has(permissions.manageMasterData),
    createPlan: has(permissions.createPlanLine),
    editPlan: has(permissions.editPlanLine),
    produce: has(permissions.editEntry),
    approve: has(permissions.confirmEntry),
    cancel: has(permissions.cancelEntry),
    reports: has(permissions.reports)
  };
}

// The local demo keeps its illustrative roles; it is never used for live access.
export function capabilitiesForDemoRole(role: "admin" | "planner" | "production"): WorkspaceCapabilities {
  return {
    manage: role === "admin", createPlan: role !== "production", editPlan: role !== "production", produce: role === "production",
    approve: true, cancel: true, reports: true
  };
}
