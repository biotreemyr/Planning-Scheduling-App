import { describe, expect, it } from "vitest";
import { batchUnits, fullPacks, isCounted, jobTotals, lastPackSize, leftOver } from "../src/lib/services/jobQuantities";
import { processQuantity, type JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";

const job = (extra: Partial<JobOrder>): JobOrder => ({ id: "j", number: "JO1", orderId: "o", sequence: 1, quantity: 125000, uom: "tablets", createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner", ...extra });
const order = (id: string, productId: string): PurchaseOrder => ({ id, poNumber: id, productId, quantity: 2000, uom: "boxes", expectedDates: {}, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner" });

describe("job order figures from the batch size", () => {
  it("works out JO-00010 as production did: 36.25 kg at 290 mg, 10 per blister, 90 per box", () => {
    const units = batchUnits(36.25, 290);
    expect(units).toBe(125000);
    expect(fullPacks(units, 10)).toBe(12500);
    // Full boxes only: 1,388 boxes and 80 tablets over (1,388 x 90 = 124,920).
    expect(fullPacks(units, 90)).toBe(1388);
    expect(leftOver(125000, 90, 1388)).toBe(80);
  });
  it("needs the batch size and a unit weight, and counts only tablets, capsules and sachets", () => {
    expect([batchUnits(undefined, 290), batchUnits(36.25, undefined), batchUnits(0, 290)]).toEqual([undefined, undefined, undefined]);
    expect(batchUnits(41.5, 332)).toBe(125000);
    expect(fullPacks(125000, undefined)).toBeUndefined();
    expect(["Tablets", "capsules", "sachets", "boxes", "kg"].map(isCounted)).toEqual([true, true, true, false, false]);
  });
  it("remembers units per blister or bottle from the product's latest job order", () => {
    const orders = [order("a", "p"), order("b", "p"), order("c", "other")];
    const jobs = [job({ id: "1", orderId: "a", packSize: 30, createdAt: "2026-10-01T00:00:00Z" }), job({ id: "2", orderId: "b", packSize: 10, createdAt: "2026-10-05T00:00:00Z" }), job({ id: "3", orderId: "c", packSize: 60, createdAt: "2026-10-09T00:00:00Z" })];
    expect(lastPackSize("p", orders, jobs)).toBe(10);
    expect(lastPackSize("none", orders, jobs)).toBeUndefined();
  });
  it("totals each figure of the job order table per unit", () => {
    const jobs = [job({ batchSizeKg: 41.5, packQuantity: 12500, packUom: "blisters", boxQuantity: 1388 }), job({ id: "k", batchSizeKg: 36.25, packQuantity: 12500, packUom: "blisters", boxQuantity: 1388 }), job({ id: "l", quantity: 60000, uom: "capsules" })];
    expect(jobTotals(jobs, (item) => processQuantity(item, "dispensing"))).toEqual([{ quantity: 77.75, uom: "kg" }]);
    expect(jobTotals(jobs, (item) => processQuantity(item, "tableting"))).toEqual([{ quantity: 250000, uom: "tablets" }, { quantity: 60000, uom: "capsules" }]);
    expect(jobTotals(jobs, (item) => processQuantity(item, "packing"))).toEqual([{ quantity: 2776, uom: "boxes" }]);
  });
});
