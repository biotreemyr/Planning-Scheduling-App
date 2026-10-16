import { describe, expect, it } from "vitest";
import { emptyDirectory } from "../src/lib/domain/emptyWorkspace";
import type { CalendarDirectory } from "../src/lib/domain/calendarAccess";
import type { PlanLine } from "../src/lib/domain/types";
import type { JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";
import { closeOrder, closedSummary, finalOutputFor, jobForOrder, jobParts, needsFormulaCheck, orderedInJobs, orderViewLines, readyToClose, releasedToOrder, releaseToOrders, sharesAfterYield, sharesProblem } from "../src/lib/services/sharedJobs";

// Customer A's Vitamin C (FG-001, 30s bottles) and customer B's same formula (FG-002, 60s blisters).
const po = (id: string, extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({ id, poNumber: id.toUpperCase(), productId: "fg-001", quantity: 2000, uom: "bottles", format: "Tablet", expectedDates: {}, createdAt: "2026-10-15T00:00:00.000Z", createdBy: "Planner", ...extra });
const poA = po("po-a", { deliveryDate: "2026-11-30" });
const poB = po("po-b", { productId: "fg-002", quantity: 1000, uom: "blisters", deliveryDate: "2026-11-15" });
const orders = [poA, poB, po("po-c", { format: "Capsule" })];
const job: JobOrder = {
  id: "job-10", number: "JO0010", orderId: "po-a", sequence: 1, quantity: 120000, uom: "tablets", batchSizeKg: 120, packQuantity: 2000, packUom: "bottles", packSize: 30, boxQuantity: 100,
  shares: [{ orderId: "po-b", quantity: 60000, packQuantity: 1000, packUom: "blisters", packSize: 60, boxQuantity: 50 }], createdAt: "2026-10-15T00:00:00.000Z", createdBy: "Planner"
};
const formatOf = (order: PurchaseOrder) => order.format ?? "Other";
const settings = (planned: "batchSize" | "batchQuantity" | "packQuantity" | "boxes") => ({ forms: ["Tablet" as const], optional: false, planned, report: "count" as const });
const directory: CalendarDirectory = { ...emptyDirectory(), units: [{ id: "u", name: "BTP" }],
  processes: [{ id: "p-comp", name: "Compression", settings: settings("batchQuantity") }, { id: "p-fill", name: "Filling", settings: settings("packQuantity") }, { id: "p-pack", name: "Packing", settings: settings("boxes") }],
  calendars: [{ id: "c-comp", unitId: "u", processId: "p-comp", name: "Compression" }, { id: "c-fill", unitId: "u", processId: "p-fill", name: "Filling" }, { id: "c-pack", unitId: "u", processId: "p-pack", name: "Packing" }] };
const line = (id: string, calendarId: string, orderId: string, extra: Partial<PlanLine> = {}): PlanLine =>
  ({ id, planId: "plan", calendarId, productId: orderId === "po-b" ? "fg-002" : "fg-001", quantity: 1, uom: "tablets", plannedDate: "2026-10-20", priority: "Normal", status: "Unscheduled", jobOrderId: "job-10", productionOrderId: orderId, ...extra });

describe("a batch shared by several POs", () => {
  it("gives the first PO the rest of the batch and each PO its own packing job order", () => {
    expect(jobParts(job).map((part) => [part.orderId, part.quantity, part.packingNumber])).toEqual([["po-a", 60000, "PJO0010"], ["po-b", 60000, "PJO0010-2"]]);
    expect(jobForOrder(job, "po-b")).toMatchObject({ orderId: "po-b", quantity: 60000, packQuantity: 1000, packUom: "blisters", packSize: 60, boxQuantity: 50 });
  });

  it("allows up to 5 POs of the same dosage form, each once, within what they ordered", () => {
    expect(sharesProblem(job, orders, [job], formatOf)).toBe("");
    const share = (orderId: string) => ({ orderId, quantity: 1 });
    expect(sharesProblem({ ...job, shares: ["b", "c", "d", "e", "f"].map(share) }, orders, [], formatOf)).toBe("One batch can serve at most 5 POs.");
    expect(sharesProblem({ ...job, shares: [share("po-b"), share("po-b")] }, orders, [], formatOf)).toBe("Each PO can be listed once.");
    expect(sharesProblem({ ...job, shares: [share("po-c")] }, orders, [], formatOf)).toMatch(/only the same dosage form/);
    expect(sharesProblem({ ...job, shares: [{ orderId: "po-b", quantity: 120000 }] }, orders, [], formatOf)).toMatch(/shares add up to the whole batch/);
    const blisterJob = { ...job, uom: "blisters", quantity: 3000, shares: [{ orderId: "po-b", quantity: 1500 }] };
    expect(sharesProblem(blisterJob, orders, [blisterJob], formatOf)).toMatch(/more than the 1,000 ordered/);
  });

  it("needs QA's same-formula confirmation only when the FG codes differ", () => {
    expect(needsFormulaCheck(job, orders)).toBe(true);
    expect(needsFormulaCheck({ ...job, shares: [{ orderId: "po-a2", quantity: 1 }] }, [...orders, po("po-a2")])).toBe(false);
  });

  it("gives a short yield to the PO due first", () => {
    // PO B is due on 15/11, before PO A (30/11): it keeps its full 60,000; PO A takes the rest.
    expect(sharesAfterYield(job, orders, 110000)).toEqual([{ orderId: "po-b", planned: 60000, available: 60000 }, { orderId: "po-a", planned: 60000, available: 50000 }]);
  });

  it("counts the shared processes for every PO, but filling and packing only for their own PO", () => {
    const lines = [line("comp", "c-comp", "po-a"), line("fill-a", "c-fill", "po-a"), line("fill-b", "c-fill", "po-b")];
    const view = orderViewLines(lines, [job], directory);
    expect(view.filter((item) => item.productionOrderId === "po-b").map((item) => item.id).sort()).toEqual(["comp", "fill-b"]);
    expect(view.filter((item) => item.productionOrderId === "po-a").map((item) => item.id).sort()).toEqual(["comp", "fill-a"]);
    const done = [...lines, line("pack-b", "c-pack", "po-b", { completedAt: "2026-10-22T09:00:00.000Z", yieldQuantity: 50, uom: "boxes" })];
    expect(finalOutputFor(job, "po-b", done, [], directory)).toEqual([{ quantity: 50, uom: "boxes" }]);
  });
});

describe("release and closing", () => {
  const tested: JobOrder = { ...job, testResult: "Passed", testedAt: "2026-10-23T00:00:00.000Z", formulaConfirmedAt: "2026-10-16T00:00:00.000Z", formulaConfirmedBy: "QA" };
  const at = new Date("2026-10-24T08:00:00.000Z");

  it("waits for QA's formula confirmation", () => {
    expect(releaseToOrders({ ...tested, formulaConfirmedAt: undefined }, [{ orderId: "po-a", quantity: 1, uom: "bottles" }], orders, "QA", at)).toEqual({ error: "QA has not yet confirmed that the POs sharing JO0010 are the same formula." });
  });

  it("releases one PO at a time, then the batch once every PO has its release", () => {
    const first = releaseToOrders(tested, [{ orderId: "po-a", quantity: 2006, uom: "bottles", otherUses: [{ quantity: 1, note: "Retention sample" }, { quantity: 1, note: "QC testing" }] }], orders, "QA", at) as JobOrder;
    expect(first.releasedAt).toBeUndefined();
    expect(first.poReleases?.[0]).toMatchObject({ orderId: "po-a", quantity: 2006, otherUses: [{ quantity: 1, note: "Retention sample" }, { quantity: 1, note: "QC testing" }] });
    expect(releaseToOrders(first, [{ orderId: "po-a", quantity: 1, uom: "bottles" }], orders, "QA", at)).toEqual({ error: "JO0010 is already released to PO-A." });
    const both = releaseToOrders(first, [{ orderId: "po-b", quantity: 982, uom: "blisters", otherUses: [{ quantity: 18, note: "Stability study" }] }], orders, "QA", at) as JobOrder;
    expect(both.releasedAt).toBe(at.toISOString());
    expect(releasedToOrder("po-b", [both])).toEqual([{ quantity: 982, uom: "blisters" }]);
  });

  it("releases the whole batch at once, and asks what any other use was", () => {
    expect(releaseToOrders(tested, [{ orderId: "po-a", quantity: 1990, uom: "bottles", otherUses: [{ quantity: 10, note: " " }] }], orders, "QA", at)).toEqual({ error: "PO-A: say what the 10 bottles went to." });
    const all = releaseToOrders(tested, [{ orderId: "po-a", quantity: 2000, uom: "bottles" }, { orderId: "po-b", quantity: 1000, uom: "blisters" }], orders, "QA", at) as JobOrder;
    expect(all.releasedAt).toBe(at.toISOString());
  });

  it("is ready for planning to close once every batch is released to the PO, closing with a reason when it differs", () => {
    const released = releaseToOrders(tested, [{ orderId: "po-a", quantity: 2006, uom: "bottles" }], orders, "QA", at) as JobOrder;
    expect(readyToClose(poA, [released])).toBe(true);
    expect(readyToClose(poB, [released])).toBe(false);
    expect(closeOrder(poA, 2006, "bottles", "", "Planner", at)).toEqual({ error: "Say why PO-A closes above the 2,000 bottles ordered." });
    const closed = closeOrder(poA, 2006, "bottles", "Customer took the extra 6", "Planner", at) as PurchaseOrder;
    expect(closedSummary(closed)).toBe("Closed · 2,006 of 2,000 bottles (+6)");
    expect(readyToClose(closed, [released])).toBe(false);
  });
});

describe("who may change a shared batch", () => {
  it("lets only QA (release) confirm the formula and release to POs, and only orders editors share the batch", async () => {
    const { newWorkspace } = await import("../src/lib/domain/workspace");
    const { addSampleData } = await import("../src/lib/domain/sampleData");
    const { capabilitiesFromPermissions } = await import("../src/lib/auth/capabilities");
    const { reviewWorkspaceChange } = await import("../src/lib/auth/workspaceAccess");
    const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
    const [first, second] = base.data.orders;
    base.data.jobOrders.push({ id: "job-s", number: "JO0070", orderId: first.id, sequence: 9, quantity: 100, uom: first.uom, createdAt: "2026-10-07T00:00:00Z", createdBy: "Aida" });
    const role = (...keys: string[]) => capabilitiesFromPermissions(keys.map((key) => `scheduler.${key}`));
    const qa = role("release.view", "release.edit"), planner = role("orders.view", "orders.edit");
    const change = (edit: (job: JobOrder) => void) => { const next = structuredClone(base); edit(next.data.jobOrders.at(-1)!); return next; };
    const shared = change((job) => { job.shares = [{ orderId: second.id, quantity: 40 }]; });
    expect(reviewWorkspaceChange(base, shared, planner).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, shared, qa).denied).toEqual(["edit job orders"]);
    const confirmed = change((job) => { job.formulaConfirmedAt = "2026-10-16T00:00:00.000Z"; job.formulaConfirmedBy = "QA"; });
    expect(reviewWorkspaceChange(base, confirmed, qa).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, confirmed, planner).denied).toEqual(["confirm a shared batch's formula"]);
    const released = change((job) => { job.poReleases = [{ orderId: first.id, quantity: 100, uom: first.uom, releasedAt: "2026-10-20T00:00:00.000Z", releasedBy: "QA" }]; });
    expect(reviewWorkspaceChange(base, released, qa).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, released, planner).denied).toEqual(["release or reject batches"]);
  });
});

