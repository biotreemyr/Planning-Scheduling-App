import { z } from "zod";
import { emptyDirectory } from "./emptyWorkspace";

const id = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(500);
const text = z.string().max(10000);
const number = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const timestamp = z.string().min(1).refine((value) => Number.isFinite(Date.parse(value)));
const record = z.object({ id, name });
const active = z.enum(["Active", "Inactive"]);
const option = z.object({ name, active: z.boolean() });
const settings = z.object({ uoms: z.array(option).min(1), activities: z.array(option).min(1) });
export const measurementDefaults = {
  uoms: ["boxes", "bottles", "tablets", "capsules", "sachets", "carton", "kg", "g", "mg"].map((name) => ({ name, active: true })),
  activities: ["Dispensing", "Bottling", "Tableting", "Packing", "Blending", "Fermentation", "Drying"].map((name) => ({ name, active: true }))
};
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  directory: z.object({
    units: z.array(record), processes: z.array(record),
    calendars: z.array(record.extend({ unitId: id, processId: id })),
    teams: z.array(record.extend({ processId: id })),
    people: z.array(record.extend({ role: z.enum(["admin", "planner", "production"]), unitIds: z.array(id), teamIds: z.array(id), calendarIds: z.array(id), processIds: z.array(id).optional() })).min(1)
  }),
  products: z.array(record.extend({ sku: name, uom: name, productType: z.enum(["Finished Good", "Intermediate", "Packaging", "Raw Material"]), active, batchQuantity: number.positive().optional(), batchSizeKg: number.positive().optional() })),
  workCentres: z.array(record.extend({ code: name, description: text.optional(), active })),
  machines: z.array(record.extend({ code: name, workCentreId: id, unitId: id, processIds: z.array(id).min(1), setupMinutes: number.int().nonnegative(), capacity: number.positive().optional(), capacityUom: text.optional(), capacityNotes: text.optional(), active })),
  measurements: settings,
  data: z.object({
    lines: z.array(z.object({ id, calendarId: id, planId: id, productId: id, quantity: number.positive(), plannedDate: date, endDate: date.optional(),
      priority: z.enum(["Low", "Normal", "High", "Urgent"]), status: z.enum(["Unscheduled", "Partially Scheduled", "Fully Scheduled"]),
      startedAt: date.optional(), productionNotes: text.optional(),
      completedAt: timestamp.optional(), yieldQuantity: number.nonnegative().optional(), yieldUom: name.optional(),
      weighedQuantity: number.nonnegative().optional(), weighedUom: name.optional(), actualUnitWeightMg: number.positive().optional(), actualUnitVolumeMl: number.positive().optional(), incomingWipId: id.optional(), uom: name.optional(),
      activityType: text.optional(), unitWeightMg: number.positive().optional(), batchSizeKg: number.nonnegative().optional(),
      teamId: text.optional(), productionOrderId: id.optional(), jobOrderId: id.optional(), orderReference: text.optional(), notes: text.optional() })),
    entries: z.array(z.object({ id, calendarId: id, planLineId: id, productId: id, workCentreId: id, machineId: id,
      startAt: timestamp, endAt: timestamp, status: z.enum(["Draft", "Confirmed", "In Progress", "Completed", "Blocked", "Cancelled"]),
      teamId: text.optional(), productionOrderId: id.optional(), reasonCode: text.optional(), notes: text.optional(), changedBy: text.optional() })),
    actuals: z.array(z.object({ calendarId: id, planLineId: id, teamId: text, actualQuantity: number.nonnegative(), plannedQuantity: number.positive(),
      uom: name, productionDate: date, hasDeviation: z.boolean(), deviation: text, correctiveAction: text, updatedBy: name, updatedAt: timestamp })),
    transfers: z.array(z.object({ id, sourceLineId: id, sourceCalendarId: id, calendarId: id, productId: id, quantity: number.positive(), uom: name,
      orderReference: text.optional(), notes: text, createdAt: timestamp, createdBy: name, receivedAt: timestamp.optional(), receivedBy: name.optional(), plannedLineId: id.optional(),
      wipRoom: z.boolean().optional() })),
    // Added after the first pilot release; older snapshots load with no orders.
    orders: z.array(z.object({ id, poNumber: name, customerName: text.optional(), customerId: id.optional(), number: number.int().positive().optional(), item: number.int().positive().optional(), format: z.enum(["Capsule", "Tablet", "Sachet", "Other"]).optional(), unitId: id.optional(), productId: id, quantity: number.positive(), uom: name, expectedDates: z.record(id, date), deliveryDate: date.optional(), receivedDate: date.optional(),
      notes: text.optional(), createdAt: timestamp, createdBy: name })).default([]),
    // Customer master and job orders came later still; older snapshots load with none.
    customers: z.array(z.object({ id, code: name, name, contactNotes: text.optional(), active })).default([]),
    jobOrders: z.array(z.object({ id, number: name, orderId: id, sequence: number.int().positive(), quantity: number.positive(), uom: name,
      batchSizeKg: number.positive().optional(), batchVolumeL: number.positive().optional(), packQuantity: number.positive().optional(), packUom: name.optional(), packSize: number.positive().optional(),
      boxQuantity: number.positive().optional(), packingNumber: z.string().trim().min(1).max(60).optional(),
      testedAt: timestamp.optional(), testedBy: text.optional(),
      releaseQuantity: number.nonnegative().optional(), releaseUom: name.optional(), releasedAt: timestamp.optional(), releasedBy: text.optional(),
      batchNumber: z.string().trim().max(60).optional(), batchNumberBy: text.optional(), batchNumberAt: timestamp.optional(),
      notes: text.optional(), createdAt: timestamp, createdBy: name })).default([])
  })
}).strict();

