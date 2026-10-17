import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine } from "@/lib/domain/types";
import { finalOutput, packingNumber, testResult, type JobOrder, type ProcessQuantity } from "./jobOrders";
import { orderWeightKind, type PurchaseOrder } from "./orders";
import { calendarSettings, type PlannedSource } from "./processSetup";

/**
 * A batch made once for several POs. Production plans and records one job order: dispensing to
 * coating are made once for the whole batch; filling and packing (the processes planned from the
 * pack quantity or the boxes) are done for each PO, with its own pack size and packing job order.
 * POs with different FG codes may share a batch only once QA confirms they are the same formula.
 */
export const MAX_POS_PER_JOB = 5;

// Another PO the batch serves: its share of the batch (in the job order's unit) and its own packing.
export type JobShare = { orderId: string; quantity: number; packQuantity?: number; packUom?: string; packSize?: number; boxQuantity?: number; packingNumber?: string };
// What the released output went to besides the PO: e.g. 2 bottles, "Retention sample".
export type OtherUse = { quantity: number; note: string };
// QA's release of one PO's part of the batch, reconciled: what went to the PO and what else.
export type PoRelease = { orderId: string; quantity: number; uom: string; otherUses?: OtherUse[]; releasedAt: string; releasedBy: string };
// Uses offered when reconciling; anything else can be typed.
export const OTHER_USES = ["Retention sample", "QC testing", "Stability study", "Customer sample", "R&D", "Rejected / destroyed"];

// One PO's part of the batch. The first is the job order's own PO.
export type JobPart = { orderId: string; quantity: number; packQuantity?: number; packUom?: string; packSize?: number; boxQuantity?: number; packingNumber: string; first: boolean };

const shareTotal = (job: Pick<JobOrder, "shares">) => Number((job.shares ?? []).reduce((sum, share) => sum + share.quantity, 0).toPrecision(12));
export const isShared = (job: Pick<JobOrder, "shares">) => !!job.shares?.length;

// A share's packing job order number: its own, else the batch's with the PO's place, e.g. PJO0010-2.
export const sharePackingNumber = (job: Pick<JobOrder, "number" | "packingNumber">, share: JobShare, index: number) => share.packingNumber?.trim() || `${packingNumber(job)}-${index + 2}`;

export function jobParts(job: JobOrder): JobPart[] {
  const own: JobPart = { orderId: job.orderId, quantity: Number((job.quantity - shareTotal(job)).toPrecision(12)), packQuantity: job.packQuantity, packUom: job.packUom, packSize: job.packSize, boxQuantity: job.boxQuantity, packingNumber: packingNumber(job), first: true };
  return [own, ...(job.shares ?? []).map((share, index) => ({ ...share, packingNumber: sharePackingNumber(job, share, index), first: false }))];
}
export const servesOrder = (job: Pick<JobOrder, "orderId" | "shares">, orderId: string) => job.orderId === orderId || !!job.shares?.some((share) => share.orderId === orderId);
export const jobsServing = (orderId: string, jobs: JobOrder[]) => jobs.filter((job) => servesOrder(job, orderId));
export const partFor = (job: JobOrder, orderId: string) => jobParts(job).find((part) => part.orderId === orderId);

const sameUnit = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const BOX_UOMS = ["box", "boxes", "carton", "cartons"];
const COUNT_UOMS = ["tablet", "tablets", "capsule", "capsules", "sachet", "sachets"];
/**
 * A PO's part of a batch in the PO's own unit, so job orders can be compared with the PO however
 * their batch quantity is kept: the batch quantity itself, the pack quantity, the boxes, or capsules
 * or tablets divided by the PO's units per pack. Undefined when it cannot be told.
 */
export function partInOrderUnit(job: JobOrder, order: PurchaseOrder): number | undefined {
  const part = partFor(job, order.id);
  if (!part) return undefined;
  if (sameUnit(job.uom, order.uom)) return part.quantity;
  if (sameUnit(part.packUom, order.uom) && part.packQuantity !== undefined) return part.packQuantity;
  if (part.boxQuantity !== undefined && BOX_UOMS.includes(order.uom.trim().toLowerCase())) return part.boxQuantity;
  if (orderWeightKind(order.uom) === "pack" && order.unitsPerPack && COUNT_UOMS.includes(job.uom.trim().toLowerCase())) return Math.floor(part.quantity / order.unitsPerPack);
  return undefined;
}
/** What a PO's job orders add up to in its unit, and the job orders that could not be counted. */
export function orderedInJobs(order: PurchaseOrder, jobs: JobOrder[]) {
  const serving = jobsServing(order.id, jobs);
  const figures = serving.map((job) => partInOrderUnit(job, order));
  return { total: Number(figures.reduce<number>((sum, value) => sum + (value ?? 0), 0).toPrecision(12)), uncounted: serving.filter((_, index) => figures[index] === undefined) };
}
export const overOrderedText = (order: PurchaseOrder, total: number) => `Job orders for ${order.poNumber} would add up to ${total.toLocaleString()} ${order.uom}, more than the ${order.quantity.toLocaleString()} ordered.`;

