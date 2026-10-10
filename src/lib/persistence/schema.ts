import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, type PgColumn } from "drizzle-orm/pg-core";

// Mirrors the tables the Prisma migrations created, names and constraints included, so the live
// database needs no change. IDs and timestamps are filled in by the app, in UTC, as Prisma did: the
// column defaults would use the server's local time zone, since the columns carry none.
const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const at = (name: string) => timestamp(name, { precision: 3, mode: "date" });
const now = (name: string) => at(name).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(() => new Date());
const createdAt = () => now("createdAt");
const updatedAt = () => at("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date());
const decimal = (name: string, precision = 65, scale = 30) => numeric(name, { precision, scale });
const fk = (name: string, columns: [PgColumn], foreignColumns: [PgColumn], onDelete: "restrict" | "set null" = "restrict") =>
  foreignKey({ name, columns, foreignColumns }).onDelete(onDelete).onUpdate("cascade");

export const activeStatus = pgEnum("ActiveStatus", ["ACTIVE", "INACTIVE"]);
export const priority = pgEnum("Priority", ["LOW", "NORMAL", "HIGH", "URGENT"]);
export const productionOrderStatus = pgEnum("ProductionOrderStatus", ["DRAFT", "RELEASED", "IN_PRODUCTION", "COMPLETED", "CANCELLED"]);
export const productionPlanStatus = pgEnum("ProductionPlanStatus", ["DRAFT", "PROPOSED", "ACCEPTED", "ARCHIVED"]);
export const planLineStatus = pgEnum("PlanLineStatus", ["UNSCHEDULED", "PARTIALLY_SCHEDULED", "FULLY_SCHEDULED"]);
export const scheduleEntryStatus = pgEnum("ScheduleEntryStatus", ["DRAFT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"]);

// Versioned pilot aggregate. Existing relational tables remain migration scaffolding.
// A single compare-and-swap transaction saves configuration and production together.
export const schedulerWorkspace = pgTable("SchedulerWorkspace", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  snapshot: jsonb("snapshot").notNull(),
  lastMutationId: text("lastMutationId"),
  updatedAt: updatedAt()
});

// Who saved each revision and what kinds of change it contained, written in the
// same transaction as the save. Actor identity comes from the server, never the browser.
export const schedulerAuditEvent = pgTable("SchedulerAuditEvent", {
  id: id(),
  workspaceId: text("workspaceId").notNull(),
  revision: integer("revision").notNull(),
  actorId: text("actorId"),
  actorClerkId: text("actorClerkId"),
  actorName: text("actorName").notNull(),
  changes: jsonb("changes").notNull(),
  createdAt: createdAt()
}, (t) => [
  index("SchedulerAuditEvent_workspaceId_createdAt_idx").on(t.workspaceId, t.createdAt),
  fk("SchedulerAuditEvent_workspaceId_fkey", [t.workspaceId], [schedulerWorkspace.id])
]);

export const schedulerWorkspaceRevision = pgTable("SchedulerWorkspaceRevision", {
  id: id(),
  workspaceId: text("workspaceId").notNull(),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  savedAt: now("savedAt")
}, (t) => [
  uniqueIndex("SchedulerWorkspaceRevision_workspaceId_revision_key").on(t.workspaceId, t.revision),
  fk("SchedulerWorkspaceRevision_workspaceId_fkey", [t.workspaceId], [schedulerWorkspace.id])
]);

