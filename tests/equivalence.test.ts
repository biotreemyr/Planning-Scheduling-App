import { describe, expect, it } from "vitest";
import { equivalence, factorsFor } from "../src/lib/services/equivalence";
import type { JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";

const order: PurchaseOrder = { id: "o", poNumber: "PO", productId: "p", quantity: 3000, uom: "boxes", unitWeightMg: 290, unitsPerPack: 90, expectedDates: {}, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner" };
const job: JobOrder = { id: "j", number: "JO", orderId: "o", sequence: 1, quantity: 125000, uom: "tablets", batchSizeKg: 36.25, packSize: 10, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner" };

describe("planned and actual equivalence", () => {
  const factors = factorsFor(order, job);
  it("shows each process's quantity in the other units", () => {
    expect(equivalence(36.25, "kg", factors)).toBe("≈ 125,000 tablets · 1,388 boxes");
    expect(equivalence(125000, "tablets", factors)).toBe("≈ 36.25 kg · 1,388 boxes");
    expect(equivalence(12500, "blisters", factors)).toBe("≈ 36.25 kg · 125,000 tablets · 1,388 boxes");
    expect(equivalence(1388, "boxes", factors)).toBe("≈ 36.23 kg · 124,920 tablets");
  });
  it("falls back on the job order's batch kg over its count for the unit weight", () => {
    const noWeight = factorsFor({ ...order, unitWeightMg: undefined }, job);
    expect(noWeight.unitWeightMg).toBe(290);
    expect(equivalence(41.5, "kg", factorsFor(undefined, { ...job, batchSizeKg: 41.5 }))).toBe("≈ 125,000 tablets");
  });
  it("says nothing when it cannot work it out", () => {
    expect(equivalence(10, "L", factors)).toBe("");
    expect(equivalence(500, "boxes", factorsFor(undefined, job))).toBe("");
    expect(equivalence(undefined, "kg", factors)).toBe("");
  });
});