/**
 * The job order as one PO sees it: that PO's share and packing in place of the first PO's, so a
 * per-PO process (filling, packing) plans with that PO's pack quantity and boxes.
 */
export function jobForOrder(job: JobOrder, orderId: string): JobOrder {
  const part = partFor(job, orderId);
  if (!part || part.first) return job;
  return { ...job, orderId, quantity: part.quantity, packQuantity: part.packQuantity, packUom: part.packUom, packSize: part.packSize, boxQuantity: part.boxQuantity, packingNumber: part.packingNumber };
}

// Filling and packing plan from the pack quantity and the boxes: they are done for each PO.
export const perOrderSource = (planned: PlannedSource) => planned === "packQuantity" || planned === "boxes";
export const isPerOrderLine = (line: Pick<PlanLine, "calendarId">, directory: CalendarDirectory) => perOrderSource(calendarSettings(directory, line.calendarId).planned);

// POs with different FG codes share a batch only once QA has confirmed the formula is the same.
export function needsFormulaCheck(job: JobOrder, orders: PurchaseOrder[]) {
  const product = orders.find((order) => order.id === job.orderId)?.productId;
  return (job.shares ?? []).some((share) => orders.find((order) => order.id === share.orderId)?.productId !== product);
}
export const formulaPending = (job: JobOrder, orders: PurchaseOrder[]) => needsFormulaCheck(job, orders) && !job.formulaConfirmedAt;

/**
 * Checks for the POs a batch serves: at most 5, each once, each still a PO item, the same dosage
 * form as the first, a share above zero for every PO (the first keeps the rest of the batch), and
 * no PO given more than it ordered across all its job orders (counted in the PO's own unit).
 */
export function sharesProblem(job: JobOrder, orders: PurchaseOrder[], jobs: JobOrder[], formatOf: (order: PurchaseOrder) => string): string {
  const shares = job.shares ?? [];
  if (!shares.length) return "";
  if (shares.length + 1 > MAX_POS_PER_JOB) return `One batch can serve at most ${MAX_POS_PER_JOB} POs.`;
  const ids = [job.orderId, ...shares.map((share) => share.orderId)];
  if (new Set(ids).size !== ids.length) return "Each PO can be listed once.";
  const first = orders.find((order) => order.id === job.orderId);
  if (!first) return "This job order's PO no longer exists.";
  for (const share of shares) {
    const order = orders.find((item) => item.id === share.orderId);
    if (!order) return "A PO this batch serves no longer exists.";
    if (formatOf(order) !== formatOf(first)) return `${order.poNumber} is a ${formatOf(order).toLowerCase()}, not a ${formatOf(first).toLowerCase()}: only the same dosage form can share a batch.`;
    if (!(share.quantity > 0)) return `Key in ${order.poNumber}'s share of the batch.`;
    if (share.packSize !== undefined && !(share.packSize > 0)) return `${order.poNumber}: pack size must be greater than zero.`;
    if (share.packQuantity !== undefined && (!(share.packQuantity > 0) || !share.packUom?.trim())) return `${order.poNumber}: key in the pack quantity and its pack type (bottles, blisters...).`;
    if (share.boxQuantity !== undefined && !(share.boxQuantity > 0)) return `${order.poNumber}: boxes must be greater than zero.`;
  }
  if (!(jobParts(job)[0].quantity > 0)) return `The shares add up to the whole batch: leave some of the ${job.quantity.toLocaleString()} ${job.uom} for ${first.poNumber}, or move it to another PO.`;
  // Packing job order numbers stay unique across every batch and PO.
  const numbers = jobs.filter((other) => other.id !== job.id).flatMap((other) => jobParts(other).map((part) => part.packingNumber.toLowerCase()));
  for (const part of jobParts(job)) {
    if (part.packingNumber.length > 60) return "Keep packing job order numbers to 60 characters.";
    if (numbers.includes(part.packingNumber.toLowerCase())) return `Packing job order ${part.packingNumber} is already used.`;
  }
  if (new Set(jobParts(job).map((part) => part.packingNumber.toLowerCase())).size !== shares.length + 1) return "Give each PO its own packing job order number.";
  for (const part of jobParts(job)) {
    const order = orders.find((item) => item.id === part.orderId)!;
    const { total } = orderedInJobs(order, [...jobs.filter((other) => other.id !== job.id), job]);
    if (total > order.quantity + 1e-9) return overOrderedText(order, total);
  }
  return "";
}

