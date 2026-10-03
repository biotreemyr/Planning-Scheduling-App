import { describe, expect, it } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { checkProcessFlow, inferFormat, routeLabel, stepOf } from "../src/lib/services/processRules";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const check = (lines = state.data.lines, entries = state.data.entries, orders = state.data.orders) => checkProcessFlow(lines, entries, orders, state.products, state.directory);
const line = (po: string, batch: string, process: string) => {
  const order = state.data.orders.find((item) => item.poNumber === po)!;
  return state.data.lines.find((item) => item.productionOrderId === order.id && item.orderReference === batch && item.activityType === process)!;
};

describe("process routes by product format", () => {
  it("defines the three routes and treats shop-floor synonyms as the same step", () => {
    expect(routeLabel("Capsule")).toBe("Dispensing → Capsulation → Filling → Packing");
    expect(routeLabel("Tablet")).toBe("Dispensing → Tableting → Coating → Filling → Packing");
    expect(routeLabel("Sachet")).toBe("Dispensing → Filling → Packing");
    expect(stepOf("Compression")).toBe("tableting");
    expect(stepOf(" bottling ")).toBe("filling");
    expect(stepOf("Fermentation")).toBeUndefined();
  });
  it("infers a default format from the product", () => {
    expect(inferFormat({ name: "Iron Pyro B-Plus Capsules", uom: "capsules" })).toBe("Capsule");
    expect(inferFormat({ name: "Vitamin C Plus (28 tabs x 1000mg)", uom: "tablets" })).toBe("Tablet");
    expect(inferFormat({ name: "Collagen Peptide Sachet", uom: "sachets" })).toBe("Sachet");
    expect(inferFormat({ name: "Black Soybean Fermented Powder", uom: "kg" })).toBe("Other");
  });
  it("finds only the deliberate sample warning: sachet batch 2 packed before filling", () => {
    const warnings = check();
    expect(warnings.map((item) => [item.kind, item.batch])).toEqual([["sequence", "Batch 2"]]);
    expect(warnings[0].message).toMatch(/^PO-2609-129 Batch 2: Packing on .* is before Filling finishes on /);
    expect(state.data.orders.find((order) => order.poNumber === "PO-2609-129")!.format).toBe("Sachet");
  });
  it("warns when a step is outside the format route, e.g. coating a capsule", () => {
    const capsule = line("PO-2610-133", "Batch 3", "Capsulation");
    const coating = state.directory.calendars.find((item) => item.name === "Coating" && item.unitId === "sample-unit-mfg")!;
    const warnings = check([...state.data.lines, { ...capsule, id: "extra", calendarId: coating.id, activityType: "Coating" }]);
    expect(warnings.find((item) => item.kind === "route")?.message).toBe("PO-2610-133 Batch 3: Coating is not part of the capsule route (Dispensing → Capsulation → Filling → Packing).");
  });
  it("warns when a required step is skipped before a later one", () => {
    const skipped = line("PO-2610-131", "Batch 7", "Coating");
    const warnings = check(state.data.lines.filter((item) => !(item.productionOrderId === skipped.productionOrderId && item.orderReference === "Batch 7" && item.activityType === "Coating")), []);
    expect(warnings.map((item) => item.message)).toContain("PO-2610-131 Batch 7: Coating is not planned before Filling.");
  });
  it("warns when a later step is moved before the previous one finishes, and clears when fixed", () => {
    const packing = line("PO-2610-131", "Batch 7", "Packing");
    const moved = state.data.lines.map((item) => item.id === packing.id ? { ...item, plannedDate: "2026-10-01" } : item);
    expect(check(moved, []).some((item) => item.kind === "sequence" && item.lineIds.includes(packing.id))).toBe(true);
    expect(check(state.data.lines, []).some((item) => item.lineIds.includes(packing.id))).toBe(false);
  });
  it("flags a machine booking left on a different day from its activity", () => {
    const entry = state.data.entries.find((item) => item.status === "Confirmed")!;
    const entries = state.data.entries.map((item) => item.id === entry.id ? { ...item, startAt: "2026-12-01T08:00", endAt: "2026-12-01T12:00" } : item);
    expect(check(state.data.lines, entries).filter((item) => item.kind === "booking").map((item) => item.lineIds)).toEqual([[entry.planLineId]]);
  });
  it("uses the order's format over the product's", () => {
    const orders = state.data.orders.map((order) => order.poNumber === "PO-2609-125" ? { ...order, format: "Capsule" as const } : order);
    const route = check(state.data.lines, [], orders).filter((item) => item.kind === "route" && item.message.startsWith("PO-2609-125"));
    // One warning per wrong process per batch: Compression and Coating, for each of 3 batches.
    expect(route).toHaveLength(6);
    expect(route.find((item) => item.message.startsWith("PO-2609-125 Batch 1: Compression"))!.lineIds).toHaveLength(2);
  });
});
