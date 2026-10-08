import { NextRequest, NextResponse } from "next/server";
import { localPersistenceAllowed, sameLocalOrigin } from "@/lib/persistence/access";
import { db, validWriteToken } from "@/lib/persistence/database";
import { workspaceRepository, RevisionConflict, ChangeNotAllowed, type SaveActor, type ReviewChange } from "@/lib/persistence/repository";
import { parseWorkspace } from "@/lib/domain/workspace";
import { ensureDailyBackup } from "@/lib/persistence/backup";
import { getAppUrl, getAuthMode } from "@/lib/auth/config";
import { AccessError, requireAnyPermission } from "@/lib/auth/guards";
import { boardPermissions, effectivePermissions } from "@/lib/auth/permissions";
import { capabilitiesFromPermissions } from "@/lib/auth/capabilities";
import { reviewWorkspaceChange } from "@/lib/auth/workspaceAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Core mode: the signed-in Core user, a request from this app's own origin, and the
// page's write token. Every change is then checked against the user's Core permissions.
async function coreAccess(request: NextRequest): Promise<{ actor: SaveActor; review: ReviewChange } | NextResponse> {
  let user;
  try { user = await requireAnyPermission(boardPermissions); } catch (error) {
    const code = error instanceof AccessError ? error.code : "unavailable";
    return response({ error: code === "unauthenticated" ? "Your Bio Tree session has ended. Sign in again from the dashboard." : code === "forbidden" ? "Your Bio Tree account does not have access to this scheduler." : "Sign-in could not be checked. Changes were not saved; try again shortly." }, code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : 503);
  }
  let expected: string | undefined;
  try { expected = getAppUrl()?.origin; } catch { expected = undefined; }
  const origin = request.headers.get("origin");
  if (!expected || origin !== expected || !validWriteToken(request.headers.get("x-scheduler-token"))) return response({ error: "This save did not come from the scheduler page. Reload and try again." }, 403);
  const granted = effectivePermissions(user.apps.find((app) => app.appKey === "scheduler")?.permissions ?? []);
  const can = capabilitiesFromPermissions(granted);
  return { actor: { id: user.id, clerkId: user.clerkUserId, name: user.name ?? "Bio Tree user" }, review: (before, after) => reviewWorkspaceChange(before, after, can) };
}

export async function PUT(request: NextRequest) {
  let access: { actor?: SaveActor; review?: ReviewChange };
  let mode: "demo" | "core";
  try { mode = getAuthMode(); } catch { return response({ error: "Scheduler configuration is invalid. Changes were not saved." }, 503); }
  if (mode === "core") {
    const result = await coreAccess(request);
    if (result instanceof NextResponse) return result;
    access = result;
  } else {
    const host = request.headers.get("host");
    if (!localPersistenceAllowed(host, process.env) || !sameLocalOrigin(host, request.headers.get("origin")) || !validWriteToken(request.headers.get("x-scheduler-token"))) return response({ error: "Local database access denied. Reload the app if the server restarted." }, 403);
    // The local demo has no verified identity; it allows every change but still logs what changed.
    const everything = Object.fromEntries(Object.keys(capabilitiesFromPermissions([])).map((key) => [key, true])) as ReturnType<typeof capabilitiesFromPermissions>;
    access = { actor: { name: "Local demo" }, review: (before, after) => ({ denied: [], summary: reviewWorkspaceChange(before, after, everything).summary }) };
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "JSON required." }, 415);
  let payload: { snapshot: unknown; revision: number; mutationId: string };
  try {
    // Bound streamed input as well as declared content length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let length = 0; const chunks: Uint8Array[] = [];
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 8 * 1024 * 1024) { await reader.cancel(); return response({ error: "Workspace exceeds the local pilot size limit." }, 413); } chunks.push(value); }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    payload.snapshot = parseWorkspace(payload.snapshot);
    if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || typeof payload.mutationId !== "string" || !/^[a-z0-9-]{1,100}$/i.test(payload.mutationId)) throw new Error();
  } catch { return response({ error: "Invalid workspace data. Changes were not saved." }, 400); }
  try { await ensureDailyBackup(); } catch { return response({ error: "Database backup failed. Changes were not saved; contact your administrator." }, 503); }
  try {
    const revision = await workspaceRepository(db).save(payload.snapshot, payload.revision, payload.mutationId, access);
    return response({ revision });
  } catch (error) {
    if (error instanceof RevisionConflict) return response({ error: "Another tab saved newer data. Download your unsaved changes before reloading." }, 409);
    if (error instanceof ChangeNotAllowed) return response({ error: `Your Bio Tree role does not allow you to ${error.denied.join(", or ")}. Changes were not saved.`, denied: error.denied }, 403);
    return response({ error: "Database save failed. Keep this tab open and retry." }, 503);
  }
}
