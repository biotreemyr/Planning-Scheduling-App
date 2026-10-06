import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import type { PurchaseOrder } from "./orders";

/**
 * A job order is one batch of one PO item, released to production. Planning creates them from the
 * PO using the product's allowable batch quantity; production keys in the batch number; every
 * process activity of that batch links back to it through `jobOrderId`.
 */
export type JobOrder = {
  id: string;
  // "JO-2610-001": year, month and a running number within that month. Never changes.
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

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

export function nextJobNumber(jobs: Pick<JobOrder, "number">[], today: Date, offset = 0) {
  const prefix = `JO-${pad(today.getFullYear() % 100)}${pad(today.getMonth() + 1)}-`;
  const used = jobs.map((job) => job.number.startsWith(prefix) ? Number(job.number.slice(prefix.length)) : 0).filter(Number.isFinite);
  return `${prefix}${pad(Math.max(0, ...used) + 1 + offset, 3)}`;
}

export const jobsFor = (orderId: string, jobs: JobOrder[]) => jobs.filter((job) => job.orderId === orderId).sort((a, b) => a.sequence - b.sequence);
export const linesForJob = (jobId: string, lines: PlanLine[]) => lines.filter((line) => line.jobOrderId === jobId);
export const jobLabel = (job: JobOrder) => job.batchNumber ? `${job.number} · Batch no. ${job.batchNumber}` : job.number;

export type JobPlan = { quantity: number; batchSizeKg?: number }[];

/**
 * Split what is left of a PO item into batches no bigger than the allowable batch quantity.
 * `batchSizeKg` is the kilograms of one full batch; part batches are scaled down.
 */
export function planJobOrders(order: PurchaseOrder, existing: JobOrder[], allowableQuantity: number, batchSizeKg?: number): { jobs: JobPlan; remaining: number } | { error: string } {
  if (!Number.isFinite(allowableQuantity) || allowableQuantity <= 0) return { error: "Enter the allowable batch quantity." };
  if (batchSizeKg !== undefined && (!Number.isFinite(batchSizeKg) || batchSizeKg <= 0)) return { error: "Batch size must be greater than zero." };
  const released = jobsFor(order.id, existing).reduce((sum, job) => sum + job.quantity, 0);
  let remaining = Number((order.quantity - released).toPrecision(12));
  if (remaining <= 0) return { error: `All ${order.quantity.toLocaleString()} ${order.uom} of this PO item are already in job orders.` };
  const jobs: JobPlan = [];
  while (remaining > 0 && jobs.length < 500) {
    const quantity = Math.min(allowableQuantity, remaining);
    jobs.push({ quantity, ...(batchSizeKg ? { batchSizeKg: Number((batchSizeKg * quantity / allowableQuantity).toPrecision(6)) } : {}) });
    remaining = Number((remaining - quantity).toPrecision(12));
  }
  return { jobs, remaining: 0 };
}

export function buildJobOrders(order: PurchaseOrder, existing: JobOrder[], plan: JobPlan, context: { today: Date; userName: string; newId: () => string }): JobOrder[] {
  const start = Math.max(0, ...jobsFor(order.id, existing).map((job) => job.sequence));
  const createdAt = context.today.toISOString();
  return plan.map((job, index) => ({
    id: context.newId(), number: nextJobNumber(existing, context.today, index), orderId: order.id, sequence: start + index + 1,
    quantity: job.quantity, uom: order.uom, ...(job.batchSizeKg ? { batchSizeKg: job.batchSizeKg } : {}), createdAt, createdBy: context.userName
  }));
}

export function validateBatchNumber(value: string, job: JobOrder, jobs: JobOrder[]) {
  const batch = value.trim();
  if (batch.length > 60) return "Keep the batch number to 60 characters.";
  if (batch && jobs.some((other) => other.id !== job.id && other.batchNumber?.trim().toLowerCase() === batch.toLowerCase())) return `Batch number ${batch} is already used by another job order.`;
  return "";
}

// Product master defaults for job orders. Both are optional on older products.
export const productBatch = (product?: Product) => ({ quantity: product?.batchQuantity, kg: product?.batchSizeKg });

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
  return {
    id: context.newId(), number, orderId: order.id, sequence: Math.max(0, ...jobsFor(order.id, jobs).map((job) => job.sequence)) + 1,
    quantity: input.quantity, uom: input.uom, ...(input.batchSizeKg ? { batchSizeKg: input.batchSizeKg } : {}), createdAt: context.today.toISOString(), createdBy: context.userName
  };
}