describe("short yield shown to planning", () => {
  it("works out each PO's share from what compression made, earliest delivery first", async () => {
    const { shortYield } = await import("../src/lib/services/sharedJobs");
    const plannedOf = (calendarId?: string) => calendarId === "c-comp" ? "batchQuantity" as const : "packQuantity" as const;
    const made = [line("comp", "c-comp", "po-a", { quantity: 120000, completedAt: "2026-10-20T09:00:00.000Z", yieldQuantity: 110000, uom: "tablets" })];
    expect(shortYield(job, made, orders, plannedOf)).toEqual({ made: 110000, shares: [{ orderId: "po-b", planned: 60000, available: 60000 }, { orderId: "po-a", planned: 60000, available: 50000 }] });
    expect(shortYield(job, [{ ...made[0], yieldQuantity: 120000 }], orders, plannedOf)).toBeUndefined();
  });
  it("counts job orders in the PO's unit, whatever unit their batch quantity is in", () => {
    // PWL005114: a PO in boxes, its job orders in capsules with the boxes keyed in.
    const boxes = po("po-box", { quantity: 2000, uom: "boxes", format: "Capsule", unitsPerPack: 60 });
    const capsules = (id: string, extra: Partial<JobOrder>): JobOrder => ({ id, number: id.toUpperCase(), orderId: "po-box", sequence: 1, quantity: 20100, uom: "capsules", createdAt: "2026-10-15T00:00:00.000Z", createdBy: "Planner", ...extra });
    const jobs = [1, 2, 3, 4, 5].map((n) => capsules(`jo-${n}`, { boxQuantity: 335 })).concat(capsules("jo-6", { quantity: 20100 }));
    // Five by their boxes, the sixth by capsules / 60 per box.
    expect(orderedInJobs(boxes, jobs)).toEqual({ total: 5 * 335 + 335, uncounted: [] });
    expect(orderedInJobs({ ...boxes, unitsPerPack: undefined }, jobs).uncounted.map((item) => item.id)).toEqual(["jo-6"]);
    // The bottles of a shared batch count by each PO's own pack quantity.
    expect(orderedInJobs(poA, [job]).total).toBe(2000);
    expect(orderedInJobs(poB, [job]).total).toBe(1000);
  });
});
