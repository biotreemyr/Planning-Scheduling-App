import type { PrismaClient } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { newWorkspace, parseWorkspace, type WorkspaceEnvelope, type WorkspaceSnapshot } from "@/lib/domain/workspace";

export class RevisionConflict extends Error {}
export class ChangeNotAllowed extends Error {
  constructor(public readonly denied: string[]) { super("Change not allowed"); }
}
export type SaveActor = { id?: string; clerkId?: string; name: string };
// Runs inside the save transaction against the snapshot actually being replaced.
export type ReviewChange = (before: WorkspaceSnapshot, after: WorkspaceSnapshot) => { denied: string[]; summary: string[] };
export function workspaceRepository(db: PrismaClient, workspaceId = "local-pilot") {
  return {
    async load(): Promise<WorkspaceEnvelope> {
      const row = await db.schedulerWorkspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId, snapshot: newWorkspace() } });
      return { revision: row.revision, snapshot: parseWorkspace(row.snapshot) };
    },
    async save(input: unknown, revision: number, mutationId: string, options: { actor?: SaveActor; review?: ReviewChange } = {}): Promise<number> {
      const snapshot = parseWorkspace(input);
      if (!Number.isSafeInteger(revision) || revision < 0 || !mutationId || mutationId.length > 100) throw new Error("Invalid revision");
      return db.$transaction(async (tx) => {
        const row = await tx.schedulerWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
        if (row.lastMutationId === mutationId && row.revision === revision + 1 && isDeepStrictEqual(parseWorkspace(row.snapshot), snapshot)) return row.revision;
        if (row.revision !== revision) throw new RevisionConflict("Another tab has saved changes. Reload before editing.");
        const review = options.review?.(parseWorkspace(row.snapshot), snapshot) ?? { denied: [], summary: [] };
        if (review.denied.length) throw new ChangeNotAllowed(review.denied);
        const changed = await tx.schedulerWorkspace.updateMany({ where: { id: workspaceId, revision }, data: { snapshot, revision: { increment: 1 }, lastMutationId: mutationId } });
        if (changed.count !== 1) throw new RevisionConflict("Another tab saved first.");
        await tx.schedulerWorkspaceRevision.create({ data: { workspaceId, revision, snapshot: row.snapshot! } });
        if (options.actor) await tx.schedulerAuditEvent.create({ data: { workspaceId, revision: revision + 1, actorId: options.actor.id, actorClerkId: options.actor.clerkId, actorName: options.actor.name, changes: review.summary } });
        return revision + 1;
      });
    }
  };
}
