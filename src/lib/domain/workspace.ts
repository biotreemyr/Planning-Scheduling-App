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
    units: z.array(record),
    processes: z.array(record.extend({ settings: z.object({
      forms: z.array(z.enum(["Capsule", "Tablet", "Sachet"])), optional: z.boolean(),
      planned: z.enum(["batchSize", "batchQuantity", "packQuantity", "boxes", "none"]), report: z.enum(["measure", "count", "packs", "boxes"])
    }).optional() })),
    calendars: z.array(record.extend({ unitId: id, processId: id })),
    teams: z.array(record.extend({ processId: id })),
    people: z.array(record.extend({ role: z.enum(["admin", "planner", "production"]), unitIds: z.array(id), teamIds: z.array(id), calendarIds: z.array(id), processIds: z.array(id).optional() })).min(1)
  }),
  products: z.array(record.extend({ sku: name, uom: name, productType: z.enum(["Finished Good", "Intermediate", "Packaging", "Raw Material"]), active, batchQuantity: number.positive().optional(), batchSizeKg: number.positive().optional(), masterDataId: z.string().uuid().optional(), rnd: z.boolean().optional() })),
  workCentres: z.array(record.extend({ code: name, description: text.optional(), active })),
  machines: z.array(record.extend({ code: name, workCentreId: id, unitId: id, processIds: z.array(id).min(1), setupMinutes: number.int().nonnegative(), capacity: number.positive().optional(), capacityUom: text.optional(), capacityNotes: text.optional(), active, masterDataId: z.string().uuid().optional() })),
  measurements: settings,
  // QA's acceptable step yield per process (by process id) and final yield, in %. Older workspaces have none.
  yieldLimits: z.object({ byProcess: z.record(id, z.object({ min: z.number().min(0).max(200).optional(), max: z.number().min(0).max(200).optional() })),
    final: z.object({ min: z.number().min(0).max(200).optional(), max: z.number().min(0).max(200).optional() }).optional() }).default({ byProcess: {} }),
  data: z.object({
    lines: z.array(z.object({ id, plannedBy: text.optional(), plannedAt: timestamp.optional(), updatedBy: text.optional(), updatedAt: timestamp.optional(), plannedMachineId: id.optional(), plannedMachineIds: z.array(id).optional(), calendarId: id, planId: id, productId: id, quantity: number.positive(), plannedDate: date, endDate: date.optional(),
      priority: z.enum(["Low", "Normal", "High", "Urgent"]), status: z.enum(["Unscheduled", "Partially Scheduled", "Fully Scheduled"]),
      startedAt: date.optional(), productionNotes: text.optional(), progressQuantity: number.nonnegative().optional(), progressUom: name.optional(), progressUnitSize: number.positive().optional(), progressDestination: text.optional(),
      completedAt: timestamp.optional(), yieldQuantity: number.nonnegative().optional(), yieldUom: name.optional(),
      weighedQuantity: number.nonnegative().optional(), weighedUom: name.optional(), actualUnitWeightMg: number.positive().optional(), actualUnitVolumeMl: number.positive().optional(), shellWeightMg: number.positive().max(1000).optional(), incomingWipId: id.optional(), uom: name.optional(),
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
    orders: z.array(z.object({ id, updatedBy: text.optional(), updatedAt: timestamp.optional(), poNumber: name, customerName: text.optional(), customerId: id.optional(), number: number.int().positive().optional(), item: number.int().positive().optional(), format: z.enum(["Capsule", "Tablet", "Sachet", "Other"]).optional(), unitId: id.optional(), productId: id, quantity: number.positive(), uom: name, expectedDates: z.record(id, date), deliveryDate: date.optional(), receivedDate: date.optional(), soNumber: z.string().trim().max(60).optional(), unitWeightMg: number.positive().optional(), unitsPerPack: number.int().positive().optional(),
      category: z.enum(["R&D", "Trial", "Pilot batch"]).optional(),
      closedQuantity: number.nonnegative().optional(), closedUom: name.optional(), closedAt: timestamp.optional(), closedBy: text.optional(), closeNote: z.string().trim().max(500).optional(),
      notes: text.optional(), createdAt: timestamp, createdBy: name })).default([]),
    // Customer master and job orders came later still; older snapshots load with none.
    customers: z.array(z.object({ id, code: name, name, contactNotes: text.optional(), active, masterDataId: z.string().uuid().optional() })).default([]),
    jobOrders: z.array(z.object({ id, updatedBy: text.optional(), updatedAt: timestamp.optional(), number: name, orderId: id, sequence: number.int().positive(), quantity: number.positive(), uom: name,
      batchSizeKg: number.positive().optional(), batchVolumeL: number.positive().optional(), packQuantity: number.positive().optional(), packUom: name.optional(), packSize: number.positive().optional(),
      boxQuantity: number.positive().optional(), packingNumber: z.string().trim().min(1).max(60).optional(),
      shares: z.array(z.object({ orderId: id, quantity: number.positive(), packQuantity: number.positive().optional(), packUom: name.optional(), packSize: number.positive().optional(),
        boxQuantity: number.positive().optional(), packingNumber: z.string().trim().min(1).max(60).optional() })).max(4).optional(),
      formulaConfirmedBy: text.optional(), formulaConfirmedAt: timestamp.optional(),
      poReleases: z.array(z.object({ orderId: id, quantity: number.nonnegative(), uom: name, otherUses: z.array(z.object({ quantity: number.positive(), note: z.string().trim().min(1).max(200) })).max(20).optional(),
        releasedAt: timestamp, releasedBy: text })).max(5).optional(),
      testedAt: timestamp.optional(), testedBy: text.optional(), testResult: z.enum(["Passed", "Failed", "Under investigation"]).optional(),
      releaseQuantity: number.nonnegative().optional(), releaseUom: name.optional(), releasedAt: timestamp.optional(), releasedBy: text.optional(), rejectedAt: timestamp.optional(), rejectedBy: text.optional(),
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
// The most records a list may hold: far above a factory's use, low enough that checking a save stays quick.
const MAX_RECORDS = 20000;
function checkSize(input: unknown) {
  const lists = (value: unknown) => value && typeof value === "object" ? Object.values(value as Record<string, unknown>).filter(Array.isArray) : [];
  const root = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if ([...lists(root), ...lists(root.directory), ...lists(root.data)].some((list) => list.length > MAX_RECORDS)) throw new Error("Too many records");
}

export function parseWorkspace(input: unknown): WorkspaceSnapshot {
  checkSize(input);
  const state = workspaceSchema.parse(input);
  const { directory: d, data } = state;
  // Each list's IDs, looked up once: a save is checked in time that grows with its size, not its square.
  const idSets = new WeakMap<object, Set<string>>();
  const has = (items: { id: string }[], value: string) => {
    let set = idSets.get(items);
    if (!set) idSets.set(items, set = new Set(items.map((item) => item.id)));
    return set.has(value);
  };
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
  const lineById = byId(data.lines), calendarById = byId(d.calendars), machineById = byId(state.machines);
  const actualQuantities = new Map<string, number[]>();
  data.actuals.forEach((actual) => actualQuantities.set(actual.planLineId, [...actualQuantities.get(actual.planLineId) ?? [], actual.actualQuantity]));
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
    if (line.completedAt) require(line.yieldQuantity !== undefined && !!actualQuantities.get(line.id)?.includes(line.yieldQuantity), "Completed plan requires final yield");
  });
  data.entries.forEach((entry) => {
    const line = lineById.get(entry.planLineId);
    const calendar = calendarById.get(entry.calendarId);
    const machine = machineById.get(entry.machineId);
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
  // A shared batch serves at most 5 POs, each once, each a PO item of the same dosage form.
  data.jobOrders.forEach((job) => {
    const ids = [job.orderId, ...(job.shares ?? []).map((share) => share.orderId)];
    require(new Set(ids).size === ids.length && ids.every((id) => has(data.orders, id)), "Invalid shared job order PO");
    require((job.poReleases ?? []).every((release) => ids.includes(release.orderId)) && new Set((job.poReleases ?? []).map((release) => release.orderId)).size === (job.poReleases ?? []).length, "Invalid job order release");
  });
  const jobById = byId(data.jobOrders), orderById = byId(data.orders);
  data.lines.forEach((line) => {
    if (!line.jobOrderId) return;
    const job = jobById.get(line.jobOrderId);
    // A shared batch's filling and packing belong to the PO they are done for, any PO the batch serves.
    const orderIds = job ? [job.orderId, ...(job.shares ?? []).map((share) => share.orderId)] : [];
    const order = line.productionOrderId && orderIds.includes(line.productionOrderId) ? orderById.get(line.productionOrderId) : undefined;
    require(!!job && !!order && order.productId === line.productId, "Activity linked to an invalid job order");
  });
  // Production orders and R&D, trial and pilot orders are numbered separately, each from 1.
  const numbered = data.orders.filter((order) => order.number !== undefined);
  require(new Set(numbered.map((order) => `${order.category ? "trial" : "production"}:${order.number}`)).size === numbered.length, "Duplicate order number");
  require(new Set(data.actuals.map((item) => item.planLineId)).size === data.actuals.length, "Duplicate actual result");
  data.actuals.forEach((actual) => require(lineById.get(actual.planLineId)?.calendarId === actual.calendarId && (!actual.hasDeviation || !!actual.deviation.trim()), "Invalid actual result"));
  require(new Set(data.transfers.map((item) => item.sourceLineId)).size === data.transfers.length, "Duplicate WIP handoff");
  data.transfers.forEach((transfer) => require(((line) => !!line && !!line.completedAt && line.calendarId === transfer.sourceCalendarId && line.productId === transfer.productId)(lineById.get(transfer.sourceLineId)) && has(d.calendars, transfer.calendarId) && (!transfer.plannedLineId || ((line) => !!line && line.incomingWipId === transfer.id && line.calendarId === transfer.calendarId)(lineById.get(transfer.plannedLineId))), "Invalid WIP references"));
  return state;
}
