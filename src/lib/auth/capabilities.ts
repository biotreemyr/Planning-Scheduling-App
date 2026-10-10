import { permissions } from "./permissions";

// What a person may do in the workspace. In Core mode this comes only from Core
// permission keys; in the local demo it comes from the demo role.
export type WorkspaceCapabilities = {
  manage: boolean; createPlan: boolean; editPlan: boolean; produce: boolean;
  approve: boolean; cancel: boolean; reports: boolean;
  printPlan: boolean;
  viewOrders: boolean; createOrders: boolean; editOrders: boolean; printOrders: boolean;
  viewTesting: boolean; passTesting: boolean; printTesting: boolean;
  viewRelease: boolean; release: boolean; printRelease: boolean;
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
    reports: has(permissions.reports),
    printPlan: has(permissions.printPlanning),
    viewOrders: has(permissions.viewOrders), createOrders: has(permissions.createOrders), editOrders: has(permissions.editOrders), printOrders: has(permissions.printOrders),
    viewTesting: has(permissions.viewTesting), passTesting: has(permissions.passTesting), printTesting: has(permissions.printTesting),
    viewRelease: has(permissions.viewRelease), release: has(permissions.releaseBatches), printRelease: has(permissions.printRelease)
  };
}

// The local demo keeps its illustrative roles; it is never used for live access.
export function capabilitiesForDemoRole(role: "admin" | "planner" | "production"): WorkspaceCapabilities {
  return {
    manage: role === "admin", createPlan: role !== "production", editPlan: role !== "production", produce: role === "production",
    approve: true, cancel: true, reports: true, printPlan: true,
    // Planners own orders; production tests and releases finished batches; everyone may look.
    viewOrders: true, createOrders: role !== "production", editOrders: role !== "production", printOrders: true,
    viewTesting: true, passTesting: role !== "planner", printTesting: true,
    viewRelease: true, release: role !== "planner", printRelease: true
  };
}
