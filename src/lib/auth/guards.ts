import "server-only";
import { APP_KEY, can, canAny, type BioTreeUser, type Permission } from "./permissions";
import { getCoreDirectoryConfig } from "./config";
import { findCoreUserByClerkId } from "./coreDirectory";

export class AccessError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden" | "unavailable") {
    super(code);
  }
}

export interface BioTreeAuthAdapter {
  // Must use a verified Clerk session, never a browser-supplied ID/header.
  getClerkUserId(): Promise<string | null>;
  // Normalize the actual Core response; do not cache access across requests.
  findUserByClerkId(clerkUserId: string): Promise<BioTreeUser | null>;
}

export function createAuthGuards(adapter: BioTreeAuthAdapter) {
  async function requireLogin() {
    const id = await adapter.getClerkUserId();
    if (!id) throw new AccessError("unauthenticated");
    return id;
  }
  async function getCurrentBioTreeUser() {
    const clerkId = await requireLogin();
    const user = await adapter.findUserByClerkId(clerkId);
    if (user && user.clerkUserId !== clerkId) throw new AccessError("forbidden");
    return user;
  }
  async function requireAppAccess(appKey: string = APP_KEY) {
    const user = await getCurrentBioTreeUser();
    if (appKey !== APP_KEY || !user?.active || !user.apps.some((app) =>
      app.appKey === APP_KEY && app.active && app.assigned
    )) throw new AccessError("forbidden");
    return user;
  }
  async function requirePermission(permission: Permission) {
    const user = await requireAppAccess();
    if (!can(user, permission)) throw new AccessError("forbidden");
    return user;
  }
  // Opening the workspace needs at least one of the board reads. Each
  // individual operation still checks its own permission separately.
  async function requireAnyPermission(allowed: readonly Permission[]) {
    const user = await requireAppAccess();
    if (!canAny(user, allowed)) throw new AccessError("forbidden");
    return user;
  }
  async function requireTeamPermission(permission: Permission, teamId: string) {
    const user = await requirePermission(permission);
    if (!teamId || !user.apps.some((app) => app.appKey === APP_KEY && app.active && app.assigned && app.permissions.includes(permission) && app.teamIds?.includes(teamId))) {
      throw new AccessError("forbidden");
    }
    return { actor: user, where: { teamId } };
  }
  return { requireLogin, getCurrentBioTreeUser, requireAppAccess, requirePermission, requireAnyPermission, requireTeamPermission };
}

/**
 * The live adapter. A verified Clerk session supplies the identity; Bio Tree
 * Core supplies employment status, app assignment and permissions. Authorization
 * never falls back to a demo identity — a Core or Clerk failure is "unavailable",
 * which denies the request.
 */
const adapter: BioTreeAuthAdapter = {
  async getClerkUserId() {
    if (!getCoreDirectoryConfig()) throw new AccessError("unavailable");
    try {
      // Imported lazily so the guards stay loadable (and deny) where Clerk is
      // not installed or configured, such as in unit tests.
      const { auth } = await import("@clerk/nextjs/server");
      return (await auth()).userId ?? null;
    } catch {
      throw new AccessError("unavailable");
    }
  },
  async findUserByClerkId(clerkUserId: string) {
    try {
      return await findCoreUserByClerkId(clerkUserId);
    } catch {
      throw new AccessError("unavailable");
    }
  }
};
export const { requireLogin, getCurrentBioTreeUser, requireAppAccess, requirePermission, requireAnyPermission, requireTeamPermission } = createAuthGuards(adapter);
