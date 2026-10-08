import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import type { PurchaseOrder } from "./orders";
import { ROUTES, inferFormat, stepLabel, stepOf, type FlowWarning, type ProductFormat, type RouteStepName } from "./processRules";

/**
 * A job order is one batch of one PO item, released to production. Planning keys in its number
 * (issued outside the scheduler) on the PO; production keys in the batch number; every process
 * activity of that batch links back to it through `jobOrderId`.
 */
export type JobOrder = {
  id: string;
  // Keyed in by planning, e.g. "JO0009". Unique; renaming it relabels its activities.
  number: string;
  orderId: string;
  // 1, 2, 3... within its PO item.
  sequence: number;
  // Batch quantity in tablets or capsules: what compression, coating and capsulation make.
  quantity: number; uom: string;
  // Batch size dispensing weighs out, in kilograms or (for liquids) litres; one of the two.
  batchSizeKg?: number; batchVolumeL?: number;
  // Pack quantity filling makes: blisters, bottles or sachets, and how many units go in each.
  packQuantity?: number; packUom?: string; packSize?: number;
  // Total pack quantity packing makes, in boxes.
  boxQuantity?: number;
  // Packing's own job order number, e.g. PJO0009; when not keyed in it follows the job order number.
  packingNumber?: string;
  // Status: when the finished batch passed testing, and when (and how much of it) was released.
  testedAt?: string; testedBy?: string;
  releaseQuantity?: number; releaseUom?: string; releasedAt?: string; releasedBy?: string;
  // Keyed in by production; shown on every process activity of the job.
  batchNumber?: string;
  batchNumberBy?: string; batchNumberAt?: string;
  notes?: string; createdAt: string; createdBy: string;
};

export const jobsFor = (orderId: string, jobs: JobOrder[]) => jobs.filter((job) => job.orderId === orderId).sort((a, b) => a.sequence - b.sequence);
export const linesForJob = (jobId: string, lines: PlanLine[]) => lines.filter((line) => line.jobOrderId === jobId);
// Packing works to a packing job order numbered like the job order with PJO in front: JO0009 → PJO0009.
export const defaultPackingNumber = (number: string) => { const value = number.trim(); return /^jo/i.test(value) ? `PJO${value.slice(2)}` : `PJO${value}`; };
export const packingNumber = (job: Pick<JobOrder, "number" | "packingNumber">) => job.packingNumber?.trim() || defaultPackingNumber(job.number);
function packingNumberProblem(job: Pick<JobOrder, "id" | "number" | "packingNumber">, jobs: JobOrder[]) {
  const value = packingNumber(job).toLowerCase();
  if (value.length > 60) return "Keep the packing job order number to 60 characters.";
  const clash = jobs.find((other) => other.id !== job.id && packingNumber(other).toLowerCase() === value);
  return clash ? `Packing job order ${packingNumber(job)} is already used by ${clash.number}.` : "";
}
export const jobLabel = (job: JobOrder) => job.batchNumber ? `${job.number} · Batch no. ${job.batchNumber}` : job.number;

export function validateBatchNumber(value: string, job: JobOrder, jobs: JobOrder[]) {
  const batch = value.trim();
  if (batch.length > 60) return "Keep the batch number to 60 characters.";
  if (batch && jobs.some((other) => other.id !== job.id && other.batchNumber?.trim().toLowerCase() === batch.toLowerCase())) return `Batch number ${batch} is already used by another job order.`;
  return "";
}

// The job orders' total in the PO item's own unit may not pass the ordered quantity.
function overOrdered(order: PurchaseOrder, jobs: JobOrder[]) {
  const total = Number(jobs.filter((job) => job.orderId === order.id && job.uom === order.uom).reduce((sum, job) => sum + job.quantity, 0).toPrecision(12));
  return total > order.quantity ? `Job orders for ${order.poNumber} would add up to ${total.toLocaleString()} ${order.uom}, more than the ${order.quantity.toLocaleString()} ordered.` : "";
}

/**
 * Check an edited job order: number keyed in and unique, quantity within one allowable batch and
 * the PO item's quantity, batch number unique. Returns the saved job order or an error.
 */
