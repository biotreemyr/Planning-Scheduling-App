import { beforeEach, describe, expect, it, vi } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";

vi.mock("server-only", () => ({}));
const stored = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const state = vi.hoisted(() => ({ user: null as unknown, error: null as unknown, saves: [] as unknown[] }));
vi.mock("../src/lib/auth/guards", async () => {
  const { AccessError } = await vi.importActual<typeof import("../src/lib/auth/guards")>("../src/lib/auth/guards").catch(() => ({ AccessError: class extends Error { constructor(public code: string) { super(code); } } }));
  return { AccessError, requireAnyPermission: vi.fn(async () => { if (state.error) throw state.error; return state.user; }) };
});
vi.mock("../src/lib/persistence/database", () => ({ db: {}, validWriteToken: (token: string | null) => token === "good-token" }));
vi.mock("../src/lib/persistence/backup", () => ({ ensureDailyBackup: async () => {} }));
vi.mock("../src/lib/persistence/repository", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/persistence/repository")>("../src/lib/persistence/repository");
  return { ...actual, workspaceRepository: () => ({ async save(snapshot: never, _revision: number, _id: string, options: { review?: (a: unknown, b: unknown) => { denied: string[] }; actor?: unknown }) {
    const review = options.review?.(stored, snapshot);
    if (review?.denied.length) throw new actual.ChangeNotAllowed(review.denied);
    state.saves.push({ actor: options.actor });
    return 8;
  } }) };
});

const { PUT } = await import("../src/app/api/workspace/route");
const { AccessError } = await import("../src/lib/auth/guards");
const permissionsOf = (...keys: string[]) => ({ id: "core-1", clerkUserId: "clerk-1", name: "Aida Planner", active: true, apps: [{ appKey: "scheduler", active: true, assigned: true, permissions: keys.map((key) => `scheduler.${key}`) }] });
function put(snapshot: unknown, headers: Record<string, string> = {}) {
  return PUT(new Request("https://scheduler.biotreegroup.com.my/api/workspace", { method: "PUT", headers: { "content-type": "application/json", origin: "https://scheduler.biotreegroup.com.my", "x-scheduler-token": "good-token", ...headers }, body: JSON.stringify({ snapshot, revision: 7, mutationId: "m-1" }) }) as never);
}
const moved = () => { const next = structuredClone(stored); next.data.lines.find((line) => !line.completedAt)!.plannedDate = "2026-10-30"; return next; };

describe("workspace save in Core mode", () => {
  beforeEach(() => {
    vi.stubEnv("SCHEDULER_AUTH_MODE", "core");
    vi.stubEnv("SCHEDULER_APP_URL", "https://scheduler.biotreegroup.com.my");
    state.user = permissionsOf("planning.view", "planning.edit", "planning.create", "schedule.view");
    state.error = null; state.saves = [];
  });
  it("saves a permitted change and records the verified Core user as the actor", async () => {
    const result = await put(moved());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ revision: 8 });
    expect(state.saves).toEqual([{ actor: { id: "core-1", clerkId: "clerk-1", name: "Aida Planner" } }]);
  });
  it("refuses changes the Core role does not allow, saving nothing", async () => {
    state.user = permissionsOf("planning.view", "schedule.view", "reports.view");
    const result = await put(moved());
    expect(result.status).toBe(403);
    expect((await result.json()).denied).toEqual(["move or edit plan activities"]);
    expect(state.saves).toEqual([]);
  });
  it("requires a signed-in Core user", async () => {
    state.error = new AccessError("unauthenticated");
    expect((await put(moved())).status).toBe(401);
    state.error = new AccessError("forbidden");
    expect((await put(moved())).status).toBe(403);
    state.error = new AccessError("unavailable");
    expect((await put(moved())).status).toBe(503);
    expect(state.saves).toEqual([]);
  });
  it("rejects saves from another origin or without the page's write token", async () => {
    expect((await put(moved(), { origin: "https://evil.example" })).status).toBe(403);
    expect((await put(moved(), { "x-scheduler-token": "stolen" })).status).toBe(403);
    vi.stubEnv("SCHEDULER_APP_URL", "");
    expect((await put(moved())).status).toBe(403);
    expect(state.saves).toEqual([]);
  });
});
