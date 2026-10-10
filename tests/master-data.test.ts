import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace, type WorkspaceSnapshot } from "../src/lib/domain/workspace";
import type { Customer, Product } from "../src/lib/domain/types";
import { customerFor, productFor, schedulerUom, type MasterCustomer, type MasterProduct } from "../src/lib/services/masterData";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { capabilitiesForDemoRole } from "../src/lib/auth/capabilities";

const capsules: MasterProduct = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e01", code: "FG-CPS-004", name: "BioActiv Methylcobalamin", uom: "CPS" };
const boxes: MasterProduct = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e02", code: "FG-CPS-004A", name: "BioActiv Methylcobalamin 9bp x 10's", uom: "BOXES" };
const powerlife: MasterCustomer = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e11", code: "305-P0001", name: "POWERLIFE (M) SDN. BHD." };
const aurora: MasterCustomer = { id: "6f1d1f8e-3b7a-4c1e-9f3e-2a7c1b9d4e12", code: "305-A0001", name: "AURORA PLUS SDN BHD" };
const catalog = { products: [capsules, boxes], customers: [powerlife, aurora] };
const planner = capabilitiesForDemoRole("planner");
const production = capabilitiesForDemoRole("production");
const admin = capabilitiesForDemoRole("admin");
const own: Product = { id: "own", sku: "fg-cps-004", name: "Methylcobalamin (old name)", uom: "tablets", productType: "Finished Good", active: "Active", batchQuantity: 200000 };
const withProducts = (state: WorkspaceSnapshot, products: Product[]) => parseWorkspace({ ...state, products });

describe("products and customers from Master Data", () => {
  it("maps SQL Account units to the scheduler's", () => {
    expect([schedulerUom("CPS"), schedulerUom("tbt"), schedulerUom("POW"), schedulerUom("BOXES"), schedulerUom("BOTTLE"), schedulerUom("Roll"), schedulerUom("")]).toEqual(["capsules", "tablets", "boxes", "boxes", "bottles", "roll", "boxes"]);
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
  it("links the scheduler's customer with the same code, or makes a new linked one", () => {
    const ownCustomer: Customer = { id: "c1", code: "305-p0001", name: "Powerlife", contactNotes: "Ms Tan", active: "Inactive" };
    expect(customerFor(powerlife, [ownCustomer])).toEqual({ ...ownCustomer, code: "305-P0001", name: powerlife.name, active: "Active", masterDataId: powerlife.id });
    expect(customerFor(aurora, [ownCustomer])).toEqual({ id: `customer-${aurora.id}`, code: "305-A0001", name: aurora.name, active: "Active", masterDataId: aurora.id });
  });
  it("lets anyone who may create orders link a customer exactly as Master Data has it; other edits stay with order editors", () => {
    const ownCustomer: Customer = { id: "c1", code: "305-P0001", name: "Powerlife", active: "Active" };
    const before = parseWorkspace({ ...newWorkspace(), data: { ...newWorkspace().data, customers: [ownCustomer] } });
    const withCustomers = (customers: Customer[]) => parseWorkspace({ ...before, data: { ...before.data, customers } });
    const creator = { ...planner, editOrders: false };
    expect(reviewWorkspaceChange(before, withCustomers([customerFor(powerlife, [ownCustomer])]), creator, catalog).allowed).toBe(true);
    expect(reviewWorkspaceChange(before, withCustomers([ownCustomer, customerFor(aurora, [])]), creator, catalog).allowed).toBe(true);
    expect(reviewWorkspaceChange(before, withCustomers([{ ...customerFor(powerlife, [ownCustomer]), name: "Renamed" }]), creator, catalog).denied).toEqual(["edit customers"]);
    expect(reviewWorkspaceChange(before, withCustomers([customerFor(powerlife, [ownCustomer])]), creator).denied).toEqual(["edit customers"]);
  });
});