export function updateJobOrder(next: JobOrder, jobs: JobOrder[], orders: PurchaseOrder[], products: Product[]): JobOrder | { error: string } {
  const number = next.number.trim();
  if (!number) return { error: "Key in the job order number." };
  if (number.length > 60) return { error: "Keep the job order number to 60 characters." };
  if (findJobByNumber(number, jobs.filter((job) => job.id !== next.id))) return { error: `Job order ${number} already exists.` };
  const order = orders.find((item) => item.id === next.orderId);
  if (!order) return { error: "This job order's PO no longer exists." };
  if (!Number.isFinite(next.quantity) || next.quantity <= 0) return { error: "Quantity must be greater than zero." };
  if (!next.uom.trim()) return { error: "Choose a UOM." };
  const packIssue = measureProblem(next) || packProblem(next);
  if (packIssue) return { error: packIssue };
  const missing = missingQuantity(next, formatOf(order, products));
  if (missing) return { error: missing };
  const allowable = products.find((product) => product.id === order.productId)?.batchQuantity;
  if (allowable && next.uom === order.uom && next.quantity > allowable) return { error: `One job order holds at most the allowable batch quantity of ${allowable.toLocaleString()} ${order.uom}.` };
  const { packingNumber: typed, ...base } = next;
  const saved: JobOrder = { ...base, number, ...(typed?.trim() && typed.trim() !== defaultPackingNumber(number) ? { packingNumber: typed.trim() } : {}) };
  const packingIssue = packingNumberProblem(saved, jobs);
  if (packingIssue) return { error: packingIssue };
  const batchProblem = validateBatchNumber(saved.batchNumber ?? "", saved, jobs);
  if (batchProblem) return { error: batchProblem };
  const over = overOrdered(order, [...jobs.filter((job) => job.id !== saved.id), saved]);
  return over ? { error: over } : saved;
}

export function validateCustomer(customer: Pick<Customer, "id" | "code" | "name">, customers: Customer[]) {
  const errors: string[] = [];
  const code = customer.code.trim();
  if (!code) errors.push("Enter the customer ID.");
  else if (customers.some((item) => item.id !== customer.id && item.code.trim().toLowerCase() === code.toLowerCase())) errors.push(`Customer ID ${code} is already used.`);
  if (!customer.name.trim()) errors.push("Enter the customer name.");
  return errors;
}
export const customerLabel = (customer?: Pick<Customer, "code" | "name">, fallbackName?: string) => customer ? `${customer.code} · ${customer.name}` : fallbackName ?? "";

export const findJobByNumber = (value: string, jobs: JobOrder[]) => {
  const number = value.trim().toLowerCase();
  return number ? jobs.find((job) => job.number.trim().toLowerCase() === number) : undefined;
};

export type ManualJob = { number: string; orderId: string; quantity: number; uom: string; batchSizeKg?: number; batchVolumeL?: number; packQuantity?: number; packUom?: string; packSize?: number; boxQuantity?: number; packingNumber?: string };

export type ProcessQuantity = { quantity: number; uom: string };
/**
 * The theoretical quantity a process of this job order makes, as keyed in on the job order:
 * dispensing its batch size (kg or L), compression, coating and capsulation its batch quantity
 * (tablets or capsules), filling its pack quantity (blisters, bottles, sachets), packing its boxes.
 */
