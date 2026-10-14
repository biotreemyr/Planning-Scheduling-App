import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { isNonProduction, nextOrderNumber, nextRndCode, orderNumbers } from "../src/lib/services/orders";
import { addSampleData } from "../src/lib/domain/sampleData";
import { capabilitiesFromPermissions } from "../src/lib/auth/capabilities";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";

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

describe("R&D products", () => {
  it("get the next free RND code", () => {
    expect(nextRndCode([])).toBe("RND-0001");
    expect(nextRndCode([{ sku: "RND-0001" }, { sku: "rnd-0002" }, { sku: "VC-1" }])).toBe("RND-0003");
  });
  it("may be added with an order by someone who creates orders, but other product changes need Admin", () => {
    const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
    const creator = capabilitiesFromPermissions(["scheduler.orders.create", "scheduler.orders.view"]);
    const rndProduct = { id: "product-rnd", sku: "RND-0001", name: "Collagen trial blend", uom: "kg", productType: "Finished Good" as const, active: "Active" as const, rnd: true };
    const withRnd = { ...structuredClone(base), products: [...base.products, rndProduct] };
    expect(reviewWorkspaceChange(base, withRnd, creator).allowed).toBe(true);
    const withOther = { ...structuredClone(base), products: [...base.products, { ...rndProduct, rnd: undefined }] };
    expect(reviewWorkspaceChange(base, withOther, creator).denied).toEqual(["change units, people, products, machines or measurements"]);
  });
  it("an order may have no customer ID", () => {
    const state = newWorkspace();
    expect(() => parseWorkspace({ ...state, products: [product], data: { ...state.data, orders: [{ ...order, category: "R&D", customerName: "Internal" }] } })).not.toThrow();
  });
});

describe("order numbers", () => {
  const at = (id: string, extra: object = {}) => ({ ...order, id, poNumber: id, createdAt: `2026-10-1${id.slice(-1)}T00:00:00.000Z`, ...extra });
  it("count production orders and R&D, trial and pilot orders separately, each from 1", () => {
    const orders = [at("p1", { number: 1 }), at("t1", { number: 1, category: "Trial" }), at("p2")];
    expect(Object.fromEntries(orderNumbers(orders))).toEqual({ p1: 1, p2: 2, t1: 1 });
    expect(nextOrderNumber(orders)).toBe(3);
    expect(nextOrderNumber(orders, true)).toBe(2);
    expect(nextOrderNumber([])).toBe(1);
    expect(nextOrderNumber([], true)).toBe(1);
  });
});
