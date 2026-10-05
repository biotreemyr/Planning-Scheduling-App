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
  completedAt?: string;
  yieldQuantity?: number;
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
  priority: Priority;
  status: PlanLineStatus;
  orderReference?: string;
  notes?: string;
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