export function processQuantity(job: JobOrder, step: RouteStepName): ProcessQuantity | undefined {
  if (step === "dispensing") return job.batchSizeKg ? { quantity: job.batchSizeKg, uom: "kg" } : job.batchVolumeL ? { quantity: job.batchVolumeL, uom: "L" } : undefined;
  if (step === "filling") return job.packQuantity && job.packUom ? { quantity: job.packQuantity, uom: job.packUom } : undefined;
  if (step === "packing") return job.boxQuantity ? { quantity: job.boxQuantity, uom: "boxes" } : undefined;
  return { quantity: job.quantity, uom: job.uom };
}
const MEASURE_NAME: Record<RouteStepName, string> = {
  dispensing: "batch size (kg or L)", tableting: "batch quantity", coating: "batch quantity", capsulation: "batch quantity",
  filling: "pack quantity (blisters, bottles or sachets)", packing: "total pack quantity (boxes)"
};
export const measureName = (step: RouteStepName) => MEASURE_NAME[step];
// The first process of the route whose quantity the job order is missing, as a message.
export function missingQuantity(job: JobOrder, format: ProductFormat) {
  if (format === "Other") return "";
  const step = ROUTES[format].find((item) => !processQuantity(job, item));
  return step ? `Key in the ${measureName(step)} for ${stepLabel(step)}.` : "";
}
const formatOf = (order: PurchaseOrder, products: Product[]) => order.format ?? inferFormat(products.find((product) => product.id === order.productId));

// Pack fields: optional, but a pack quantity needs its UOM and every number must be positive.
export function packProblem(job: Pick<ManualJob, "packQuantity" | "packUom" | "packSize">) {
  if (job.packSize !== undefined && !(job.packSize > 0)) return "Pack size must be greater than zero.";
  if (job.packQuantity !== undefined && !(job.packQuantity > 0)) return "Pack quantity must be greater than zero.";
  if (job.packQuantity !== undefined && !job.packUom?.trim()) return "Choose the pack UOM (blisters, bottles, sachets...).";
  return "";
}
// Dispensing's batch size is in kg or L, not both; box quantity must be positive.
function measureProblem(job: Pick<ManualJob, "batchSizeKg" | "batchVolumeL" | "boxQuantity">) {
  if (job.batchSizeKg !== undefined && !(job.batchSizeKg > 0)) return "Batch size must be greater than zero.";
  if (job.batchVolumeL !== undefined && !(job.batchVolumeL > 0)) return "Batch size must be greater than zero.";
  if (job.batchSizeKg !== undefined && job.batchVolumeL !== undefined) return "Key in the batch size in kg or in L, not both.";
  if (job.boxQuantity !== undefined && !(job.boxQuantity > 0)) return "Total pack quantity must be greater than zero.";
  return "";
}
// How many packs a quantity fills, rounded up: 125,000 capsules at 30 per bottle is 4,167 bottles.
export const packsFor = (quantity: number, packSize?: number) => packSize && packSize > 0 && quantity > 0 ? Math.ceil(Number((quantity / packSize).toPrecision(12))) : undefined;
const packFields = (job: Pick<ManualJob, "packQuantity" | "packUom" | "packSize" | "batchSizeKg" | "batchVolumeL" | "boxQuantity" | "packingNumber" | "number">) => ({
  ...(job.batchSizeKg ? { batchSizeKg: job.batchSizeKg } : {}), ...(job.batchVolumeL ? { batchVolumeL: job.batchVolumeL } : {}),
  ...(job.packQuantity ? { packQuantity: job.packQuantity } : {}), ...(job.packQuantity && job.packUom?.trim() ? { packUom: job.packUom.trim() } : {}), ...(job.packSize ? { packSize: job.packSize } : {}),
  ...(job.boxQuantity ? { boxQuantity: job.boxQuantity } : {}),
  // Kept only when it differs from the one the job order number gives.
  ...(job.packingNumber?.trim() && "number" in job && job.packingNumber.trim() !== defaultPackingNumber(String(job.number)) ? { packingNumber: job.packingNumber.trim() } : {})
});

/**
 * A job order keyed in by its number while planning, for job orders numbered outside the
 * scheduler. It still belongs to one PO item and holds no more than one allowable batch.
 */
