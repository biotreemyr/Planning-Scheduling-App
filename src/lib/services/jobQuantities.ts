import type { JobOrder } from "./jobOrders";
import type { PurchaseOrder } from "./orders";

/**
 * A job order's figures follow from its batch size, as production works them out:
 *   batch size (kg) ÷ unit weight (mg)        → batch quantity (tablets, capsules or sachets), rounded
 *   batch quantity ÷ units per blister/bottle → pack quantity, full packs only
 *   batch quantity ÷ units per box            → total packs (boxes), full boxes only
 * e.g. 36.25 kg at 290 mg is 125,000 tablets; at 10 per blister 12,500 blisters; at 90 per box 1,388
 * boxes (80 tablets over). The unit weight and units per box come from the PO item, units per
 * blister/bottle from the product's last job order. Every figure stays editable.
 */
export const COUNTED_UOMS = ["tablets", "capsules", "sachets"];
export const isCounted = (uom: string) => COUNTED_UOMS.includes(uom.trim().toLowerCase());

export function batchUnits(kg: number | undefined, unitWeightMg: number | undefined) {
  return kg && kg > 0 && unitWeightMg && unitWeightMg > 0 ? Math.round(kg * 1_000_000 / unitWeightMg) : undefined;
}
// Full packs only; a part-filled pack is not a pack.
export function fullPacks(units: number | undefined, perPack: number | undefined) {
  return units && units > 0 && perPack && perPack > 0 ? Math.floor(Number((units / perPack).toPrecision(12))) : undefined;
}
export const leftOver = (units: number, perPack: number, packs: number) => Math.max(0, Math.round(units - packs * perPack));

/** Units per blister, bottle or sachet pack as on this product's latest job order that has one. */
export function lastPackSize(productId: string | undefined, orders: PurchaseOrder[], jobs: JobOrder[]) {
  if (!productId) return undefined;
  const orderIds = new Set(orders.filter((order) => order.productId === productId).map((order) => order.id));
  return jobs.filter((job) => orderIds.has(job.orderId) && job.packSize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.packSize;
}

/** Totals for the job order table's foot: each figure summed per unit, as "250,000 tablets". */
export function jobTotals(jobs: JobOrder[], figure: (job: JobOrder) => { quantity: number; uom: string } | undefined) {
  const totals = new Map<string, number>();
  for (const job of jobs) { const value = figure(job); if (value) totals.set(value.uom, Number(((totals.get(value.uom) ?? 0) + value.quantity).toPrecision(12))); }
  return [...totals].map(([uom, quantity]) => ({ quantity, uom }));
}
