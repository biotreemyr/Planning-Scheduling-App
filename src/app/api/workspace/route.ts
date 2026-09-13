import { NextRequest, NextResponse } from "next/server";
import { localPersistenceAllowed, sameLocalOrigin } from "@/lib/persistence/access";
import { db, validWriteToken } from "@/lib/persistence/database";
import { workspaceRepository, RevisionConflict } from "@/lib/persistence/repository";
import { parseWorkspace } from "@/lib/domain/workspace";
import { ensureDailyBackup } from "@/lib/persistence/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function PUT(request: NextRequest) {
  const host = request.headers.get("host");
  if (!localPersistenceAllowed(host, process.env) || !sameLocalOrigin(host, request.headers.get("origin")) || !validWriteToken(request.headers.get("x-scheduler-token"))) return response({ error: "Local database access denied. Reload the app if the server restarted." }, 403);
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
    const revision = await workspaceRepository(db).save(payload.snapshot, payload.revision, payload.mutationId);
    return response({ revision });
  } catch (error) {
    if (error instanceof RevisionConflict) return response({ error: "Another tab saved newer data. Download your unsaved changes before reloading." }, 409);
    return response({ error: "Database save failed. Keep this tab open and retry." }, 503);
  }
}