export function createManualJobOrder(input: ManualJob, orders: PurchaseOrder[], jobs: JobOrder[], products: Product[], context: { today: Date; userName: string; newId: () => string }): JobOrder | { error: string } {
  const number = input.number.trim();
  if (!number) return { error: "Key in the job order number." };
  if (number.length > 60) return { error: "Keep the job order number to 60 characters." };
  if (findJobByNumber(number, jobs)) return { error: `Job order ${number} already exists.` };
  const order = orders.find((item) => item.id === input.orderId);
  if (!order) return { error: `Choose the PO item job order ${number} belongs to.` };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { error: "Quantity must be greater than zero." };
  const packIssue = measureProblem(input) || packProblem(input);
  if (packIssue) return { error: packIssue };
  const allowable = products.find((product) => product.id === order.productId)?.batchQuantity;
  if (allowable && input.uom === order.uom && input.quantity > allowable) return { error: `One job order holds at most the allowable batch quantity of ${allowable.toLocaleString()} ${order.uom}.` };
  const created: JobOrder = {
    id: context.newId(), number, orderId: order.id, sequence: Math.max(0, ...jobsFor(order.id, jobs).map((job) => job.sequence)) + 1,
    quantity: input.quantity, uom: input.uom, ...packFields({ ...input, number }), createdAt: context.today.toISOString(), createdBy: context.userName
  };
  const missing = missingQuantity(created, formatOf(order, products)) || packingNumberProblem(created, jobs);
  if (missing) return { error: missing };
  const over = overOrdered(order, [...jobs, created]);
  return over ? { error: over } : created;
}

const amount = (value: number) => Number(value.toPrecision(12)).toLocaleString("en-GB", { maximumFractionDigits: 3 });

/**
 * Every process of a job order must plan its theoretical quantity: the activities of one process
 * (one day or several) add up to the job order's figure for it, in its unit. Warns, never blocks.
 */
export function checkTally(lines: PlanLine[], jobs: JobOrder[], directory: CalendarDirectory): FlowWarning[] {
  const stepFor = (line: PlanLine) => {
    const calendar = directory.calendars.find((item) => item.id === line.calendarId);
    return stepOf(directory.processes.find((item) => item.id === calendar?.processId)?.name ?? calendar?.name ?? line.activityType ?? "");
  };
  return jobs.flatMap((job) => {
    const steps = new Map<RouteStepName, PlanLine[]>();
    for (const line of linesForJob(job.id, lines)) { const step = stepFor(line); if (step) steps.set(step, [...steps.get(step) ?? [], line]); }
    return [...steps].flatMap(([step, items]) => {
      const expected = processQuantity(job, step);
      if (!expected) return [];
      const planned = items.reduce((sum, line) => sum + (line.uom === expected.uom ? line.quantity : 0), 0);
      const otherUnit = items.some((line) => line.uom !== expected.uom);
      if (!otherUnit && Math.abs(planned - expected.quantity) < 1e-9 * Math.max(1, expected.quantity)) return [];
      const batch = job.batchNumber ? `${job.number} (batch ${job.batchNumber})` : job.number;
      return [{ kind: "tally" as const, lineIds: items.map((line) => line.id), orderId: job.orderId, batch: job.number,
        message: `${batch}: ${stepLabel(step)} is planned for ${otherUnit ? items.map((line) => `${amount(line.quantity)} ${line.uom ?? ""}`.trim()).join(" + ") : `${amount(planned)} ${expected.uom}`} but the job order's ${measureName(step)} is ${amount(expected.quantity)} ${expected.uom}.` }];
    });
  });
}

/**
 * What a job order has finished as final output: its completed activities whose output production
 * did not send on to another process or the WIP room, totalled per unit (boxes from packing).
 */
export function finalOutput(jobId: string, lines: PlanLine[], transfers: { sourceLineId: string }[]): ProcessQuantity[] {
  const totals = new Map<string, number>();
  for (const line of linesForJob(jobId, lines)) {
    if (!line.completedAt || line.yieldQuantity === undefined || transfers.some((transfer) => transfer.sourceLineId === line.id)) continue;
    const uom = line.yieldUom ?? line.uom ?? "";
    totals.set(uom, Number(((totals.get(uom) ?? 0) + line.yieldQuantity).toPrecision(12)));
  }
  return [...totals].map(([uom, quantity]) => ({ quantity, uom }));
}

