import { describe, expect, it } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { checkProcessFlow, inferFormat, routeLabel, stepOf, actualUoms } from "../src/lib/services/processRules";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const check = (lines = state.data.lines, entries = state.data.entries, orders = state.data.orders) => checkProcessFlow(lines, entries, orders, state.products, state.directory);
const line = (po: string, batch: string, process: string) => {
  const order = state.data.orders.find((item) => item.poNumber === po)!;
  return state.data.lines.find((item) => item.productionOrderId === order.id && item.orderReference === batch && item.activityType === process)!;
};

describe("process routes by product format", () => {
  it("defines the three routes and treats shop-floor synonyms as the same step", () => {
    expect(routeLabel("Capsule")).toBe("Dispensing → (Granulation) → Capsulation → Filling → Packing");
    expect(routeLabel("Tablet")).toBe("Dispensing → (Granulation) → Compression → Coating → Filling → Packing");
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

describe("units for reporting actual quantities", () => {
  it("gives each process its own reporting units", () => {
    expect(actualUoms("Dispensing")).toEqual(["kg", "g", "L", "mL"]);
    expect(actualUoms("Compression")).toEqual(["kg", "g", "L", "mL"]);
    expect(actualUoms("Capsulation")).toEqual(["kg", "g", "L", "mL"]);
    expect(actualUoms("Filling")).toEqual(["bottles", "blisters", "sachets", "pouches"]);
    expect(actualUoms("Packing")).toEqual(["boxes"]);
    expect(actualUoms("Blending", "kg")).toEqual(["kg"]);
  });
});

describe("granulation, an optional step", async () => {
  const { routeDrafts } = await import("../src/lib/services/planChanges");
  const { stepOf, OPTIONAL_STEPS } = await import("../src/lib/services/processRules");
  const { processQuantity } = await import("../src/lib/services/jobOrders");
  const calendars = ["Dispensing", "Granulation", "Compression", "Coating", "Filling", "Packing"].map((name) => ({ id: name.toLowerCase(), name }));
  it("is planned between dispensing and compression when the unit has it, and left out otherwise", () => {
    expect(stepOf("Wet granulation")).toBe("granulation");
    expect(OPTIONAL_STEPS.has("granulation")).toBe(true);
    const withIt = routeDrafts("Tablet", calendars, (id) => calendars.find((item) => item.id === id)!.name, "2026-10-12");
    expect(withIt.map((draft) => draft.label)).toEqual(["Dispensing", "Granulation", "Compression", "Coating", "Filling", "Packing"]);
    const without = calendars.filter((item) => item.name !== "Granulation");
    const plain = routeDrafts("Tablet", without, (id) => without.find((item) => item.id === id)!.name, "2026-10-12");
    expect(plain.map((draft) => draft.label)).toEqual(["Dispensing", "Compression", "Coating", "Filling", "Packing"]);
    expect(plain[1].date).toBe("2026-10-13");
  });
  it("takes the batch size as its theoretical quantity", () => {
    const job = { id: "j", number: "JO1", orderId: "o", sequence: 1, quantity: 300000, uom: "tablets", batchSizeKg: 75, createdAt: "2026-10-08T00:00:00Z", createdBy: "Aida" };
    expect(processQuantity(job, "granulation")).toEqual({ quantity: 75, uom: "kg" });
  });
});

describe("processes set up in Admin", async () => {
  const { newWorkspace, parseWorkspace } = await import("../src/lib/domain/workspace");
  const { addSampleData } = await import("../src/lib/domain/sampleData");
  const { unitRoute, unitRouteLabel, settingsOf } = await import("../src/lib/services/processSetup");
  const { checkProcessFlow } = await import("../src/lib/services/processRules");
  const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
  const unitId = "sample-unit-mfg";
  it("gives the built-in processes their usual settings", () => {
    expect(settingsOf({ name: "Compression" })).toEqual({ forms: ["Tablet"], optional: false, planned: "batchQuantity", report: "count" });
    expect(unitRouteLabel(state.directory, unitId, "Capsule")).toBe("Dispensing → Capsulation → Filling → Packing");
  });
  it("adds a new process to a dosage form's route in the unit's order, and drops one taken off a form", () => {
    const next = structuredClone(state);
    next.directory.processes.push({ id: "process-blending", name: "Blending", settings: { forms: ["Capsule"], optional: false, planned: "batchSize", report: "measure" } });
    const dispensing = next.directory.calendars.findIndex((item) => item.unitId === unitId && item.name === "Dispensing");
    next.directory.calendars.splice(dispensing + 1, 0, { id: "cal-blending", unitId, processId: "process-blending", name: "Blending" });
    expect(() => parseWorkspace(next)).not.toThrow();
    expect(unitRoute(next.directory, unitId, "Capsule").map((entry) => entry.name)).toEqual(["Dispensing", "Blending", "Capsulation", "Filling", "Packing"]);
    expect(unitRoute(next.directory, unitId, "Tablet").map((entry) => entry.name)).not.toContain("Blending");
    // Blending is required for capsules, so capsule batches planned without it are warned about.
    const warnings = checkProcessFlow(next.data.lines, next.data.entries, next.data.orders, next.products, next.directory);
    expect(warnings.some((warning) => warning.kind === "missing" && warning.message.includes("Blending is not planned before Capsulation"))).toBe(true);
    // Taking coating off tablets: planned coating activities are then outside the route.
    const coating = next.directory.processes.find((item) => item.name === "Coating")!;
    coating.settings = { ...settingsOf(coating), forms: [] };
    const outside = checkProcessFlow(next.data.lines, next.data.entries, next.data.orders, next.products, next.directory);
    expect(outside.some((warning) => warning.kind === "route" && warning.message.startsWith(state.data.orders.find((order) => order.format === "Tablet")!.poNumber) || warning.message.includes("Coating is not part of the tablet route"))).toBe(true);
  });
});
