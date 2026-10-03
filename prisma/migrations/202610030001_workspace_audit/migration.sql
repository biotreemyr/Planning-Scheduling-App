-- CreateTable
CREATE TABLE "SchedulerAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT,
    "actorClerkId" TEXT,
    "actorName" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulerAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedulerAuditEvent_workspaceId_createdAt_idx" ON "SchedulerAuditEvent"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SchedulerAuditEvent" ADD CONSTRAINT "SchedulerAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SchedulerWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
