import type { Product } from "@/lib/domain/types";

/**
 * A product as Bio Tree Master Data holds it, from the company's SQL Account list. `id` is Master
 * Data's permanent ID; the scheduler keeps it on its own product as `masterDataId`.
 */
export type MasterProduct = { id: string; code: string; name: string; uom: string };

/** What the order form may offer: Master Data's list, or word that it could not be read. */
export type OrderCatalog = { status: "ok"; products: MasterProduct[] } | { status: "unavailable" };

// SQL Account's unit codes in the scheduler's units of measure; anything else is kept as written.
// The bulk finished goods are counted per capsule, tablet or 2.5 g powder sachet.
const UOMS: Record<string, string> = { CPS: "capsules", TBT: "tablets", POW: "sachets", BOXES: "boxes", BOTTLE: "bottles" };
export const schedulerUom = (uom: string) => UOMS[uom.trim().toUpperCase()] ?? (uom.trim().toLowerCase() || "boxes");

const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The scheduler product that stands for a Master Data product: the one already linked to it, else
 * one with the same code (linked now), else a new one. Code and name always follow Master Data;
 * the scheduler's own settings (UOM, type, batch size) are kept.
 */
export function productFor(master: MasterProduct, products: Product[]): Product {
  const own = products.find((product) => product.masterDataId === master.id) ?? products.find((product) => !product.masterDataId && sameCode(product.sku, master.code));
  if (own) return { ...own, sku: master.code, name: master.name, masterDataId: master.id };
  return { id: `product-${master.id}`, sku: master.code, name: master.name, uom: schedulerUom(master.uom), productType: "Finished Good", active: "Active", masterDataId: master.id };
}
