import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import type { PurchaseOrder } from "./orders";

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
  quantity: number; uom: string;
  // Kilograms for this job, from the product's batch size scaled to its quantity.
  batchSizeKg?: number;
  // Keyed in by production; shown on every process activity of the job.
  batchNumber?: string;
  batchNumberBy?: string; batchNumberAt?: string;
  notes?: string; createdAt: string; createdBy: string;
};

export const jobsFor = (orderId: string, jobs: JobOrder[]) => jobs.filter((job) => job.orderId === orderId).sort((a, b) => a.sequence - b.sequence);
export const linesForJob = (jobId: string, lines: PlanLine[]) => lines.filter((line) => line.jobOrderId === jobId);
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
  if (next.batchSizeKg !== undefined && !(next.batchSizeKg > 0)) return { error: "Batch size must be greater than zero." };
  const allowable = products.find((product) => product.id === order.productId)?.batchQuantity;
  if (allowable && next.uom === order.uom && next.quantity > allowable) return { error: `One job order holds at most the allowable batch quantity of ${allowable.toLocaleString()} ${order.uom}.` };
  const saved: JobOrder = { ...next, number };
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

export type ManualJob = { number: string; orderId: string; quantity: number; uom: string; batchSizeKg?: number };

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
  const allowable = products.find((product) => product.id === order.productId)?.batchQuantity;
  if (allowable && input.uom === order.uom && input.quantity > allowable) return { error: `One job order holds at most the allowable batch quantity of ${allowable.toLocaleString()} ${order.uom}.` };
  const created: JobOrder = {
    id: context.newId(), number, orderId: order.id, sequence: Math.max(0, ...jobsFor(order.id, jobs).map((job) => job.sequence)) + 1,
    quantity: input.quantity, uom: input.uom, ...(input.batchSizeKg ? { batchSizeKg: input.batchSizeKg } : {}), createdAt: context.today.toISOString(), createdBy: context.userName
  };
  const over = overOrdered(order, [...jobs, created]);
  return over ? { error: over } : created;
}