export type WorkspaceSnapshot = z.infer<typeof workspaceSchema>;
export type WorkspaceEnvelope = { revision: number; snapshot: WorkspaceSnapshot };

export function newWorkspace(): WorkspaceSnapshot {
  return workspaceSchema.parse({ schemaVersion: 1, directory: emptyDirectory(), products: [], workCentres: [], machines: [],
    measurements: measurementDefaults, data: { lines: [], entries: [], actuals: [], transfers: [], orders: [], customers: [], jobOrders: [] } });
}

// Validate structure and references before accepting a complete atomic save.
export function parseWorkspace(input: unknown): WorkspaceSnapshot {
  const state = workspaceSchema.parse(input);
  const { directory: d, data } = state;
  const has = (items: { id: string }[], value: string) => items.some((item) => item.id === value);
  const require = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  for (const list of [...Object.values(d), state.products, state.workCentres, state.machines, data.lines, data.entries, data.transfers, data.orders]) {
    require(new Set(list.map((item) => item.id)).size === list.length, "Duplicate record ID");
  }
  for (const list of [d.units.map((item) => item.name), d.processes.map((item) => item.name), state.products.map((item) => item.sku), state.machines.map((item) => item.code), state.workCentres.map((item) => item.code)]) {
    require(new Set(list.map((value) => value.toLowerCase())).size === list.length, "Duplicate name or code");
  }
  require(d.people.some((person) => person.role === "admin"), "Keep at least one administrator");
  for (const list of Object.values(state.measurements)) {
    require(list.some((item) => item.active), "Keep one active measurement option");
    require(new Set(list.map((item) => item.name.toLowerCase())).size === list.length, "Duplicate measurement option");
  }
  require(new Set(d.calendars.map((item) => `${item.unitId}:${item.processId}`)).size === d.calendars.length, "Duplicate unit process");
  d.calendars.forEach((item) => require(has(d.units, item.unitId) && has(d.processes, item.processId), "Invalid unit process"));
  d.teams.forEach((item) => require(has(d.processes, item.processId), "Invalid legacy team"));
  d.people.forEach((person) => require(person.unitIds.every((id) => has(d.units, id)) && person.teamIds.every((id) => has(d.teams, id)) && person.calendarIds.every((id) => d.calendars.some((calendar) => calendar.id === id && person.unitIds.includes(calendar.unitId))) && (person.processIds ?? []).every((id) => has(d.processes, id)), "Invalid person access"));
  state.machines.forEach((machine) => require(has(state.workCentres, machine.workCentreId) && machine.processIds.every((id) => d.calendars.some((calendar) => calendar.unitId === machine.unitId && calendar.processId === id)) && (machine.capacity === undefined || !!machine.capacityUom?.trim()), "Invalid machine configuration"));
  data.lines.forEach((line) => {
    require(has(d.calendars, line.calendarId) && has(state.products, line.productId), "Invalid plan references");
    require(!line.endDate || line.endDate > line.plannedDate, "Activity ends before it starts");
    require(!line.incomingWipId || has(data.transfers, line.incomingWipId), "Invalid incoming WIP");
    if (line.completedAt) require(line.yieldQuantity !== undefined && data.actuals.some((actual) => actual.planLineId === line.id && actual.actualQuantity === line.yieldQuantity), "Completed plan requires final yield");
  });
  data.entries.forEach((entry) => {
    const line = data.lines.find((line) => line.id === entry.planLineId);
    const calendar = d.calendars.find((calendar) => calendar.id === entry.calendarId);
    const machine = state.machines.find((machine) => machine.id === entry.machineId);
    require(!!line && line.calendarId === entry.calendarId && line.productId === entry.productId && !!machine && machine.workCentreId === entry.workCentreId && machine.unitId === calendar?.unitId && machine.processIds.includes(calendar?.processId ?? "") && Date.parse(entry.endAt) > Date.parse(entry.startAt), "Invalid production booking");
  });
  // A PO may have several product line items: each item number once, and one customer per PO.
  require(new Set(data.orders.map((item) => `${item.poNumber.trim().toLowerCase()}#${item.item ?? 1}`)).size === data.orders.length, "Duplicate PO line item");
  const poCustomers = new Map<string, string>();
  data.orders.forEach((item) => {
    const po = item.poNumber.trim().toLowerCase(), customer = item.customerName?.trim().toLowerCase();
    if (!customer) return;
    require((poCustomers.get(po) ?? customer) === customer, "PO number used by two customers");
    poCustomers.set(po, customer);
  });
  data.orders.forEach((order) => require(has(state.products, order.productId), "Invalid order product"));
  data.orders.forEach((order) => require(!order.unitId || has(d.units, order.unitId), "Invalid order production unit"));
  require(new Set(data.customers.map((item) => item.code.trim().toLowerCase())).size === data.customers.length, "Duplicate customer ID");
  data.orders.forEach((order) => require(!order.customerId || has(data.customers, order.customerId), "Invalid order customer"));
  require(new Set(data.jobOrders.map((item) => item.number.trim().toLowerCase())).size === data.jobOrders.length, "Duplicate job order number");
  const batchNumbers = data.jobOrders.map((item) => item.batchNumber?.trim().toLowerCase()).filter(Boolean);
  require(new Set(batchNumbers).size === batchNumbers.length, "Duplicate batch number");
  data.jobOrders.forEach((job) => require(has(data.orders, job.orderId), "Invalid job order PO"));
  data.lines.forEach((line) => {
    if (!line.jobOrderId) return;
    const job = data.jobOrders.find((item) => item.id === line.jobOrderId);
    const order = data.orders.find((item) => item.id === job?.orderId);
    require(!!job && !!order && order.productId === line.productId && line.productionOrderId === order.id, "Activity linked to an invalid job order");
  });
  const numbered = data.orders.filter((order) => order.number !== undefined);
  require(new Set(numbered.map((order) => order.number)).size === numbered.length, "Duplicate order number");
  require(new Set(data.actuals.map((item) => item.planLineId)).size === data.actuals.length, "Duplicate actual result");
  data.actuals.forEach((actual) => require(data.lines.some((line) => line.id === actual.planLineId && line.calendarId === actual.calendarId) && (!actual.hasDeviation || !!actual.deviation.trim()), "Invalid actual result"));
  require(new Set(data.transfers.map((item) => item.sourceLineId)).size === data.transfers.length, "Duplicate WIP handoff");
  data.transfers.forEach((transfer) => require(data.lines.some((line) => line.id === transfer.sourceLineId && !!line.completedAt && line.calendarId === transfer.sourceCalendarId && line.productId === transfer.productId) && has(d.calendars, transfer.calendarId) && (!transfer.plannedLineId || data.lines.some((line) => line.id === transfer.plannedLineId && line.incomingWipId === transfer.id && line.calendarId === transfer.calendarId)), "Invalid WIP references"));
  return state;
}
