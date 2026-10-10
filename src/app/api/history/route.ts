import { NextRequest, NextResponse } from "next/server";
import { localPersistenceAllowed } from "@/lib/persistence/access";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/persistence/database";
import { schedulerAuditEvent, schedulerWorkspace, schedulerWorkspaceRevision } from "@/lib/persistence/schema";
import { getAuthMode } from "@/lib/auth/config";
import { AccessError, requireAnyPermission } from "@/lib/auth/guards";
import { boardPermissions } from "@/lib/auth/permissions";
import { buildHistory } from "@/lib/services/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const WORKSPACE = "local-pilot";

// The transaction history: every saved version compared with the one before. Read-only, for anyone
// who can open the scheduler (Core mode) or the local demo.
export async function GET(request: NextRequest) {
  let mode: "demo" | "core";
  try { mode = getAuthMode(); } catch { return response({ error: "Scheduler configuration is invalid." }, 503); }
  if (mode === "core") {
    try { await requireAnyPermission(boardPermissions); } catch (error) {
      const code = error instanceof AccessError ? error.code : "unavailable";
      return response({ error: code === "unauthenticated" ? "Your Bio Tree session has ended. Sign in again from the dashboard." : "Your Bio Tree account does not have access to this scheduler." }, code === "unauthenticated" ? 401 : 403);
    }
  } else if (!localPersistenceAllowed(request.headers.get("host"), process.env)) return response({ error: "Local database access denied." }, 403);
  try {
    const [[current], revisions, audit] = await Promise.all([
      db.select().from(schedulerWorkspace).where(eq(schedulerWorkspace.id, WORKSPACE)),
      db.select().from(schedulerWorkspaceRevision).where(eq(schedulerWorkspaceRevision.workspaceId, WORKSPACE)).orderBy(asc(schedulerWorkspaceRevision.revision)),
      db.select().from(schedulerAuditEvent).where(eq(schedulerAuditEvent.workspaceId, WORKSPACE)).orderBy(asc(schedulerAuditEvent.revision))
    ]);
    if (!current) return response({ entries: [] });
    const versions = [...revisions.map((row) => ({ revision: row.revision, snapshot: row.snapshot })), { revision: current.revision, snapshot: current.snapshot }];
    const entries = buildHistory(versions,
      new Map(audit.map((row) => [row.revision, { at: row.createdAt.toISOString(), by: row.actorName }])),
      new Map(revisions.map((row) => [row.revision, row.savedAt.toISOString()])));
    return response({ entries });
  } catch {
    return response({ error: "The history could not be loaded. Try again shortly." }, 503);
  }
}
