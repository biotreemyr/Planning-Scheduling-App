import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { capabilitiesFromPermissions } from "../src/lib/auth/capabilities";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { restoreHidden, visibleWorkspace } from "../src/lib/auth/workspaceView";
import { stampWho } from "../src/lib/persistence/stampWho";

const role = (...keys: string[]) => capabilitiesFromPermissions(keys.map((key) => `scheduler.${key}`));
const production = role("planning.view", "schedule.view", "schedule.edit");
const plannerOnly = role("planning.create", "planning.edit", "planning.view", "schedule.view");
const qa = role("planning.view", "testing.view", "testing.edit", "release.view", "release.edit");
const orders = role("planning.view", "orders.view");

// Sample data with every hidden kind of field filled in: SO number, remarks, closing, testing and release.
const sample = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
Object.assign(sample.data.orders[0], { soNumber: "SO-123", receivedDate: "2026-09-01", notes: "Price agreed at RM 1.20", closedQuantity: 100, closedUom: "boxes", closedAt: "2026-10-01T10:00:00.000Z", closedBy: "Planner", closeNote: "Short shipped" });
Object.assign(sample.data.jobOrders[0], { notes: "Customer complaint follow-up", testedAt: "2026-10-08T10:00:00.000Z", testedBy: "QC", testResult: "Passed", releaseQuantity: 4100, releaseUom: "boxes", releasedAt: "2026-10-09T10:00:00.000Z", releasedBy: "QA" });
const base = parseWorkspace(sample);
const copy = <T,>(value: T) => structuredClone(value);
const keysOf = (items: object[]) => new Set(items.flatMap((item) => Object.keys(item)));

describe("what a person's page is sent", () => {
  it("sends order viewers the whole workspace", () => {
    expect(visibleWorkspace(base, orders)).toEqual(base);
    expect(visibleWorkspace(base, role("orders.create"))).toEqual(base);
  });
  it("keeps customers, sales details, remarks, testing and release from production", () => {
    const sent = visibleWorkspace(base, production);
    expect(sent.data.customers).toEqual([]);
    const orderKeys = keysOf(sent.data.orders), jobKeys = keysOf(sent.data.jobOrders);
    for (const key of ["customerId", "customerName", "soNumber", "receivedDate", "notes", "closedQuantity", "closedAt", "closedBy", "closeNote"]) expect(orderKeys.has(key)).toBe(false);
    for (const key of ["notes", "testedAt", "testResult", "releaseQuantity", "releasedAt", "releasedBy", "poReleases"]) expect(jobKeys.has(key)).toBe(false);
    // The page still has a valid workspace to plan from.
    expect(() => parseWorkspace(sent)).not.toThrow();
  });
  it("keeps what planning and production need", () => {
    const sent = visibleWorkspace(base, plannerOnly);
    for (const key of ["id", "poNumber", "productId", "quantity", "uom", "expectedDates", "format", "unitId"]) expect(keysOf(sent.data.orders).has(key)).toBe(true);
    for (const key of ["id", "number", "orderId", "quantity", "uom"]) expect(keysOf(sent.data.jobOrders).has(key)).toBe(true);
    expect(sent.data.orders.map((order) => order.poNumber)).toEqual(base.data.orders.map((order) => order.poNumber));
    expect(sent.data.lines).toEqual(base.data.lines);
    expect(sent.data.actuals).toEqual(base.data.actuals);
    expect(sent.data.entries).toEqual(base.data.entries);
    expect(sent.data.transfers).toEqual(base.data.transfers);
    expect(sent.yieldLimits).toEqual(base.yieldLimits);
    expect(sent.products).toEqual(base.products);
  });
  it("sends QA/QC customer names, testing and release, but not the customer list or sales details", () => {
    const sent = visibleWorkspace(base, qa);
    expect(sent.data.customers).toEqual([]);
    expect(sent.data.orders[0].customerName).toBe(base.data.orders[0].customerName);
    expect(sent.data.orders[0].customerId).toBeUndefined();
    expect(sent.data.orders[0].soNumber).toBeUndefined();
    expect(sent.data.jobOrders[0]).toMatchObject({ testResult: "Passed", releasedAt: "2026-10-09T10:00:00.000Z" });
    expect(sent.data.jobOrders[0].notes).toBeUndefined();
  });
});

describe("a save from a page sent part of the workspace", () => {
  for (const [name, can] of [["production", production], ["planner without order rights", plannerOnly], ["QA/QC", qa]] as const) {
    it(`leaves hidden data untouched for ${name}`, () => {
      const restored = parseWorkspace(restoreHidden(base, visibleWorkspace(base, can), can));
      expect(restored).toEqual(base);
      expect(reviewWorkspaceChange(base, restored, can)).toEqual({ allowed: true, denied: [], summary: [] });
    });
  }
  it("keeps hidden data as stored alongside an allowed change", () => {
    const sent = copy(visibleWorkspace(base, production));
    Object.assign(sent.data.jobOrders[0], { batchNumber: "B-001", batchNumberBy: "Ali", batchNumberAt: "2026-10-10T10:00:00.000Z" });
    const restored = stampWho(base, parseWorkspace(restoreHidden(base, sent, production)), "Ali");
    expect(restored.data.jobOrders[0]).toMatchObject({ batchNumber: "B-001", notes: "Customer complaint follow-up", testResult: "Passed", releasedBy: "QA" });
    expect(restored.data.orders).toEqual(base.data.orders);
    expect(restored.data.customers).toEqual(base.data.customers);
    expect(reviewWorkspaceChange(base, restored, production).allowed).toBe(true);
  });
  it("ignores hidden fields a page sends anyway", () => {
    const sent = copy(visibleWorkspace(base, production));
    Object.assign(sent.data.orders[0], { soNumber: "SO-FORGED", notes: "changed" });
    Object.assign(sent.data.jobOrders[1], { testResult: "Passed", testedAt: "2026-10-10T10:00:00.000Z", testedBy: "Ali" });
    sent.data.customers = [];
    const restored = parseWorkspace(restoreHidden(base, sent, production));
    expect(restored).toEqual(base);
  });
  it("still refuses removing or adding orders without order rights", () => {
    const removed = copy(visibleWorkspace(base, plannerOnly));
    const unused = removed.data.orders.find((order) => !removed.data.jobOrders.some((job) => job.orderId === order.id || job.shares?.some((share) => share.orderId === order.id)) && !removed.data.lines.some((line) => line.productionOrderId === order.id))!;
    removed.data.orders = removed.data.orders.filter((order) => order !== unused);
    expect(reviewWorkspaceChange(base, parseWorkspace(restoreHidden(base, removed, plannerOnly)), plannerOnly).denied).toEqual(["edit or delete orders"]);
    const added = copy(visibleWorkspace(base, plannerOnly));
    added.data.orders.push({ ...added.data.orders[0], id: "new-order", poNumber: "PO-NEW", number: 99 });
    expect(reviewWorkspaceChange(base, parseWorkspace(restoreHidden(base, added, plannerOnly)), plannerOnly).denied).toEqual(["add orders"]);
  });
  it("takes an order viewer's save as sent", () => {
    const sent = copy(base);
    sent.data.orders[0].notes = "Updated";
    expect(restoreHidden(base, sent, orders)).toBe(sent);
  });
});