/**
 * When a batch yields less than planned, the PO due first keeps its full share and the next PO
 * takes what is left. `made` is what the batch actually made, in the job order's unit.
 */
export function sharesAfterYield(job: JobOrder, orders: PurchaseOrder[], made: number) {
  const due = (orderId: string) => orders.find((order) => order.id === orderId)?.deliveryDate ?? "9999-12-31";
  let left = Math.max(0, made);
  return jobParts(job).map((part, index) => ({ part, index })).sort((a, b) => due(a.part.orderId).localeCompare(due(b.part.orderId)) || a.index - b.index)
    .map(({ part }) => { const available = Math.min(part.quantity, left); left = Number((left - available).toPrecision(12)); return { orderId: part.orderId, planned: part.quantity, available: Number(available.toPrecision(12)) }; });
}

/**
 * Lines as each PO sees them: a shared batch's common processes count for every PO it serves, so
 * they are repeated under each other PO (same activity, that PO's id). Filling and packing stay
 * with the PO they were planned for. For the Orders tab, never for saving.
 */
export function orderViewLines(lines: PlanLine[], jobs: JobOrder[], directory: CalendarDirectory): PlanLine[] {
  const shared = jobs.filter(isShared);
  if (!shared.length) return lines;
  const extra = shared.flatMap((job) => lines.filter((line) => line.jobOrderId === job.id && line.productionOrderId === job.orderId && !isPerOrderLine(line, directory))
    .flatMap((line) => (job.shares ?? []).map((share) => ({ ...line, productionOrderId: share.orderId }))));
  return [...lines, ...extra];
}

// What one PO's part of the batch finished as final output: its own filling and packing.
export function finalOutputFor(job: JobOrder, orderId: string, lines: PlanLine[], transfers: { sourceLineId: string }[], directory: CalendarDirectory): ProcessQuantity[] {
  if (!isShared(job)) return finalOutput(job.id, lines, transfers);
  return finalOutput(job.id, lines.filter((line) => line.jobOrderId === job.id && (line.productionOrderId === orderId && isPerOrderLine(line, directory))), transfers);
}

// ---- Release by batch or by PO, and closing the PO ----

export const releaseFor = (job: JobOrder, orderId: string): PoRelease | undefined => job.poReleases?.find((item) => item.orderId === orderId)
  // A batch released before releases were kept per PO was released whole to its one PO.
  ?? (job.releasedAt && job.orderId === orderId && !isShared(job) ? { orderId, quantity: job.releaseQuantity ?? 0, uom: job.releaseUom ?? "", releasedAt: job.releasedAt, releasedBy: job.releasedBy ?? "" } : undefined);

export type ReleaseEntry = { orderId: string; quantity: number; uom: string; otherUses?: OtherUse[] };

/**
 * QA releases a tested batch to its POs, all at once (by batch) or one PO at a time, recording for
 * each what went to the PO and what else (retention, stability, samples...). Once every PO has its
 * release, the batch is released.
 */
export function releaseToOrders(job: JobOrder, entries: ReleaseEntry[], orders: PurchaseOrder[], by: string, at: Date): JobOrder | { error: string } {
  if (testResult(job) !== "Passed") return { error: `${job.number} has not passed testing.` };
  if (formulaPending(job, orders)) return { error: `QA has not yet confirmed that the POs sharing ${job.number} are the same formula.` };
  if (job.releasedAt || job.rejectedAt) return { error: `${job.number} is already ${job.releasedAt ? "released" : "rejected"}.` };
  if (!entries.length) return { error: "Choose the PO to release to." };
  const parts = jobParts(job);
  const added: PoRelease[] = [];
  for (const entry of entries) {
    const order = orders.find((item) => item.id === entry.orderId);
    if (!parts.some((part) => part.orderId === entry.orderId) || !order) return { error: `${job.number} does not serve that PO.` };
    if (releaseFor(job, entry.orderId) || added.some((item) => item.orderId === entry.orderId)) return { error: `${job.number} is already released to ${order.poNumber}.` };
    if (!Number.isFinite(entry.quantity) || entry.quantity < 0) return { error: `${order.poNumber}: the quantity to the PO must be zero or more.` };
    if (!entry.uom.trim()) return { error: `${order.poNumber}: the quantity needs its unit.` };
    const uses = (entry.otherUses ?? []).filter((use) => use.quantity || use.note.trim());
    for (const use of uses) {
      if (!Number.isFinite(use.quantity) || !(use.quantity > 0)) return { error: `${order.poNumber}: give a quantity above zero for "${use.note.trim() || "other use"}".` };
      if (!use.note.trim()) return { error: `${order.poNumber}: say what the ${use.quantity.toLocaleString()} ${entry.uom} went to.` };
    }
    added.push({ orderId: entry.orderId, quantity: entry.quantity, uom: entry.uom.trim(), ...(uses.length ? { otherUses: uses.map((use) => ({ quantity: use.quantity, note: use.note.trim().slice(0, 200) })) } : {}), releasedAt: at.toISOString(), releasedBy: by });
  }
  const poReleases = [...job.poReleases ?? [], ...added];
  const whole = parts.every((part) => poReleases.some((item) => item.orderId === part.orderId));
  if (!whole) return { ...job, poReleases };
  const units = new Set(poReleases.map((item) => item.uom));
  return { ...job, poReleases, releasedAt: at.toISOString(), releasedBy: by,
    ...(units.size === 1 ? { releaseQuantity: Number(poReleases.reduce((sum, item) => sum + item.quantity, 0).toPrecision(12)), releaseUom: poReleases[0].uom } : {}) };
}

