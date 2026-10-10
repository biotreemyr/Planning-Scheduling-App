import type { Customer, Product } from "@/lib/domain/types";

/**
 * Products and customers as Bio Tree Master Data holds them, from the company's SQL Account lists.
 * `id` is Master Data's permanent ID; the scheduler keeps it on its own record as `masterDataId`.
 */
export type MasterProduct = { id: string; code: string; name: string; uom: string };
export type MasterCustomer = { id: string; code: string; name: string };
export type MasterLists = { products: MasterProduct[]; customers: MasterCustomer[] };

/** What the order form may offer: Master Data's lists, or word that they could not be read. */
export type OrderCatalog = ({ status: "ok" } & MasterLists) | { status: "unavailable" };

// SQL Account's unit codes in the scheduler's units of measure; anything else is kept as written.
// Bulk capsules and tablets are counted singly; powders, like packed goods, are ordered in boxes.
const UOMS: Record<string, string> = { CPS: "capsules", TBT: "tablets", POW: "boxes", BOXES: "boxes", BOTTLE: "bottles" };
export const schedulerUom = (uom: string) => UOMS[uom.trim().toUpperCase()] ?? (uom.trim().toLowerCase() || "boxes");

const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// The scheduler's record for a Master Data one: already linked to it, else unlinked with the same code.
function ownFor<T extends { masterDataId?: string }>(master: { id: string; code: string }, records: T[], code: (record: T) => string) {
  return records.find((record) => record.masterDataId === master.id) ?? records.find((record) => !record.masterDataId && sameCode(code(record), master.code));
}

/**
 * The scheduler product that stands for a Master Data product: its own (linked now) or a new one.
 * Code and name always follow Master Data; the scheduler's own settings (UOM, type, batch size) are kept.
 */
export function productFor(master: MasterProduct, products: Product[]): Product {
  const own = ownFor(master, products, (product) => product.sku);
  if (own) return { ...own, sku: master.code, name: master.name, masterDataId: master.id };
  return { id: `product-${master.id}`, sku: master.code, name: master.name, uom: schedulerUom(master.uom), productType: "Finished Good", active: "Active", masterDataId: master.id };
}

/** The same for a customer: code and name follow Master Data, contact notes are kept. */
export function customerFor(master: MasterCustomer, customers: Customer[]): Customer {
  const own = ownFor(master, customers, (customer) => customer.code);
  if (own) return { ...own, code: master.code, name: master.name, active: "Active", masterDataId: master.id };
  return { id: `customer-${master.id}`, code: master.code, name: master.name, active: "Active", masterDataId: master.id };
}
