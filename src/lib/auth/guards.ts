import "server-only";
import { APP_KEY, can, type BioTreeUser, type Permission } from "./permissions";

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
  async function requireTeamPermission(permission: Permission, teamId: string) {
    const user = await requirePermission(permission);
    if (!teamId || !user.apps.some((app) => app.appKey === APP_KEY && app.active && app.assigned && app.permissions.includes(permission) && app.teamIds?.includes(teamId))) {
      throw new AccessError("forbidden");
    }
    return { actor: user, where: { teamId } };
  }
  return { requireLogin, getCurrentBioTreeUser, requireAppAccess, requirePermission, requireTeamPermission };
}

// Replace this adapter once the Core API and Clerk deployment are supplied.
// Server authorization never falls back to a demo identity.
const adapter: BioTreeAuthAdapter = {
  async getClerkUserId() { throw new AccessError("unavailable"); },
  async findUserByClerkId() { throw new AccessError("unavailable"); }
};
export const { requireLogin, getCurrentBioTreeUser, requireAppAccess, requirePermission, requireTeamPermission } = createAuthGuards(adapter);
