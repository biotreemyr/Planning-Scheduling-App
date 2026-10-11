import { describe, expect, it } from "vitest";
import { formatKg, lastOrderWeights, orderKg, orderWeightKind, type PurchaseOrder } from "../src/lib/services/orders";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";

const order = (extra: Partial<PurchaseOrder>): PurchaseOrder => ({ id: "o", poNumber: "PO-1", productId: "p", quantity: 2000, uom: "boxes", expectedDates: {}, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner", ...extra });

describe("order weight", () => {
  it("works out the total kg from the quantity, unit weight and units per pack", () => {
    // 2,000 boxes x 90 capsules x 332 mg = 59.76 kg.
    expect(orderKg(order({ unitWeightMg: 332, unitsPerPack: 90 }))).toBe(59.76);
    // 125,000 tablets x 1,000 mg = 125 kg; a sachet of 2.5 g is 2,500 mg.
    expect(orderKg(order({ quantity: 125000, uom: "tablets", unitWeightMg: 1000 }))).toBe(125);
    expect(orderKg(order({ quantity: 700, uom: "sachets", unitWeightMg: 2500 }))).toBe(1.75);
    // Weights convert directly, without a unit weight.
    expect([orderKg(order({ quantity: 41.5, uom: "kg" })), orderKg(order({ quantity: 500, uom: "g" }))]).toEqual([41.5, 0.5]);
  });
  it("gives no total until what it needs is keyed in, and none for a volume", () => {
    expect(orderKg(order({}))).toBeUndefined();
    expect(orderKg(order({ unitWeightMg: 332 }))).toBeUndefined();
    expect(orderKg(order({ uom: "mL", unitWeightMg: 332 }))).toBeUndefined();
    expect(["Tablets", "boxes", "bottles", "kg", "L"].map(orderWeightKind)).toEqual(["single", "pack", "pack", "weight", "volume"]);
    expect(formatKg(59.76)).toBe("59.76 kg");
  });
  it("remembers a product's weights from its latest order", () => {
    const orders = [order({ id: "a", createdAt: "2026-10-01T00:00:00Z", unitWeightMg: 300, unitsPerPack: 60 }), order({ id: "b", createdAt: "2026-10-05T00:00:00Z", unitWeightMg: 332, unitsPerPack: 90 }), order({ id: "c", createdAt: "2026-10-09T00:00:00Z" }), order({ id: "d", productId: "other", unitWeightMg: 1 })];
    expect(lastOrderWeights("p", orders)).toEqual({ unitWeightMg: 332, unitsPerPack: 90 });
    expect(lastOrderWeights("new", orders)).toEqual({});
  });
  it("saves the weights with the order and refuses impossible ones", () => {
    const state = newWorkspace();
    state.products.push({ id: "p", sku: "FG-CPS-004A", name: "Methylcobalamin 9bp x 10's", uom: "boxes", productType: "Finished Good", active: "Active" });
    state.data.orders.push(order({ unitWeightMg: 332, unitsPerPack: 90 }));
    expect(parseWorkspace(state).data.orders[0]).toMatchObject({ unitWeightMg: 332, unitsPerPack: 90 });
    for (const bad of [{ unitWeightMg: -1 }, { unitsPerPack: 2.5 }, { unitsPerPack: 0 }]) expect(() => parseWorkspace({ ...state, data: { ...state.data, orders: [order({ ...bad })] } })).toThrow();
  });
});