// Released to the PO across all its batches, per unit.
export function releasedToOrder(orderId: string, jobs: JobOrder[]) {
  const totals = new Map<string, number>();
  for (const job of jobsServing(orderId, jobs)) {
    const release = releaseFor(job, orderId);
    if (release) totals.set(release.uom, Number(((totals.get(release.uom) ?? 0) + release.quantity).toPrecision(12)));
  }
  return [...totals].map(([uom, quantity]) => ({ quantity, uom }));
}

// A PO is ready for planning to close once every batch serving it is released to it (or rejected).
export function readyToClose(order: PurchaseOrder, jobs: JobOrder[]) {
  const serving = jobsServing(order.id, jobs);
  return !order.closedAt && serving.length > 0 && serving.every((job) => job.rejectedAt || releaseFor(job, order.id)) && serving.some((job) => releaseFor(job, order.id));
}

export function closeOrder(order: PurchaseOrder, quantity: number, uom: string, note: string, by: string, at: Date): PurchaseOrder | { error: string } {
  if (order.closedAt) return { error: `${order.poNumber} is already closed.` };
  if (!Number.isFinite(quantity) || quantity < 0) return { error: "The closing quantity must be zero or more." };
  const difference = Number((quantity - order.quantity).toPrecision(12));
  if (difference !== 0 && uom === order.uom && !note.trim()) return { error: `Say why ${order.poNumber} closes ${difference > 0 ? "above" : "below"} the ${order.quantity.toLocaleString()} ${order.uom} ordered.` };
  return { ...order, closedQuantity: quantity, closedUom: uom.trim() || order.uom, closedAt: at.toISOString(), closedBy: by, ...(note.trim() ? { closeNote: note.trim().slice(0, 500) } : {}) };
}

// "Closed · 2,006 of 2,000 (+6)" style summary of a closed PO.
export function closedSummary(order: PurchaseOrder) {
  if (!order.closedAt || order.closedQuantity === undefined) return "";
  const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });
  const unit = order.closedUom ?? order.uom;
  const difference = unit === order.uom ? Number((order.closedQuantity - order.quantity).toPrecision(12)) : 0;
  return `Closed · ${amount(order.closedQuantity)} of ${amount(order.quantity)} ${order.uom}${difference ? ` (${difference > 0 ? "+" : "−"}${amount(Math.abs(difference))})` : ""}`;
}


/**
 * What the batch actually made, in the job order's unit: the completed activities of the process
 * that makes the batch quantity (compression or capsulation). Undefined until one is completed.
 */
// plannedOf: how each process plans (from Admin), e.g. calendarId => calendarSettings(directory, calendarId).planned.
export function batchMade(job: JobOrder, lines: PlanLine[], plannedOf: (calendarId?: string) => PlannedSource) {
  const made = lines.filter((line) => line.jobOrderId === job.id && line.completedAt && line.yieldQuantity !== undefined && (line.yieldUom ?? line.uom) === job.uom
    && plannedOf(line.calendarId) === "batchQuantity");
  return made.length ? Number(made.reduce((sum, line) => sum + line.yieldQuantity!, 0).toPrecision(12)) : undefined;
}

// Each PO's share once the batch has made less than planned (earliest delivery first); undefined otherwise.
export function shortYield(job: JobOrder, lines: PlanLine[], orders: PurchaseOrder[], plannedOf: (calendarId?: string) => PlannedSource) {
  if (!isShared(job)) return undefined;
  const made = batchMade(job, lines, plannedOf);
  return made !== undefined && made < job.quantity ? { made, shares: sharesAfterYield(job, orders, made) } : undefined;
}
