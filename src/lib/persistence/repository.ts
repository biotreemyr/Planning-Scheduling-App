import { and, eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { Database } from "./client";
import { schedulerAuditEvent, schedulerWorkspace, schedulerWorkspaceRevision } from "./schema";
import { newWorkspace, parseWorkspace, type WorkspaceEnvelope, type WorkspaceSnapshot } from "@/lib/domain/workspace";

export class RevisionConflict extends Error {}
export class ChangeNotAllowed extends Error {
  constructor(public readonly denied: string[]) { super("Change not allowed"); }
}
export type SaveActor = { id?: string; clerkId?: string; name: string };
// Runs inside the save transaction against the snapshot actually being replaced.
export type ReviewChange = (before: WorkspaceSnapshot, after: WorkspaceSnapshot) => { denied: string[]; summary: string[] };
export function workspaceRepository(db: Database, workspaceId = "local-pilot") {
  return {
    async load(): Promise<WorkspaceEnvelope> {
      await db.insert(schedulerWorkspace).values({ id: workspaceId, snapshot: newWorkspace() }).onConflictDoNothing();
      const [row] = await db.select().from(schedulerWorkspace).where(eq(schedulerWorkspace.id, workspaceId));
      return { revision: row.revision, snapshot: parseWorkspace(row.snapshot) };
    },
    async save(input: unknown, revision: number, mutationId: string, options: { actor?: SaveActor; review?: ReviewChange } = {}): Promise<number> {
      const snapshot = parseWorkspace(input);
      if (!Number.isSafeInteger(revision) || revision < 0 || !mutationId || mutationId.length > 100) throw new Error("Invalid revision");
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(schedulerWorkspace).where(eq(schedulerWorkspace.id, workspaceId));
        if (!row) throw new Error(`No workspace ${workspaceId}`);
        if (row.lastMutationId === mutationId && row.revision === revision + 1 && isDeepStrictEqual(parseWorkspace(row.snapshot), snapshot)) return row.revision;
        if (row.revision !== revision) throw new RevisionConflict("Another tab has saved changes. Reload before editing.");
        const review = options.review?.(parseWorkspace(row.snapshot), snapshot) ?? { denied: [], summary: [] };
        if (review.denied.length) throw new ChangeNotAllowed(review.denied);
        const changed = await tx.update(schedulerWorkspace).set({ snapshot, revision: sql`${schedulerWorkspace.revision} + 1`, lastMutationId: mutationId })
          .where(and(eq(schedulerWorkspace.id, workspaceId), eq(schedulerWorkspace.revision, revision))).returning({ id: schedulerWorkspace.id });
        if (changed.length !== 1) throw new RevisionConflict("Another tab saved first.");
        await tx.insert(schedulerWorkspaceRevision).values({ workspaceId, revision, snapshot: row.snapshot });
        if (options.actor) await tx.insert(schedulerAuditEvent).values({ workspaceId, revision: revision + 1, actorId: options.actor.id, actorClerkId: options.actor.clerkId, actorName: options.actor.name, changes: review.summary });
        return revision + 1;
      });
    }
  };
}
