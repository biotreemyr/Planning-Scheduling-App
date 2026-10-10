CREATE TYPE "public"."ActiveStatus" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."PlanLineStatus" AS ENUM('UNSCHEDULED', 'PARTIALLY_SCHEDULED', 'FULLY_SCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."Priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."ProductionOrderStatus" AS ENUM('DRAFT', 'RELEASED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ProductionPlanStatus" AS ENUM('DRAFT', 'PROPOSED', 'ACCEPTED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."ScheduleEntryStatus" AS ENUM('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "ActivityType" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Batch" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"batchNo" text NOT NULL,
	"productId" text NOT NULL,
	"productionOrderId" text,
	"status" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Customer" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contactNotes" text,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Department" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Employee" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Machine" (
	"capacity" numeric(24, 9),
	"capacityUom" text,
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"workCentreId" text NOT NULL,
	"capacityNotes" text,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Material" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"uom" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MeasurementUnit" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OperationTemplate" (
	"id" text PRIMARY KEY NOT NULL,
	"productId" text NOT NULL,
	"sequenceNo" integer NOT NULL,
	"operationName" text NOT NULL,
	"defaultWorkCentreId" text NOT NULL,
	"estDurationMin" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PlanLine" (
	"uom" text,
	"activityType" text,
	"unitWeightMg" numeric(24, 9),
	"batchSizeKg" numeric(24, 9),
	"teamId" text,
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"planId" text NOT NULL,
	"productionOrderId" text,
	"productId" text NOT NULL,
	"quantity" numeric(65, 30) NOT NULL,
	"plannedDate" timestamp (3) NOT NULL,
	"priority" "Priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "PlanLineStatus" DEFAULT 'UNSCHEDULED' NOT NULL,
	"orderReference" text,
	"notes" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Product" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"uom" text NOT NULL,
	"productType" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductionOrder" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"orderNo" text NOT NULL,
	"customerId" text,
	"productId" text NOT NULL,
	"quantity" numeric(65, 30) NOT NULL,
	"dueDate" timestamp (3) NOT NULL,
	"priority" "Priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "ProductionOrderStatus" DEFAULT 'DRAFT' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductionPlan" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"planName" text NOT NULL,
	"dateRangeStart" timestamp (3) NOT NULL,
	"dateRangeEnd" timestamp (3) NOT NULL,
	"status" "ProductionPlanStatus" DEFAULT 'DRAFT' NOT NULL,
	"ownerName" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectTeam" (
	"id" text PRIMARY KEY NOT NULL,
	"departmentId" text NOT NULL,
	"name" text NOT NULL,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ScheduleChangeLog" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduleEntryId" text NOT NULL,
	"changedBy" text NOT NULL,
	"changeType" text NOT NULL,
	"beforeJson" jsonb,
	"afterJson" jsonb,
	"changedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ScheduleEntry" (
	"teamId" text,
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"planLineId" text,
	"productionOrderId" text,
	"productId" text NOT NULL,
	"workCentreId" text NOT NULL,
	"machineId" text,
	"startAt" timestamp (3) NOT NULL,
	"endAt" timestamp (3) NOT NULL,
	"status" "ScheduleEntryStatus" DEFAULT 'DRAFT' NOT NULL,
	"reasonCode" text,
	"notes" text,
	"changedBy" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SchedulerAuditEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text NOT NULL,
	"revision" integer NOT NULL,
	"actorId" text,
	"actorClerkId" text,
	"actorName" text NOT NULL,
	"changes" jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SchedulerWorkspace" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"lastMutationId" text,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SchedulerWorkspaceRevision" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"savedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkCentre" (
	"id" text PRIMARY KEY NOT NULL,
	"externalRef" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" "ActiveStatus" DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "public"."ProductionOrder"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workCentreId_fkey" FOREIGN KEY ("workCentreId") REFERENCES "public"."WorkCentre"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "OperationTemplate" ADD CONSTRAINT "OperationTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "OperationTemplate" ADD CONSTRAINT "OperationTemplate_defaultWorkCentreId_fkey" FOREIGN KEY ("defaultWorkCentreId") REFERENCES "public"."WorkCentre"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PlanLine" ADD CONSTRAINT "PlanLine_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."ProjectTeam"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PlanLine" ADD CONSTRAINT "PlanLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."ProductionPlan"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PlanLine" ADD CONSTRAINT "PlanLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProjectTeam" ADD CONSTRAINT "ProjectTeam_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleChangeLog" ADD CONSTRAINT "ScheduleChangeLog_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "public"."ScheduleEntry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."ProjectTeam"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_planLineId_fkey" FOREIGN KEY ("planLineId") REFERENCES "public"."PlanLine"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "public"."ProductionOrder"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_workCentreId_fkey" FOREIGN KEY ("workCentreId") REFERENCES "public"."WorkCentre"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "public"."Machine"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SchedulerAuditEvent" ADD CONSTRAINT "SchedulerAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."SchedulerWorkspace"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "SchedulerWorkspaceRevision" ADD CONSTRAINT "SchedulerWorkspaceRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."SchedulerWorkspace"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "ActivityType_name_key" ON "ActivityType" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "Batch_batchNo_key" ON "Batch" USING btree ("batchNo");--> statement-breakpoint
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "Material_code_key" ON "Material" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "MeasurementUnit_name_key" ON "MeasurementUnit" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "Product_sku_key" ON "Product" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "ProductionOrder_orderNo_key" ON "ProductionOrder" USING btree ("orderNo");--> statement-breakpoint
CREATE UNIQUE INDEX "ProjectTeam_departmentId_name_key" ON "ProjectTeam" USING btree ("departmentId","name");--> statement-breakpoint
CREATE INDEX "ScheduleEntry_machineId_startAt_endAt_idx" ON "ScheduleEntry" USING btree ("machineId","startAt","endAt");--> statement-breakpoint
CREATE INDEX "ScheduleEntry_teamId_startAt_idx" ON "ScheduleEntry" USING btree ("teamId","startAt");--> statement-breakpoint
CREATE INDEX "SchedulerAuditEvent_workspaceId_createdAt_idx" ON "SchedulerAuditEvent" USING btree ("workspaceId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "SchedulerWorkspaceRevision_workspaceId_revision_key" ON "SchedulerWorkspaceRevision" USING btree ("workspaceId","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "WorkCentre_code_key" ON "WorkCentre" USING btree ("code");