// What a planned activity shows: its batch number (just the number), job order number, and the
// quantity in its process's unit, the actual once production completed it, else the planned one.
export function activityFacts(line: PlanLine, jobs: JobOrder[], productUom = "") {
  const job = jobs.find((item) => item.id === line.jobOrderId);
  // Packing activities carry the packing job order number (PJO...).
  const packing = stepOf(line.activityType ?? "") === "packing";
  const done = !!line.completedAt && line.yieldQuantity !== undefined;
  const amount = (done ? line.yieldQuantity! : line.quantity).toLocaleString("en-MY", { maximumFractionDigits: 3 });
  const uom = (done ? line.yieldUom ?? line.uom : line.uom) ?? productUom;
  return { batchNumber: job?.batchNumber?.trim() ?? "", jobNumber: job ? packing ? packingNumber(job) : job.number : line.orderReference?.trim() ?? "", quantity: `${done ? "Actual " : ""}${amount} ${uom}`.trim(), done };
}

// ---- Status: testing and release of finished batches ----

export type BatchStatus = "In production" | "Awaiting testing" | "Awaiting release" | "Released";
// A job order is finished once it has final output; it then waits for testing, then for release.
export function batchStatus(job: JobOrder, lines: PlanLine[], transfers: { sourceLineId: string }[]): BatchStatus {
  if (job.releasedAt) return "Released";
  if (job.testedAt) return "Awaiting release";
  return finalOutput(job.id, lines, transfers).length ? "Awaiting testing" : "In production";
}
// The day the batch's final output was last completed (YYYY-MM-DD), for the testing list.
export function finishedOn(job: JobOrder, lines: PlanLine[], transfers: { sourceLineId: string }[]) {
  const done = linesForJob(job.id, lines).filter((line) => line.completedAt && !transfers.some((transfer) => transfer.sourceLineId === line.id)).map((line) => line.completedAt!).sort();
  return done.at(-1);
}
export const testingQueue = (jobs: JobOrder[], lines: PlanLine[], transfers: { sourceLineId: string }[]) => jobs.filter((job) => batchStatus(job, lines, transfers) === "Awaiting testing");
export const releaseQueue = (jobs: JobOrder[]) => jobs.filter((job) => job.testedAt && !job.releasedAt);

// Passing testing: once, and only for a finished batch.
export function passTesting(job: JobOrder, lines: PlanLine[], transfers: { sourceLineId: string }[], by: string, at: Date): JobOrder | { error: string } {
  if (job.testedAt) return { error: `${job.number} has already passed testing.` };
  if (!finalOutput(job.id, lines, transfers).length) return { error: `${job.number} has no final output to test yet.` };
  return { ...job, testedAt: at.toISOString(), testedBy: by };
}
// Releasing: a tested batch, once, with the quantity released (the final output unless changed).
export function releaseBatch(job: JobOrder, quantity: number, uom: string, by: string, at: Date): JobOrder | { error: string } {
  if (!job.testedAt) return { error: `${job.number} has not passed testing yet.` };
  if (job.releasedAt) return { error: `${job.number} is already released.` };
  if (!Number.isFinite(quantity) || quantity < 0) return { error: "Release quantity must be zero or more." };
  if (!uom.trim()) return { error: "The release quantity needs its unit." };
  return { ...job, releaseQuantity: quantity, releaseUom: uom.trim(), releasedAt: at.toISOString(), releasedBy: by };
}

// A PO item's testing and release at a glance, for the Orders summary.
export function orderStatusSummary(orderId: string, jobs: JobOrder[], lines: PlanLine[], transfers: { sourceLineId: string }[]) {
  const own = jobsFor(orderId, jobs);
  const states = own.map((job) => batchStatus(job, lines, transfers));
  const released = new Map<string, number>();
  for (const job of own) if (job.releasedAt && job.releaseUom) released.set(job.releaseUom, Number(((released.get(job.releaseUom) ?? 0) + (job.releaseQuantity ?? 0)).toPrecision(12)));
  return {
    jobs: own.length,
    awaitingTesting: states.filter((state) => state === "Awaiting testing").length,
    passed: own.filter((job) => job.testedAt).length,
    released: own.filter((job) => job.releasedAt).length,
    releasedQuantity: [...released].map(([uom, quantity]) => ({ quantity, uom }))
  };
}
