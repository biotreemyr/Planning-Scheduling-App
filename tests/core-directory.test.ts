import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { findCoreUserByClerkId, clearCoreDirectoryCache } from "@/lib/auth/coreDirectory";
import { APP_KEY, boardPermissions, canAny, permissions } from "@/lib/auth/permissions";

// Runs against a real Bio Tree Core database when one is offered, so the joins
// are checked against Core's actual schema rather than a hand-written double:
//   TEST_CORE_DATABASE_URL=postgres://... TEST_CORE_CLERK_USER_ID=user_... npx vitest run
const databaseUrl = process.env.TEST_CORE_DATABASE_URL;
const clerkUserId = process.env.TEST_CORE_CLERK_USER_ID;
const enabled = Boolean(databaseUrl && clerkUserId);
const env = { BIO_TREE_CORE_DATABASE_URL: databaseUrl, BIO_TREE_CORE_CACHE_TTL_MS: "0" };

describe("Core directory", () => {
  it("refuses to resolve anyone without a configured Core database", async () => {
    await expect(findCoreUserByClerkId("user_whoever", {})).rejects.toThrow(/BIO_TREE_CORE_DATABASE_URL/);
  });
});

describe.skipIf(!enabled)("Core directory against a live Core database", () => {
  it("resolves an assigned user into scheduler permissions", async () => {
    clearCoreDirectoryCache();
    const user = await findCoreUserByClerkId(clerkUserId!, env);
    expect(user).not.toBeNull();
    expect(user!.clerkUserId).toBe(clerkUserId);
    expect(user!.active).toBe(true);
    const app = user!.apps.find((entry) => entry.appKey === APP_KEY);
    expect(app).toBeDefined();
    expect(app!.assigned).toBe(true);
    // Every key Core hands back must be one this app knows, or a grant made in
    // Core silently authorizes nothing here.
    const known = new Set<string>(Object.values(permissions));
    expect(app!.permissions.filter((key) => !known.has(key))).toEqual([]);
    expect(canAny(user, boardPermissions)).toBe(true);
  });

  it("returns null for an unknown Clerk identity rather than a blank profile", async () => {
    clearCoreDirectoryCache();
    await expect(findCoreUserByClerkId("user_does_not_exist", env)).resolves.toBeNull();
  });
});
