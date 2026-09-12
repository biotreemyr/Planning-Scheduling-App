import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthGuards, requirePermission } from "@/lib/auth/guards";
import { can, permissions, type BioTreeUser } from "@/lib/auth/permissions";
import { getAuthMode, getSignInUrl } from "@/lib/auth/config";
import { statusPermission, withPermission } from "@/lib/auth/actions";

const user = (): BioTreeUser => ({
  id: "core-1", clerkUserId: "clerk-1", active: true,
  apps: [{ appKey: "scheduler", active: true, assigned: true, permissions: [permissions.view] }]
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
    await expect(guards(scenario === "missing" ? null : profile).requirePermission(permissions.view)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("allows only explicitly granted scheduler permissions", async () => {
    const auth = guards(user());
    await expect(auth.requirePermission(permissions.view)).resolves.toMatchObject({ id: "core-1" });
    await expect(auth.requirePermission(permissions.cancelEntry)).rejects.toMatchObject({ code: "forbidden" });
    await expect(auth.requireAppAccess("inventory")).rejects.toMatchObject({ code: "forbidden" });
    expect(can(user(), permissions.view)).toBe(true);
    expect(can(null, permissions.view)).toBe(false);
  });
  it("rechecks access after revocation", async () => {
    const profile = user();
    const auth = guards(profile);
    await auth.requirePermission(permissions.view);
    profile.active = false;
    await expect(auth.requirePermission(permissions.view)).rejects.toMatchObject({ code: "forbidden" });
  });
  it("does not run work with an unconfigured adapter", async () => {
    const work = vi.fn();
    await expect(withPermission(permissions.createEntry, work)).rejects.toMatchObject({ code: "unavailable" });
    expect(work).not.toHaveBeenCalled();
    await expect(requirePermission(permissions.view)).rejects.toMatchObject({ code: "unavailable" });
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
});
