import { parseWorkspace, type WorkspaceSnapshot } from "./workspace";
import { batchKilograms } from "@/lib/services/measurements";
import { inferFormat } from "@/lib/services/processRules";

// Every sample record carries this ID prefix so it can be found and removed before go-live.
export const SAMPLE_PREFIX = "sample-";
export const isSample = (id?: string) => !!id?.startsWith(SAMPLE_PREFIX);

type Snapshot = WorkspaceSnapshot;
type Line = Snapshot["data"]["lines"][number];

// The fermentation plant is switched off for now: its unit, machines, staff, products, plans and
// work-in-progress handover are left out. Set this to true to bring it back.
export const FERMENTATION = false;
const inFermentation = (key: string) => ["ferm", "soy", "enzyme", "dry", "fermA", "fermB", "spray", "mei", "lim"].includes(key);

const allUnits = [
  { id: "sample-unit-mfg", name: "Manufacturing (Sample)", processes: ["Dispensing", "Compression", "Capsulation", "Coating", "Filling", "Packing"] },
  { id: "sample-unit-ferm", name: "Fermentation Plant (Sample)", processes: ["Fermentation", "Drying"] }
];
const allProducts = [
  { key: "vitc", sku: "SMP-VCP28", name: "Vitamin C Plus (28 tabs x 1000mg)", uom: "tablets", weight: 1450 },
  { key: "vitb", sku: "SMP-VBP07", name: "Vitamin B Plus (7 tabs x 1000mg)", uom: "tablets", weight: 1300 },
  { key: "folic", sku: "SMP-FA400", name: "Folic Acid 400mcg Tablets", uom: "tablets", weight: 250 },
  { key: "mecob", sku: "SMP-MECOB", name: "Methylcobalamin Capsules", uom: "capsules", weight: 400 },
  { key: "iron", sku: "SMP-IRONB", name: "Iron Pyro B-Plus Capsules", uom: "capsules", weight: 500 },
  { key: "collagen", sku: "SMP-COLSC", name: "Collagen Peptide Sachet", uom: "sachets", weight: 5000 },
  { key: "soy", sku: "SMP-BSFP", name: "Black Soybean Fermented Powder", uom: "kg" },
  { key: "enzyme", sku: "SMP-ENZB", name: "Enzyme Blend Powder", uom: "kg" }
] as const;
const allCentres = [
  { key: "disp", code: "SMP-DISP", name: "Dispensing Room" }, { key: "comp", code: "SMP-COMP", name: "Compression Room" },
  { key: "caps", code: "SMP-CAPS", name: "Capsulation Room" }, { key: "coat", code: "SMP-COAT", name: "Coating Room" },
  { key: "fill", code: "SMP-FILL", name: "Filling Room" }, { key: "pack", code: "SMP-PACK", name: "Packing Hall" },
  { key: "ferm", code: "SMP-FERM", name: "Fermentation Hall" }, { key: "dry", code: "SMP-DRY", name: "Drying Room" }
];
const allMachines = [
  { key: "booth1", code: "SMP-DB1", name: "Dispensing Booth 1", unit: "mfg", centre: "disp", processes: ["Dispensing"], setup: 15 },
  { key: "booth2", code: "SMP-DB2", name: "Dispensing Booth 2", unit: "mfg", centre: "disp", processes: ["Dispensing"], setup: 15 },
  { key: "press1", code: "SMP-RP1", name: "Rotary Press 1", unit: "mfg", centre: "comp", processes: ["Compression"], setup: 45 },
  { key: "press2", code: "SMP-RP2", name: "Rotary Press 2", unit: "mfg", centre: "comp", processes: ["Compression"], setup: 45 },
  { key: "capfill", code: "SMP-CF1", name: "Capsule Filler 1", unit: "mfg", centre: "caps", processes: ["Capsulation"], setup: 30 },
  { key: "coater", code: "SMP-CP1", name: "Coating Pan 1", unit: "mfg", centre: "coat", processes: ["Coating"], setup: 40, capacity: 150, capacityUom: "kg per batch" },
  { key: "fill1", code: "SMP-BF1", name: "Bottle Filling Line 1", unit: "mfg", centre: "fill", processes: ["Filling"], setup: 30 },
  { key: "fill2", code: "SMP-BF2", name: "Bottle Filling Line 2", unit: "mfg", centre: "fill", processes: ["Filling"], setup: 30 },
  { key: "pack1", code: "SMP-PK1", name: "Packing Line 1", unit: "mfg", centre: "pack", processes: ["Packing"], setup: 20 },
  { key: "pack2", code: "SMP-PK2", name: "Packing Line 2", unit: "mfg", centre: "pack", processes: ["Packing"], setup: 20 },
  { key: "fermA", code: "SMP-FA", name: "Fermenter A", unit: "ferm", centre: "ferm", processes: ["Fermentation"], setup: 60 },
  { key: "fermB", code: "SMP-FB", name: "Fermenter B", unit: "ferm", centre: "ferm", processes: ["Fermentation"], setup: 60 },
  { key: "spray", code: "SMP-SD1", name: "Spray Dryer 1", unit: "ferm", centre: "dry", processes: ["Drying"], setup: 30 }
];
const allPeople = [
  { key: "aida", name: "Aida (Sample planner)", role: "planner" as const, unit: "mfg" },
  { key: "mei", name: "Mei (Sample planner)", role: "planner" as const, unit: "ferm" },
  { key: "kumar", name: "Kumar (Sample production)", role: "production" as const, unit: "mfg" },
  { key: "lim", name: "Lim (Sample production)", role: "production" as const, unit: "ferm" }
];
type ProductKey = (typeof allProducts)[number]["key"];
// Each step runs for a number of working days; the next step starts on the following working day.
type Route = [process: string, days: number][];
const coatedTablet: Route = [["Dispensing", 1], ["Compression", 2], ["Coating", 2], ["Filling", 2], ["Packing", 1]];
const capsule: Route = [["Dispensing", 1], ["Capsulation", 2], ["Filling", 2], ["Packing", 1]];
const sachet: Route = [["Dispensing", 1], ["Filling", 2], ["Packing", 1]];
const routes: Record<ProductKey, Route> = {
  vitc: coatedTablet, vitb: coatedTablet, folic: coatedTablet, mecob: capsule, iron: capsule, collagen: sachet,
  soy: [["Fermentation", 1]], enzyme: [["Fermentation", 1]]
};
const quantities: Record<ProductKey, number> = { vitc: 280000, vitb: 140000, folic: 300000, mecob: 120000, iron: 150000, collagen: 60000, soy: 800, enzyme: 450 };
// Start is in working days from Monday of the current week, so the calendar always shows work around today.
const allBatches: { product: ProductKey; batch: number; start: number; priority?: Line["priority"]; route?: Route; notes?: string }[] = [
  { product: "vitc", batch: 3, start: -14, priority: "High" }, { product: "folic", batch: 1, start: -13 }, { product: "vitb", batch: 1, start: -12 },
  { product: "mecob", batch: 1, start: -11, priority: "High" }, { product: "vitc", batch: 4, start: -9 }, { product: "iron", batch: 1, start: -8 },
  { product: "mecob", batch: 2, start: -5 }, { product: "vitc", batch: 5, start: -4, priority: "Urgent", notes: "Customer launch date fixed. Expedite packing." },
  { product: "folic", batch: 2, start: -3 }, { product: "vitb", batch: 2, start: -2 }, { product: "mecob", batch: 3, start: 0 },
  { product: "vitc", batch: 6, start: 1 }, { product: "iron", batch: 2, start: 3, priority: "High" }, { product: "vitc", batch: 7, start: 6, priority: "Low" },
  { product: "mecob", batch: 4, start: 7 }, { product: "vitb", batch: 3, start: 8 }, { product: "folic", batch: 3, start: 9 },
  { product: "vitc", batch: 8, start: 11 }, { product: "iron", batch: 3, start: 13 },
  { product: "collagen", batch: 1, start: -6 },
  // Deliberately out of order: packing before filling, to show the process-flow warning.
  { product: "collagen", batch: 2, start: 2, route: [["Dispensing", 1], ["Packing", 1], ["Filling", 2]], notes: "Sample: packing is planned before filling, to show a process-flow warning." },
  { product: "soy", batch: 1, start: -9, priority: "High", notes: "Fermentation batch for black soybean powder." }, { product: "enzyme", batch: 1, start: -4 },
  { product: "soy", batch: 2, start: 0, route: [["Fermentation", 2], ["Drying", 1]] }, { product: "enzyme", batch: 2, start: 4, priority: "High", route: [["Fermentation", 2], ["Drying", 1]] },
  { product: "soy", batch: 3, start: 10, route: [["Fermentation", 2], ["Drying", 1]] }
];

