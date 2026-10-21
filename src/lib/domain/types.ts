export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type ProductionPlanStatus = "Draft" | "Proposed" | "Accepted" | "Archived";

export type PlanLineStatus = "Unscheduled" | "Partially Scheduled" | "Fully Scheduled";

export type ScheduleEntryStatus =
  | "Draft"
  | "Confirmed"
  | "In Progress"
  | "Completed"
  | "Blocked"
  | "Cancelled";

export type ActiveState = "Active" | "Inactive";

export type Customer = {
  id: string;
  code: string;
  name: string;
  contactNotes?: string;
  active: ActiveState;
  // Bio Tree Master Data's ID for this customer, once an order has used it from there.
  masterDataId?: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  productType: "Finished Good" | "Intermediate" | "Packaging" | "Raw Material";
  active: ActiveState;
  // Allowable quantity of one batch, in the product's UOM, and the kilograms of that full batch.
  // Job orders are split from a PO with these.
  batchQuantity?: number;
  batchSizeKg?: number;
  // Bio Tree Master Data's ID for this product, once an order has used it from there.
  masterDataId?: string;
  // On the R&D product list (Admin, R&D products): offered to R&D, trial and pilot orders only, never from Master Data.
  rnd?: boolean;
};

export type WorkCentre = {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: ActiveState;
};

export type Machine = {
  unitId?: string;
  processIds?: string[];
  setupMinutes?: number;
  capacity?: number;
  capacityUom?: string;
  id: string;
  code: string;
  name: string;
  workCentreId: string;
  capacityNotes?: string;
  active: ActiveState;
  // The Master Data equipment it is (QA's equipment master list). Its code and name are copied from
  // there when chosen, and shown as Master Data has them now whenever Master Data can be read.
  masterDataId?: string;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  active: ActiveState;
};

export type ProductionOrder = {
  id: string;
  orderNo: string;
  customerId?: string;
  productId: string;
  quantity: number;
  dueDate: string;
  priority: Priority;
  status: "Draft" | "Released" | "In Production" | "Completed" | "Cancelled";
};

export type ProductionPlan = {
  id: string;
  planName: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  status: ProductionPlanStatus;
  ownerName: string;
};

export type PlanLine = {
  calendarId?: string;
  // Production's progress: the day work started (YYYY-MM-DD) and anything noted during it.
  startedAt?: string;
  productionNotes?: string;
  // The amount run so far, saved with progress before the day completes: as keyed in (a weight for
  // tablets or capsules weighed), with the weight or volume of one unit when weighed.
  progressQuantity?: number; progressUom?: string; progressUnitSize?: number;
  // Where production chose to send the output, saved with progress: "next:<calendar>", "wip:<calendar>"
  // or "final". The handover itself is made when the day completes.
  progressDestination?: string;
  completedAt?: string;
  yieldQuantity?: number;
  // The unit the actual quantity was reported in, when it differs by process (kg at dispensing...).
  yieldUom?: string;
  // Tablets or capsules reported by weight: what was weighed, and the weight of one compressed or
  // coated tablet / filled capsule production keyed in; yieldQuantity is then the count it gives.
  // Measured by volume (L, mL) instead, the volume of one unit is in actualUnitVolumeMl.
  weighedQuantity?: number; weighedUom?: string; actualUnitWeightMg?: number; actualUnitVolumeMl?: number;
  // Capsules weighed filled: one empty shell's weight in mg, so the powder in them can be worked out.
  shellWeightMg?: number;
  incomingWipId?: string;
  uom?: string;
  activityType?: string;
  unitWeightMg?: number;
  batchSizeKg?: number;
  teamId?: string;
  id: string;
  planId: string;
  productionOrderId?: string;
  // The job order (one batch of a PO item) this activity carries out.
  jobOrderId?: string;
  productId: string;
  quantity: number;
  plannedDate: string;
  // The last day of an activity that runs over several days (YYYY-MM-DD, after plannedDate).
  endDate?: string;
  priority: Priority;
  status: PlanLineStatus;
  orderReference?: string;
  notes?: string;
  // Who last changed the plan (date, quantity, machine...) and who last keyed in production, and when.
  plannedBy?: string; plannedAt?: string; updatedBy?: string; updatedAt?: string;
  // Why the plan was changed: a date before today (keying in past production, say), or any change by production.
  planChangeReason?: string;
  // The last correction to a completed process (its dates or quantity): why, who and when. Every
  // correction, with its reason, is also in the audit trail.
  correctionReason?: string; correctedBy?: string; correctedAt?: string;
  // The machines planned, kept when production reported running on others. Older records hold one id.
  plannedMachineIds?: string[];
  plannedMachineId?: string;
};

export type ScheduleEntry = {
  calendarId?: string;
  teamId?: string;
  id: string;
  planLineId?: string;
  productionOrderId?: string;
  productId: string;
  workCentreId: string;
  machineId?: string;
  startAt: string;
  endAt: string;
  status: ScheduleEntryStatus;
  reasonCode?: string;
  notes?: string;
  changedBy?: string;
};

export type ScheduleConflict = {
  id: string;
  machineId: string;
  entryIds: [string, string];
  message: string;
};

export type SchedulerData = {
  customers: Customer[];
  products: Product[];
  workCentres: WorkCentre[];
  machines: Machine[];
  employees: Employee[];
  productionOrders: ProductionOrder[];
  productionPlan: ProductionPlan;
  planLines: PlanLine[];
  scheduleEntries: ScheduleEntry[];
};

export const priorities: Priority[] = ["Low", "Normal", "High", "Urgent"];

export const scheduleStatuses: ScheduleEntryStatus[] = [
  "Draft",
  "Confirmed",
  "In Progress",
  "Completed",
  "Blocked",
  "Cancelled"
];
