import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthGuards, requirePermission } from "@/lib/auth/guards";
import { boardPermissions, can, permissions, type BioTreeUser } from "@/lib/auth/permissions";
import { getAuthMode, getCoreDirectoryConfig, getSignInUrl } from "@/lib/auth/config";
import { statusPermission, withPermission } from "@/lib/auth/actions";

const user = (): BioTreeUser => ({
  id: "core-1", clerkUserId: "clerk-1", active: true,
  apps: [{ appKey: "scheduler", active: true, assigned: true, permissions: [permissions.viewPlanning] }]
});
const guards = (profile: BioTreeUser | null, session: string | null = "clerk-1") => createAuthGuards({
  getClerkUserId: async () => session,
  findUserByClerkId: async () => profile
});

describe("Core authorization boundary", () => {
  it("requires a verified session before looking up Core", async () => {
    const lookup = vi.fn();
    const auth = createAuthGuards({ getClerkUserId: async () => null, findUserByClerkId: lookup });
    await expect(auth.requireAppAccess()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each(["missing", "inactive", "unassigned", "disabled-app", "other-app", "mismatched-id"])("denies %s", async (scenario) => {
    const profile = user();
    if (scenario === "inactive") profile.active = false;
    if (scenario === "unassigned") profile.apps[0].assigned = false;
    if (scenario === "disabled-app") profile.apps[0].active = false;
    if (scenario === "other-app") profile.apps[0].appKey = "inventory";
    if (scenario === "mismatched-id") profile.clerkUserId = "someone-else";
    await expect(guards(scenario === "missing" ? null : profile).requirePermission(permissions.viewPlanning)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("allows only explicitly granted scheduler permissions", async () => {
    const auth = guards(user());
    await expect(auth.requirePermission(permissions.viewPlanning)).resolves.toMatchObject({ id: "core-1" });
    await expect(auth.requirePermission(permissions.cancelEntry)).rejects.toMatchObject({ code: "forbidden" });
    await expect(auth.requireAppAccess("inventory")).rejects.toMatchObject({ code: "forbidden" });
    expect(can(user(), permissions.viewPlanning)).toBe(true);
    expect(can(null, permissions.viewPlanning)).toBe(false);
  });
  it("rechecks access after revocation", async () => {
    const profile = user();
    const auth = guards(profile);
    await auth.requirePermission(permissions.viewPlanning);
    profile.active = false;
    await expect(auth.requirePermission(permissions.viewPlanning)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("denies every request while Core is unconfigured", async () => {
    const work = vi.fn();
    await expect(withPermission(permissions.createEntry, work)).rejects.toMatchObject({ code: "unavailable" });
    expect(work).not.toHaveBeenCalled();
    await expect(requirePermission(permissions.viewPlanning)).rejects.toMatchObject({ code: "unavailable" });
  });
  it("uses dedicated permissions for confirmation and cancellation", () => {
    expect(statusPermission("Confirmed")).toBe(permissions.confirmEntry);
    expect(statusPermission("Cancelled")).toBe(permissions.cancelEntry);
    expect(statusPermission("In Progress")).toBe(permissions.editEntry);
  });
  it("defaults production to Core and refuses production demo access", () => {
    expect(getAuthMode({ NODE_ENV: "production" })).toBe("core");
    expect(getAuthMode({ NODE_ENV: "development" })).toBe("demo");
    expect(() => getAuthMode({ NODE_ENV: "production", SCHEDULER_AUTH_MODE: "demo" })).toThrow();
    expect(() => getAuthMode({ NODE_ENV: "development", SCHEDULER_AUTH_MODE: "typo" })).toThrow();
    expect(() => getSignInUrl({ NODE_ENV: "production", BIO_TREE_CORE_SIGN_IN_URL: "javascript:alert(1)" })).toThrow();
    expect(getSignInUrl({ NODE_ENV: "production", BIO_TREE_CORE_SIGN_IN_URL: "https://core.example/sign-in" })).toBe("https://core.example/sign-in");
  });
  it("opens the workspace for either board read, and for neither", async () => {
    const planner = user();
    await expect(guards(planner).requireAnyPermission(boardPermissions)).resolves.toMatchObject({ id: "core-1" });
    const production = user();
    production.apps[0].permissions = [permissions.viewSchedule];
    await expect(guards(production).requireAnyPermission(boardPermissions)).resolves.toMatchObject({ id: "core-1" });
    const reporter = user();
    reporter.apps[0].permissions = [permissions.reports];
    await expect(guards(reporter).requireAnyPermission(boardPermissions)).rejects.toMatchObject({ code: "forbidden" });
  });
});

// Core owns these strings (bio-tree-dashboard/migrations/0003 and 0007). A key
// that drifts from Core denies everyone holding it, silently.
describe("Core contract", () => {
  it("uses the permission keys Core actually seeds", () => {
    expect(Object.values(permissions).every((key) => key.startsWith("scheduler."))).toBe(true);
    expect(permissions.viewPlanning).toBe("scheduler.planning.view");
    expect(permissions.viewSchedule).toBe("scheduler.schedule.view");
    expect(permissions.createPlanLine).toBe("scheduler.planning.create");
    expect(permissions.editPlanLine).toBe("scheduler.planning.edit");
    expect(permissions.editEntry).toBe("scheduler.schedule.edit");
    expect(permissions.confirmEntry).toBe("scheduler.schedule.approve");
    expect(permissions.cancelEntry).toBe("scheduler.schedule.cancel");
    expect(permissions.reports).toBe("scheduler.reports.view");
    expect(permissions.manageMasterData).toBe("scheduler.master_data.manage");
  });
  it("returns the signed-in user to this app without allowing an open redirect", () => {
    const env = {
      NODE_ENV: "production",
      BIO_TREE_CORE_SIGN_IN_URL: "https://core.example/sign-in",
      SCHEDULER_APP_URL: "https://scheduler.example"
    };
    expect(getSignInUrl(env, "/")).toBe("https://core.example/sign-in?redirect_url=https%3A%2F%2Fscheduler.example%2F");
    // A protocol-relative path would otherwise resolve to another origin.
    expect(getSignInUrl(env, "//evil.example/steal")).toBe("https://core.example/sign-in");
    expect(getSignInUrl(env, "https://evil.example")).toBe("https://core.example/sign-in");
    // With no configured app URL there is nothing trusted to return to.
    expect(getSignInUrl({ ...env, SCHEDULER_APP_URL: undefined }, "/")).toBe("https://core.example/sign-in");
    expect(() => getSignInUrl({ ...env, SCHEDULER_APP_URL: "http://scheduler.example" }, "/")).toThrow();
  });
  it("reads the Core directory settings, defaulting the app key and cache window", () => {
    expect(getCoreDirectoryConfig({})).toBeNull();
    expect(getCoreDirectoryConfig({ BIO_TREE_CORE_DATABASE_URL: "postgres://x/y" }))
      .toEqual({ databaseUrl: "postgres://x/y", appKey: "scheduler", cacheTtlMs: 30_000 });
    expect(getCoreDirectoryConfig({ BIO_TREE_CORE_DATABASE_URL: "postgres://x/y", BIO_TREE_CORE_CACHE_TTL_MS: "0" })?.cacheTtlMs).toBe(0);
  });
});

describe("open access while Core roles are not set up", async () => {
  const { effectivePermissions, permissions } = await import("../src/lib/auth/permissions");
  it("gives every everyday permission when SCHEDULER_OPEN_ACCESS is true, but Admin and Status only from Core", () => {
    const open = { SCHEDULER_OPEN_ACCESS: "true" };
    const coreOnly = [permissions.manageMasterData, permissions.viewTesting, permissions.passTesting, permissions.printTesting, permissions.viewRelease, permissions.releaseBatches, permissions.printRelease] as string[];
    const everyday = [...new Set(Object.values(permissions))].filter((key) => !coreOnly.includes(key)).sort();
    expect(effectivePermissions(["scheduler.planning.view"], open).sort()).toEqual(everyday);
    expect(effectivePermissions(["scheduler.planning.view", permissions.manageMasterData], open)).toContain(permissions.manageMasterData);
    // Testing and release go only to the people ticked in Core.
    expect(effectivePermissions(["scheduler.planning.view", permissions.passTesting], open)).toEqual(expect.arrayContaining([permissions.passTesting]));
    expect(effectivePermissions(["scheduler.planning.view"], open)).not.toContain(permissions.viewTesting);
    expect(effectivePermissions(["scheduler.planning.view"], {})).toEqual(["scheduler.planning.view"]);
    expect(effectivePermissions(["scheduler.planning.view"], { SCHEDULER_OPEN_ACCESS: "false" })).toEqual(["scheduler.planning.view"]);
  });
});
