import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace, type WorkspaceSnapshot } from "../src/lib/domain/workspace";
import type { Product } from "../src/lib/domain/types";
import { productFor, schedulerUom, type MasterProduct } from "../src/lib/services/masterProducts";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { capabilitiesForDemoRole } from "../src/lib/auth/capabilities";

const capsules: MasterProduct = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e01", code: "FG-CPS-004", name: "BioActiv Methylcobalamin", uom: "CPS" };
const boxes: MasterProduct = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e02", code: "FG-CPS-004A", name: "BioActiv Methylcobalamin 9bp x 10's", uom: "BOXES" };
const catalog = [capsules, boxes];
const planner = capabilitiesForDemoRole("planner");
const production = capabilitiesForDemoRole("production");
const admin = capabilitiesForDemoRole("admin");
const own: Product = { id: "own", sku: "fg-cps-004", name: "Methylcobalamin (old name)", uom: "tablets", productType: "Finished Good", active: "Active", batchQuantity: 200000 };
const withProducts = (state: WorkspaceSnapshot, products: Product[]) => parseWorkspace({ ...state, products });

describe("products from Master Data", () => {
  it("maps SQL Account units to the scheduler's", () => {
    expect([schedulerUom("CPS"), schedulerUom("tbt"), schedulerUom("POW"), schedulerUom("BOXES"), schedulerUom("BOTTLE"), schedulerUom("Roll"), schedulerUom("")]).toEqual(["capsules", "tablets", "sachets", "boxes", "bottles", "roll", "boxes"]);
  });
  it("makes a new linked product, or links the scheduler's own one with the same code", () => {
    expect(productFor(boxes, [])).toEqual({ id: `product-${boxes.id}`, sku: "FG-CPS-004A", name: boxes.name, uom: "boxes", productType: "Finished Good", active: "Active", masterDataId: boxes.id });
    // Code and name follow Master Data; the scheduler's own settings stay.
    expect(productFor(capsules, [own])).toEqual({ ...own, sku: "FG-CPS-004", name: capsules.name, masterDataId: capsules.id });
    const linked = productFor(capsules, [own]);
    expect(productFor(capsules, [linked])).toEqual(linked);
  });
  it("lets anyone who may create orders add a product exactly as Master Data has it", () => {
    const before = newWorkspace();
    const after = withProducts(before, [productFor(boxes, [])]);
    expect(reviewWorkspaceChange(before, after, planner, catalog)).toMatchObject({ allowed: true });
    expect(reviewWorkspaceChange(before, after, production, catalog)).toMatchObject({ allowed: false, denied: ["add products from Master Data"] });
    // Without the server's own copy of Master Data, it is an ordinary product change.
    expect(reviewWorkspaceChange(before, after, planner)).toMatchObject({ allowed: false, denied: ["change units, people, products, machines or measurements"] });
  });
  it("lets an order link the scheduler's product with the same code", () => {
    const before = withProducts(newWorkspace(), [own]);
    expect(reviewWorkspaceChange(before, withProducts(before, [productFor(capsules, [own])]), planner, catalog).allowed).toBe(true);
  });
  it("keeps every other product change for Admin", () => {
    const before = withProducts(newWorkspace(), [own]);
    const tampered = withProducts(before, [own, { ...productFor(boxes, []), name: "Something else" }]);
    const resized = withProducts(before, [{ ...productFor(capsules, [own]), batchQuantity: 1 }]);
    const unknown = withProducts(before, [own, { ...productFor(boxes, []), masterDataId: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e99" }]);
    const removed = withProducts(before, [productFor(boxes, [])]);
    for (const after of [tampered, resized, unknown, removed]) {
      expect(reviewWorkspaceChange(before, after, planner, catalog).denied).toEqual(["change units, people, products, machines or measurements"]);
      expect(reviewWorkspaceChange(before, after, admin, catalog).allowed).toBe(true);
    }
  });
});
