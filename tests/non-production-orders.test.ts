import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { isNonProduction } from "../src/lib/services/orders";

const product = { id: "product-1", name: "Vitamin C", sku: "VC-1", uom: "kg", productType: "Finished Good", active: "Active" };
const order = { id: "order-1", poNumber: "RND-001", productId: "product-1", quantity: 10, uom: "kg", expectedDates: {}, createdAt: "2026-10-12T00:00:00.000Z", createdBy: "Admin" };

describe("R&D, trial and pilot batch orders", () => {
  it("keep their type when the workspace is saved and loaded", () => {
    const state = newWorkspace();
    const parsed = parseWorkspace({ ...state, products: [product], data: { ...state.data, orders: [{ ...order, category: "Pilot batch" }, { ...order, id: "order-2", poNumber: "PO-002" }] } });
    expect(parsed.data.orders.map((item) => item.category)).toEqual(["Pilot batch", undefined]);
    expect(parsed.data.orders.map(isNonProduction)).toEqual([true, false]);
  });
  it("accept only R&D, Trial or Pilot batch as a type", () => {
    const state = newWorkspace();
    expect(() => parseWorkspace({ ...state, products: [product], data: { ...state.data, orders: [{ ...order, category: "Sample" }] } })).toThrow();
  });
});