// Purchase orders covering the batches above. Order quantity is the total of its batches.
// Orders with no batches are newly received and not scheduled yet.
const allPurchaseOrders: { po: string; customer: string; product: ProductKey; batches: number[]; quantity?: number }[] = [
  { po: "PO-2609-118", customer: "Greenleaf Wellness (Sample)", product: "vitc", batches: [3, 4, 5] },
  { po: "PO-2610-131", customer: "Greenleaf Wellness (Sample)", product: "vitc", batches: [6, 7, 8] },
  { po: "PO-2609-122", customer: "Vitara Nutrition (Sample)", product: "vitb", batches: [1, 2, 3] },
  { po: "PO-2609-125", customer: "Harmoni Health (Sample)", product: "folic", batches: [1, 2, 3] },
  { po: "PO-2609-120", customer: "Vitara Nutrition (Sample)", product: "mecob", batches: [1, 2] },
  { po: "PO-2610-133", customer: "Kinabalu Pharmacy (Sample)", product: "mecob", batches: [3, 4] },
  { po: "PO-2609-127", customer: "Harmoni Health (Sample)", product: "iron", batches: [1, 2, 3] },
  { po: "PO-2609-115", customer: "Sungai Organics (Sample)", product: "soy", batches: [1, 2, 3] },
  { po: "PO-2609-116", customer: "Sungai Organics (Sample)", product: "enzyme", batches: [1, 2] },
  { po: "PO-2610-140", customer: "Greenleaf Wellness (Sample)", product: "vitb", batches: [], quantity: 280000 },
  { po: "PO-2610-142", customer: "Kinabalu Pharmacy (Sample)", product: "folic", batches: [], quantity: 600000 },
  { po: "PO-2610-145", customer: "Vitara Nutrition (Sample)", product: "iron", batches: [], quantity: 300000 },
  { po: "PO-2610-147", customer: "Harmoni Health (Sample)", product: "vitc", batches: [], quantity: 560000 },
  { po: "PO-2610-150", customer: "Sungai Organics (Sample)", product: "soy", batches: [], quantity: 1600 },
  { po: "PO-2610-151", customer: "Greenleaf Wellness (Sample)", product: "mecob", batches: [], quantity: 240000 },
  { po: "PO-2609-129", customer: "Kinabalu Pharmacy (Sample)", product: "collagen", batches: [1, 2] }
];
// Sample customers carry a customer ID like a real customer master.
const customerCodes: Record<string, string> = {
  "Greenleaf Wellness (Sample)": "SMP-C001", "Vitara Nutrition (Sample)": "SMP-C002", "Harmoni Health (Sample)": "SMP-C003",
  "Kinabalu Pharmacy (Sample)": "SMP-C004", "Sungai Organics (Sample)": "SMP-C005"
};
const customerId = (name: string) => `${SAMPLE_PREFIX}customer-${customerCodes[name].toLowerCase()}`;
const orderId = (po: string) => `${SAMPLE_PREFIX}order-${po.toLowerCase()}`;
const jobId = (key: string) => `${SAMPLE_PREFIX}job-${key}`;

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function workday(monday: Date, offset: number) {
  const date = new Date(monday);
  const step = offset < 0 ? -1 : 1;
  for (let remaining = Math.abs(offset); remaining > 0;) {
    date.setDate(date.getDate() + step);
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1;
  }
  return date;
}

