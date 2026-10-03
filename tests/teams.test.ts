import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAuthGuards } from "@/lib/auth/guards";
import { permissions, type BioTreeUser } from "@/lib/auth/permissions";
import { scopeRecords } from "@/lib/domain/teams";

describe("team isolation", () => {
  it("excludes other teams and legacy unassigned records", () => {
    const rows = [{ id: "a", teamId: "alpha" }, { id: "b", teamId: "beta" }, { id: "legacy" }];
    expect(scopeRecords(rows, ["alpha"], "alpha")).toEqual([rows[0]]);
    expect(scopeRecords(rows, ["alpha"], "beta")).toEqual([]);
    expect(scopeRecords(rows, [], "alpha")).toEqual([]);
  });
  it("requires both an action permission and explicit membership", async () => {
    const user: BioTreeUser = { id: "core-user", clerkUserId: "clerk-user", active: true,
      apps: [{ appKey: "scheduler", active: true, assigned: true, permissions: [permissions.viewPlanning], teamIds: ["alpha"] }] };
    const auth = createAuthGuards({ getClerkUserId: async () => "clerk-user", findUserByClerkId: async () => user });
    await expect(auth.requireTeamPermission(permissions.viewPlanning, "alpha")).resolves.toMatchObject({ where: { teamId: "alpha" } });
    await expect(auth.requireTeamPermission(permissions.viewPlanning, "beta")).rejects.toMatchObject({ code: "forbidden" });
    await expect(auth.requireTeamPermission(permissions.createEntry, "alpha")).rejects.toMatchObject({ code: "forbidden" });
    user.apps[0].teamIds = [];
    await expect(auth.requireTeamPermission(permissions.viewPlanning, "alpha")).rejects.toMatchObject({ code: "forbidden" });
    delete user.apps[0].teamIds;
    await expect(auth.requireTeamPermission(permissions.viewPlanning, "alpha")).rejects.toMatchObject({ code: "forbidden" });
  });
});