export const customer = pgTable("Customer", {
  id: id(),
  externalRef: text("externalRef"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  contactNotes: text("contactNotes"),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [uniqueIndex("Customer_code_key").on(t.code)]);

export const product = pgTable("Product", {
  id: id(),
  externalRef: text("externalRef"),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  uom: text("uom").notNull(),
  productType: text("productType").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [uniqueIndex("Product_sku_key").on(t.sku)]);

export const productionOrder = pgTable("ProductionOrder", {
  id: id(),
  externalRef: text("externalRef"),
  orderNo: text("orderNo").notNull(),
  customerId: text("customerId"),
  productId: text("productId").notNull(),
  quantity: decimal("quantity").notNull(),
  dueDate: at("dueDate").notNull(),
  priority: priority("priority").notNull().default("NORMAL"),
  status: productionOrderStatus("status").notNull().default("DRAFT"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("ProductionOrder_orderNo_key").on(t.orderNo),
  fk("ProductionOrder_customerId_fkey", [t.customerId], [customer.id], "set null"),
  fk("ProductionOrder_productId_fkey", [t.productId], [product.id])
]);

export const productionPlan = pgTable("ProductionPlan", {
  id: id(),
  externalRef: text("externalRef"),
  planName: text("planName").notNull(),
  dateRangeStart: at("dateRangeStart").notNull(),
  dateRangeEnd: at("dateRangeEnd").notNull(),
  status: productionPlanStatus("status").notNull().default("DRAFT"),
  ownerName: text("ownerName"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const department = pgTable("Department", {
  id: id(),
  name: text("name").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE")
});

export const projectTeam = pgTable("ProjectTeam", {
  id: id(),
  departmentId: text("departmentId").notNull(),
  name: text("name").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE")
}, (t) => [
  uniqueIndex("ProjectTeam_departmentId_name_key").on(t.departmentId, t.name),
  fk("ProjectTeam_departmentId_fkey", [t.departmentId], [department.id])
]);

export const planLine = pgTable("PlanLine", {
  uom: text("uom"),
  activityType: text("activityType"),
  unitWeightMg: decimal("unitWeightMg", 24, 9),
  batchSizeKg: decimal("batchSizeKg", 24, 9),
  teamId: text("teamId"),
  id: id(),
  externalRef: text("externalRef"),
  planId: text("planId").notNull(),
  productionOrderId: text("productionOrderId"),
  productId: text("productId").notNull(),
  quantity: decimal("quantity").notNull(),
  plannedDate: at("plannedDate").notNull(),
  priority: priority("priority").notNull().default("NORMAL"),
  status: planLineStatus("status").notNull().default("UNSCHEDULED"),
  orderReference: text("orderReference"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  fk("PlanLine_teamId_fkey", [t.teamId], [projectTeam.id], "set null"),
  fk("PlanLine_planId_fkey", [t.planId], [productionPlan.id]),
  fk("PlanLine_productId_fkey", [t.productId], [product.id])
]);

export const workCentre = pgTable("WorkCentre", {
  id: id(),
  externalRef: text("externalRef"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [uniqueIndex("WorkCentre_code_key").on(t.code)]);

export const machine = pgTable("Machine", {
  capacity: decimal("capacity", 24, 9),
  capacityUom: text("capacityUom"),
  id: id(),
  externalRef: text("externalRef"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  workCentreId: text("workCentreId").notNull(),
  capacityNotes: text("capacityNotes"),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("Machine_code_key").on(t.code),
  fk("Machine_workCentreId_fkey", [t.workCentreId], [workCentre.id])
]);

export const employee = pgTable("Employee", {
  id: id(),
  externalRef: text("externalRef"),
  name: text("name").notNull(),
  role: text("role").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const operationTemplate = pgTable("OperationTemplate", {
  id: id(),
  productId: text("productId").notNull(),
  sequenceNo: integer("sequenceNo").notNull(),
  operationName: text("operationName").notNull(),
  defaultWorkCentreId: text("defaultWorkCentreId").notNull(),
  estDurationMin: integer("estDurationMin").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  fk("OperationTemplate_productId_fkey", [t.productId], [product.id]),
  fk("OperationTemplate_defaultWorkCentreId_fkey", [t.defaultWorkCentreId], [workCentre.id])
]);

export const scheduleEntry = pgTable("ScheduleEntry", {
  teamId: text("teamId"),
  id: id(),
  externalRef: text("externalRef"),
  planLineId: text("planLineId"),
  productionOrderId: text("productionOrderId"),
  productId: text("productId").notNull(),
  workCentreId: text("workCentreId").notNull(),
  machineId: text("machineId"),
  startAt: at("startAt").notNull(),
  endAt: at("endAt").notNull(),
  status: scheduleEntryStatus("status").notNull().default("DRAFT"),
  reasonCode: text("reasonCode"),
  notes: text("notes"),
  changedBy: text("changedBy"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("ScheduleEntry_machineId_startAt_endAt_idx").on(t.machineId, t.startAt, t.endAt),
  index("ScheduleEntry_teamId_startAt_idx").on(t.teamId, t.startAt),
  fk("ScheduleEntry_teamId_fkey", [t.teamId], [projectTeam.id], "set null"),
  fk("ScheduleEntry_planLineId_fkey", [t.planLineId], [planLine.id], "set null"),
  fk("ScheduleEntry_productionOrderId_fkey", [t.productionOrderId], [productionOrder.id], "set null"),
  fk("ScheduleEntry_productId_fkey", [t.productId], [product.id]),
  fk("ScheduleEntry_workCentreId_fkey", [t.workCentreId], [workCentre.id]),
  fk("ScheduleEntry_machineId_fkey", [t.machineId], [machine.id], "set null")
]);

export const measurementUnit = pgTable("MeasurementUnit", {
  id: id(),
  name: text("name").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE")
}, (t) => [uniqueIndex("MeasurementUnit_name_key").on(t.name)]);

export const activityType = pgTable("ActivityType", {
  id: id(),
  name: text("name").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE")
}, (t) => [uniqueIndex("ActivityType_name_key").on(t.name)]);

export const batch = pgTable("Batch", {
  id: id(),
  externalRef: text("externalRef"),
  batchNo: text("batchNo").notNull(),
  productId: text("productId").notNull(),
  productionOrderId: text("productionOrderId"),
  status: text("status").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("Batch_batchNo_key").on(t.batchNo),
  fk("Batch_productId_fkey", [t.productId], [product.id]),
  fk("Batch_productionOrderId_fkey", [t.productionOrderId], [productionOrder.id], "set null")
]);

export const material = pgTable("Material", {
  id: id(),
  externalRef: text("externalRef"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  uom: text("uom").notNull(),
  active: activeStatus("active").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [uniqueIndex("Material_code_key").on(t.code)]);

export const scheduleChangeLog = pgTable("ScheduleChangeLog", {
  id: id(),
  scheduleEntryId: text("scheduleEntryId").notNull(),
  changedBy: text("changedBy").notNull(),
  changeType: text("changeType").notNull(),
  beforeJson: jsonb("beforeJson"),
  afterJson: jsonb("afterJson"),
  changedAt: now("changedAt")
}, (t) => [fk("ScheduleChangeLog_scheduleEntryId_fkey", [t.scheduleEntryId], [scheduleEntry.id])]);