export function hasSampleData(state: Snapshot) {
  return state.directory.units.some((unit) => isSample(unit.id)) || state.products.some((product) => isSample(product.id));
}

// Build sample units, people, machines and a realistic plan dated around `today`, merged into `state`.
export function addSampleData(state: Snapshot, today = new Date(), options = { fermentation: FERMENTATION }): { state?: Snapshot; errors: string[] } {
  if (hasSampleData(state)) return { errors: ["Sample data is already loaded. Remove it first to reload."] };
  const pick = <T,>(items: readonly T[], keyOf: (item: T) => string) => options.fermentation ? [...items] : items.filter((item) => !inFermentation(keyOf(item)));
  const units = pick(allUnits, (unit) => unit.id.slice("sample-unit-".length));
  const products = pick(allProducts, (product) => product.key);
  const centres = pick(allCentres, (centre) => centre.key);
  const machines = pick(allMachines, (machine) => machine.key);
  const people = pick(allPeople, (person) => person.key);
  const batches = pick(allBatches, (batch) => batch.product);
  const purchaseOrders = pick(allPurchaseOrders, (order) => order.product);
  const orderFor = (product: ProductKey, batch: number) => purchaseOrders.find((order) => order.product === product && order.batches.includes(batch));
  const next: Snapshot = structuredClone(state);
  const d = next.directory;
  const processId = (name: string) => {
    const existing = d.processes.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const id = `${SAMPLE_PREFIX}process-${name.toLowerCase()}`;
    d.processes.push({ id, name });
    return id;
  };
  const calendarId = (unit: string, process: string) => `${SAMPLE_PREFIX}cal-${unit}-${process.toLowerCase()}`;
  for (const unit of units) {
    d.units.push({ id: unit.id, name: unit.name });
    for (const process of unit.processes) d.calendars.push({ id: calendarId(unit.id.slice(-4).replace("-", ""), process), unitId: unit.id, processId: processId(process), name: process });
  }
  const unitId = (key: string) => units.find((unit) => unit.id.endsWith(key))!.id;
  const calendarFor = (unitKey: string, process: string) => d.calendars.find((item) => item.id === calendarId(unitKey, process))!;
  for (const person of people) {
    const unit = units.find((item) => item.id.endsWith(person.unit))!;
    d.people.push({
      id: `${SAMPLE_PREFIX}person-${person.key}`, name: person.name, role: person.role, unitIds: [unit.id], teamIds: [],
      calendarIds: person.role === "planner" ? unit.processes.map((process) => calendarFor(person.unit, process).id) : [],
      ...(person.role === "production" ? { processIds: unit.processes.map(processId) } : {})
    });
  }
  // Administrators need the sample units to open their calendars.
  for (const admin of d.people.filter((person) => person.role === "admin")) admin.unitIds.push(...units.map((unit) => unit.id));

  // Each product's allowable batch is one sample batch; its kilograms follow from the unit weight.
  for (const product of products) {
    const kg = batchKilograms(quantities[product.key], product.uom, "weight" in product ? product.weight : undefined);
    next.products.push({ id: `${SAMPLE_PREFIX}product-${product.key}`, sku: product.sku, name: product.name, uom: product.uom, productType: "Finished Good", active: "Active",
      batchQuantity: quantities[product.key], ...(kg ? { batchSizeKg: kg } : {}) });
  }
  for (const centre of centres) next.workCentres.push({ id: `${SAMPLE_PREFIX}wc-${centre.key}`, code: centre.code, name: centre.name, description: "Sample work centre", active: "Active" });
  for (const machine of machines) next.machines.push({
    id: `${SAMPLE_PREFIX}machine-${machine.key}`, code: machine.code, name: machine.name, workCentreId: `${SAMPLE_PREFIX}wc-${machine.centre}`,
    unitId: unitId(machine.unit), processIds: machine.processes.map(processId), setupMinutes: machine.setup,
    ...(machine.capacity ? { capacity: machine.capacity, capacityUom: machine.capacityUom } : {}), active: "Active"
  });

  const now = new Date(today);
  const todayKey = dateKey(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const bookingLimit = dateKey(workday(monday, 12));
  const slots = [["08:00", "12:00"], ["13:00", "17:00"]] as const;
  const booked = new Set<string>();
  const stamp = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();
  // Bookings use the same local "YYYY-MM-DDTHH:mm" form the booking screens save.
  const local = (date: string, time: string) => `${date}T${time}`;
  const { lines, entries, actuals, transfers } = next.data;

  let deviationRecorded = false;
  batches.forEach((batch, batchIndex) => {
    const product = products.find((item) => item.key === batch.product)!;
    const route = batch.route ?? routes[batch.product];
    const unitKey = route.some(([process]) => process === "Fermentation") ? "ferm" : "mfg";
    const key = `${batch.product}-b${batch.batch}`;
    const batchQuantity = quantities[batch.product];
    const order = orderFor(batch.product, batch.batch);
    const unitWeightMg = "weight" in product ? product.weight : undefined;
    let offset = batch.start;
    route.forEach(([process, days], stepIndex) => {
      for (let day = 1; day <= days; day += 1, offset += 1) {
        // A multi-day step splits the batch across its days; the last day takes any remainder.
        const quantity = day < days ? Math.round(batchQuantity / days) : batchQuantity - Math.round(batchQuantity / days) * (days - 1);
        const plannedDate = dateKey(workday(monday, offset));
        const calendar = calendarFor(unitKey, process);
        const suffix = `${key}-${process.toLowerCase()}-${day}`;
        const id = `${SAMPLE_PREFIX}line-${suffix}`;
        const line: Line = {
          id, calendarId: calendar.id, planId: "production-plan", productId: `${SAMPLE_PREFIX}product-${product.key}`, quantity, uom: product.uom,
          plannedDate, priority: batch.priority ?? "Normal", status: "Unscheduled", activityType: process, orderReference: `Batch ${batch.batch}`,
          ...(order ? { productionOrderId: orderId(order.po), jobOrderId: jobId(key) } : {}),
          ...(unitWeightMg ? { unitWeightMg } : {}), batchSizeKg: batchKilograms(quantity, product.uom, unitWeightMg),
          ...(stepIndex === 0 && day === 1 && batch.notes ? { notes: batch.notes } : {})
        };
        lines.push(line);
        const done = plannedDate < todayKey;
        if (plannedDate > bookingLimit) continue;
        const machine = next.machines.find((item) => isSample(item.id) && item.unitId === unitId(unitKey) && item.processIds.includes(calendar.processId) &&
          slots.some(([start]) => !booked.has(`${item.id}:${plannedDate}:${start}`)));
        if (!machine) continue;
        const [start, end] = slots.find(([slot]) => !booked.has(`${machine.id}:${plannedDate}:${slot}`))!;
        booked.add(`${machine.id}:${plannedDate}:${start}`);
        entries.push({
          id: `${SAMPLE_PREFIX}entry-${suffix}`, calendarId: calendar.id, planLineId: id, productId: line.productId,
          workCentreId: machine.workCentreId, machineId: machine.id, startAt: local(plannedDate, start), endAt: local(plannedDate, end),
          status: done ? "Completed" : plannedDate === todayKey ? "In Progress" : "Confirmed", changedBy: "Sample data"
        });
        line.status = "Partially Scheduled";
        if (!done) continue;
        // Completed work carries a final yield; the first finished capsulation shows a recorded deviation.
        const deviation = !deviationRecorded && process === "Capsulation";
        if (deviation) deviationRecorded = true;
        const yieldQuantity = Math.round(quantity * (deviation ? 0.93 : 0.97 + ((batchIndex + stepIndex + day) % 3) * 0.01));
        line.completedAt = stamp(plannedDate, end);
        line.yieldQuantity = yieldQuantity;
        actuals.push({
          calendarId: calendar.id, planLineId: id, teamId: "", actualQuantity: yieldQuantity, plannedQuantity: quantity, uom: product.uom, productionDate: plannedDate,
          hasDeviation: deviation, deviation: deviation ? "Capsule weight variation above limit on first 2,000 units; line paused and re-adjusted." : "",
          correctiveAction: deviation ? "Re-calibrated dosing disc; rejected units quarantined." : "", updatedBy: "Sample data", updatedAt: line.completedAt
        });
      }
    });
  });

  // Completed fermentation batches hand work in progress to drying: one received and planned, one waiting.
  const handoffs = [{ ref: "soy-b1", receive: true }, { ref: "enzyme-b1", receive: false }];
  for (const handoff of handoffs) {
    const source = lines.find((line) => line.id === `${SAMPLE_PREFIX}line-${handoff.ref}-fermentation-1`);
    if (!source?.completedAt || source.yieldQuantity === undefined) continue;
    const transfer: Snapshot["data"]["transfers"][number] = {
      id: `${SAMPLE_PREFIX}wip-${handoff.ref}`, sourceLineId: source.id, sourceCalendarId: source.calendarId, calendarId: calendarFor("ferm", "Drying").id,
      productId: source.productId, quantity: source.yieldQuantity, uom: source.uom!, orderReference: source.orderReference, notes: "Fermented base ready for spray drying.",
      createdAt: source.completedAt, createdBy: "Lim (Sample production)"
    };
    if (handoff.receive) {
      const lineId = `${SAMPLE_PREFIX}line-${handoff.ref}-drying`;
      transfer.receivedAt = source.completedAt;
      transfer.receivedBy = "Lim (Sample production)";
      transfer.plannedLineId = lineId;
      const plannedDate = dateKey(workday(monday, 1));
      lines.push({ ...source, id: lineId, calendarId: transfer.calendarId, quantity: transfer.quantity, plannedDate, activityType: "Drying", status: "Unscheduled",
        incomingWipId: transfer.id, notes: transfer.notes, completedAt: undefined, yieldQuantity: undefined, batchSizeKg: transfer.quantity });
    }
    transfers.push(transfer);
  }

  // One job order per sample batch on a PO. Batches already started carry the batch number production keyed in.
  for (const name of new Set(purchaseOrders.map((order) => order.customer))) {
    next.data.customers.push({ id: customerId(name), code: customerCodes[name], name, active: "Active" });
  }
  let jobNumber = 0;
  for (const batch of batches) {
    const order = orderFor(batch.product, batch.batch);
    if (!order) continue;
    const product = products.find((item) => item.key === batch.product)!;
    const key = `${batch.product}-b${batch.batch}`;
    const started = lines.some((line) => line.jobOrderId === jobId(key) && line.completedAt);
    const kg = batchKilograms(quantities[batch.product], product.uom, "weight" in product ? product.weight : undefined);
    next.data.jobOrders.push({
      id: jobId(key), number: `JO-SMP-${String(++jobNumber).padStart(3, "0")}`, orderId: orderId(order.po), sequence: order.batches.indexOf(batch.batch) + 1,
      quantity: quantities[batch.product], uom: product.uom, ...(kg ? { batchSizeKg: kg } : {}),
      ...(started ? { batchNumber: `${product.sku.slice(4)}-${String(batch.batch).padStart(3, "0")}`, batchNumberBy: "Kumar (Sample production)", batchNumberAt: stamp(dateKey(workday(monday, batch.start)), "08:00") } : {}),
      createdAt: stamp(dateKey(workday(monday, batch.start - 3)), "09:00"), createdBy: "Sample data"
    });
  }

  // Expected completion dates are keyed in for the earlier orders and left blank on the later ones.
  for (const [index, order] of purchaseOrders.entries()) {
    const product = products.find((item) => item.key === order.product)!;
    const linked = lines.filter((line) => line.productionOrderId === orderId(order.po));
    const expectedDates: Record<string, string> = {};
    if (index % 2 === 0) for (const line of linked) if (!expectedDates[line.calendarId] || expectedDates[line.calendarId] < line.plannedDate) expectedDates[line.calendarId] = line.plannedDate;
    next.data.orders.push({
      id: orderId(order.po), poNumber: order.po, customerName: order.customer, customerId: customerId(order.customer), number: index + 1, format: inferFormat(product), productId: `${SAMPLE_PREFIX}product-${product.key}`, quantity: order.quantity ?? quantities[order.product] * order.batches.length,
      uom: product.uom, expectedDates, createdAt: stamp(dateKey(workday(monday, order.batches.length ? -15 : index - 12)), "09:00"), createdBy: "Sample data"
    });
  }

  // One overlapping booking shows how machine conflicts are flagged.
  const clash = entries.find((entry) => entry.status === "Confirmed" && entry.machineId === `${SAMPLE_PREFIX}machine-press1`);
  if (clash) {
    const line = lines.find((item) => item.id === clash.planLineId)!;
    // 10:00 to 14:00 overlaps both the morning and the afternoon slot.
    const day = clash.startAt.slice(0, 10);
    entries.push({ ...clash, id: `${SAMPLE_PREFIX}entry-conflict`, startAt: local(day, "10:00"), endAt: local(day, "14:00"), notes: "Sample overlap: shows how a machine conflict is flagged." });
    line.status = "Fully Scheduled";
  }
  for (const line of lines) if (line.completedAt === undefined) delete line.completedAt;
  for (const line of lines) if (line.yieldQuantity === undefined) delete line.yieldQuantity;

  try { return { state: parseWorkspace(next), errors: [] }; }
  catch (error) { return { errors: [`Sample data could not be added: ${error instanceof Error ? error.message : "invalid workspace"}. Check for clashing unit names, product codes or machine codes.`] }; }
}

export type SampleRemoval = { state: Snapshot; removed: Record<"units" | "people" | "machines" | "products" | "lines" | "entries", number>; kept: string[] };

// Remove sample units and everything planned inside them. Sample master data still used by real records is kept.
// With `only`, just those sample units go; the other sample units and their records stay.
export function removeSampleData(state: Snapshot, only?: string[]): SampleRemoval {
  const next: Snapshot = structuredClone(state);
  const d = next.directory;
  const before = { units: d.units.length, people: d.people.length, machines: next.machines.length, products: next.products.length, lines: next.data.lines.length, entries: next.data.entries.length };
  const goes = (unitId: string) => isSample(unitId) && (!only || only.includes(unitId));
  // A sample record goes with the units being removed; without `only`, every sample record goes.
  const sampleGoes = (id: string, unitIds: string[]) => isSample(id) && (!only || unitIds.every(goes));
  d.units = d.units.filter((unit) => !goes(unit.id));
  const unitIds = new Set(d.units.map((unit) => unit.id));
  d.calendars = d.calendars.filter((calendar) => !(isSample(calendar.id) && !only) && unitIds.has(calendar.unitId));
  d.people = d.people.filter((person) => !sampleGoes(person.id, person.unitIds));
  next.machines = next.machines.filter((machine) => !sampleGoes(machine.id, [machine.unitId]) && unitIds.has(machine.unitId));
  const calendarIds = new Set(d.calendars.map((calendar) => calendar.id));
  const data = next.data;
  data.lines = data.lines.filter((line) => !(isSample(line.id) && !only) && calendarIds.has(line.calendarId));
  let lineIds = new Set(data.lines.map((line) => line.id));
  data.transfers = data.transfers.filter((item) => !(isSample(item.id) && !only) && lineIds.has(item.sourceLineId) && calendarIds.has(item.calendarId) && calendarIds.has(item.sourceCalendarId));
  const transferIds = new Set(data.transfers.map((item) => item.id));
  data.lines = data.lines.map((line) => line.incomingWipId && !transferIds.has(line.incomingWipId) ? (({ incomingWipId: _, ...rest }) => rest)(line) : line);
  lineIds = new Set(data.lines.map((line) => line.id));
  data.transfers = data.transfers.map((item) => item.plannedLineId && !lineIds.has(item.plannedLineId) ? (({ plannedLineId: _, ...rest }) => rest)(item) : item);
  const machineIds = new Set(next.machines.map((machine) => machine.id));
  data.entries = data.entries.filter((entry) => !(isSample(entry.id) && !only) && lineIds.has(entry.planLineId) && machineIds.has(entry.machineId));
  data.actuals = data.actuals.filter((actual) => lineIds.has(actual.planLineId));
  // Removing one unit: its sample orders go once no remaining activity makes their product.
  const productsPlanned = new Set(data.lines.map((line) => line.productId));
  data.orders = data.orders.filter((order) => !(isSample(order.id) && (!only || !productsPlanned.has(order.productId))));
  const orderIds = new Set(data.orders.map((order) => order.id));
  data.lines = data.lines.map((line) => line.productionOrderId && !orderIds.has(line.productionOrderId) ? (({ productionOrderId: _, ...rest }) => rest)(line) : line);
  data.entries = data.entries.map((entry) => entry.productionOrderId && !orderIds.has(entry.productionOrderId) ? (({ productionOrderId: _, ...rest }) => rest)(entry) : entry);
  data.jobOrders = data.jobOrders.filter((job) => orderIds.has(job.orderId) && !(isSample(job.id) && !only));
  const jobIds = new Set(data.jobOrders.map((job) => job.id));
  data.lines = data.lines.map((line) => line.jobOrderId && !jobIds.has(line.jobOrderId) ? (({ jobOrderId: _, ...rest }) => rest)(line) : line);
  const customersInUse = new Set(data.orders.map((order) => order.customerId));
  data.customers = data.customers.filter((customer) => !isSample(customer.id) || customersInUse.has(customer.id));

  // Keep sample master data that real records now depend on, so live work is never broken.
  const kept: string[] = [];
  const used = (ids: string[]) => new Set(ids);
  const processesInUse = used([...d.calendars.map((item) => item.processId), ...d.teams.map((item) => item.processId), ...next.machines.flatMap((item) => item.processIds), ...d.people.flatMap((item) => item.processIds ?? [])]);
  const productsInUse = used([...data.lines.map((item) => item.productId), ...data.entries.map((item) => item.productId), ...data.transfers.map((item) => item.productId), ...data.orders.map((item) => item.productId)]);
  const centresInUse = used([...next.machines.map((item) => item.workCentreId), ...data.entries.map((item) => item.workCentreId)]);
  const prune = <T extends { id: string; name: string }>(items: T[], inUse: Set<string>) => items.filter((item) => {
    if (!isSample(item.id)) return true;
    if (inUse.has(item.id)) kept.push(item.name);
    return inUse.has(item.id);
  });
  d.processes = prune(d.processes, processesInUse);
  next.products = prune(next.products, productsInUse);
  next.workCentres = prune(next.workCentres, centresInUse);
  const teamIds = new Set(d.teams.map((team) => team.id));
  const processIds = new Set(d.processes.map((process) => process.id));
  d.people = d.people.map((person) => ({
    ...person, unitIds: person.unitIds.filter((id) => unitIds.has(id)), teamIds: person.teamIds.filter((id) => teamIds.has(id)), calendarIds: person.calendarIds.filter((id) => calendarIds.has(id)),
    ...(person.processIds ? { processIds: person.processIds.filter((id) => processIds.has(id)) } : {})
  }));

  const removed = {
    units: before.units - d.units.length, people: before.people - d.people.length, machines: before.machines - next.machines.length,
    products: before.products - next.products.length, lines: before.lines - data.lines.length, entries: before.entries - data.entries.length
  };
  return { state: parseWorkspace(next), removed, kept };
}
