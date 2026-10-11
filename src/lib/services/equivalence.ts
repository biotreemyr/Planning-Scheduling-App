import { isCounted } from "./jobQuantities";
import type { JobOrder } from "./jobOrders";
import type { PurchaseOrder } from "./orders";

/**
 * A quantity in its other units, so every process of a batch can be compared: kg in tablets/capsules
 * and boxes, a count in kg and boxes, blisters or bottles in tablets and boxes, boxes in tablets and kg.
 * Worked out from the PO item's unit weight and units per box and the job order's units per
 * blister/bottle; the unit weight falls back on the job order's own batch kg over its count.
 */
export type Factors = { unitWeightMg?: number; unitsPerBox?: number; unitsPerPack?: number; countUom: string };
const WEIGHT: Record<string, number> = { kg: 1, g: 0.001, mg: 0.000001 };
const FILL = ["blisters", "bottles", "strips", "pouches"];
const amount = (value: number, digits = 0) => value.toLocaleString("en-GB", { maximumFractionDigits: digits });

export function factorsFor(order?: PurchaseOrder, job?: JobOrder, fallbackCount = "tablets"): Factors {
  const fromJob = job?.batchSizeKg && isCounted(job.uom) && job.quantity > 0 ? job.batchSizeKg * 1_000_000 / job.quantity : undefined;
  return { unitWeightMg: order?.unitWeightMg ?? fromJob, unitsPerBox: order?.uom.trim().toLowerCase() === "boxes" ? order.unitsPerPack : undefined, unitsPerPack: job?.packSize,
    countUom: job && isCounted(job.uom) ? job.uom : fallbackCount };
}

/** The units (tablets, capsules, sachets) a quantity stands for, when the factors allow. */
export function unitsFor(quantity: number, uom: string, factors: Factors) {
  const key = uom.trim().toLowerCase();
  if (key in WEIGHT) return factors.unitWeightMg ? quantity * WEIGHT[key] * 1_000_000 / factors.unitWeightMg : undefined;
  if (isCounted(key)) return quantity;
  if (FILL.includes(key)) return factors.unitsPerPack ? quantity * factors.unitsPerPack : undefined;
  if (key === "boxes") return factors.unitsPerBox ? quantity * factors.unitsPerBox : undefined;
  return undefined;
}

/** "≈ 125,000 tablets · 1,388 boxes": the quantity in the units it is not already in, or "". */
export function equivalence(quantity: number | undefined, uom: string | undefined, factors: Factors) {
  if (quantity === undefined || !uom || !(quantity > 0)) return "";
  const key = uom.trim().toLowerCase();
  const units = unitsFor(quantity, uom, factors);
  if (units === undefined) return "";
  const parts = [
    !(key in WEIGHT) && factors.unitWeightMg ? `${amount(units * factors.unitWeightMg / 1_000_000, 2)} kg` : "",
    !isCounted(key) ? `${amount(Math.round(units))} ${factors.countUom}` : "",
    key !== "boxes" && factors.unitsPerBox ? `${amount(Math.floor(units / factors.unitsPerBox + 1e-9))} boxes` : ""
  ].filter(Boolean);
  return parts.length ? `≈ ${parts.join(" · ")}` : "";
}
