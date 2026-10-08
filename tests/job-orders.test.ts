import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { activityFacts, checkTally, defaultPackingNumber, packingNumber, createManualJobOrder, finalOutput, findJobByNumber, missingQuantity, packsFor, processQuantity, updateJobOrder, validateBatchNumber, validateCustomer, type JobOrder } from "../src/lib/services/jobOrders";
import { validateOrder } from "../src/lib/services/orders";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { capabilitiesForDemoRole } from "../src/lib/auth/capabilities";
import { createBatchLines } from "../src/lib/services/planChanges";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
// A newly received PO with no job orders yet: 600,000 folic acid tablets.
const order = state.data.orders.find((item) => item.poNumber === "PO-2610-142")!;
const today = new Date(2026, 9, 7, 10);
// What every process of a tablet batch makes: dispensing's kg, filling's bottles, packing's boxes.
const measures = { batchSizeKg: 75, packQuantity: 5000, packUom: "bottles", boxQuantity: 209 };

describe("job orders", () => {
  const keyIn = (number: string, quantity: number, jobs: JobOrder[] = state.data.jobOrders) => createManualJobOrder({ number, orderId: order.id, quantity, uom: "tablets", ...measures }, state.data.orders, jobs, state.products, { today, userName: "Aida", newId: () => `job-${number}` });
  it("keys in several job orders on one PO item, never more than it ordered", () => {
    const first = keyIn("JO0010", 300000) as JobOrder;
    const second = keyIn("JO0011", 300000, [...state.data.jobOrders, first]) as JobOrder;
    expect([first.sequence, second.sequence, second.orderId]).toEqual([1, 2, order.id]);
    expect(keyIn("JO0012", 1, [...state.data.jobOrders, first, second])).toEqual({ error: "Job orders for PO-2610-142 would add up to 600,001 tablets, more than the 600,000 ordered." });
  });
  it("edits a job order: new number, quantity and batch number, still checked", () => {
    const first = keyIn("JO0010", 300000) as JobOrder;
    const second = keyIn("JO0011", 300000, [...state.data.jobOrders, first]) as JobOrder;
    const jobs = [...state.data.jobOrders, first, second];
    expect(updateJobOrder({ ...first, number: " JO0010-A ", quantity: 250000, batchNumber: "FA-777" }, jobs, state.data.orders, state.products)).toMatchObject({ number: "JO0010-A", quantity: 250000, batchNumber: "FA-777" });
    expect(updateJobOrder({ ...first, number: "jo0011" }, jobs, state.data.orders, state.products)).toEqual({ error: "Job order jo0011 already exists." });
    expect(updateJobOrder({ ...first, number: "" }, jobs, state.data.orders, state.products)).toEqual({ error: "Key in the job order number." });
    expect(updateJobOrder({ ...first, quantity: 300001 }, jobs, state.data.orders, state.products)).toMatchObject({ error: expect.stringContaining("allowable batch quantity") });
    const taken = state.data.jobOrders.find((job) => job.batchNumber)!.batchNumber!;
    expect(updateJobOrder({ ...first, batchNumber: taken }, jobs, state.data.orders, state.products)).toEqual({ error: `Batch number ${taken} is already used by another job order.` });
  });
  it("plans a job order's route as activities linked to it, which the workspace accepts", () => {
    const job = keyIn("JO0020", 300000) as JobOrder;
    let id = 0;
    const result = createBatchLines({ label: job.number, quantity: job.quantity, startDate: "2026-10-12", jobOrderId: job.id }, { order, format: "Tablet", lines: state.data.lines, directory: state.directory, uom: order.uom, newId: () => `line-new-${++id}` });
    if ("error" in result) throw new Error(result.error);
    expect(result.lines.every((line) => line.jobOrderId === job.id && line.orderReference === job.number && line.productionOrderId === order.id)).toBe(true);
    const next = structuredClone(state);
    next.data.jobOrders.push(job);
    next.data.lines.push(...result.lines.map((line) => ({ ...line, calendarId: line.calendarId! })));
    expect(() => parseWorkspace(next)).not.toThrow();
    // An activity pointing at another product's job order is refused.
    const wrong = structuredClone(next);
    wrong.data.lines[0] = { ...wrong.data.lines[0], jobOrderId: job.id };
    expect(() => parseWorkspace(wrong)).toThrow();
  });
  it("keeps batch numbers unique and customer IDs unique", () => {
    const [first, second] = state.data.jobOrders.filter((job) => job.batchNumber);
    expect(validateBatchNumber(` ${first.batchNumber!.toLowerCase()} `, second, state.data.jobOrders)).toContain("already used");
    expect(validateBatchNumber(first.batchNumber!, first, state.data.jobOrders)).toBe("");
    expect(validateCustomer({ id: "new", code: "smp-c001", name: "Copy" }, state.data.customers)).toEqual(["Customer ID smp-c001 is already used."]);
    expect(validateCustomer({ id: "new", code: "C0099", name: " " }, state.data.customers)).toEqual(["Enter the customer name."]);
  });
  it("lets production enter batch numbers but not create job orders", () => {
    const production = capabilitiesForDemoRole("production");
    const withBatch = structuredClone(state);
    const job = withBatch.data.jobOrders.find((item) => !item.batchNumber)!;
    Object.assign(job, { batchNumber: "FA-099", batchNumberBy: "Kumar", batchNumberAt: "2026-10-07T02:00:00.000Z" });
    expect(reviewWorkspaceChange(state, withBatch, production).allowed).toBe(true);
    const created = structuredClone(state);
    created.data.jobOrders.push({ ...job, id: "job-extra", number: "JO-2610-050", batchNumber: undefined });
    expect(reviewWorkspaceChange(state, created, production)).toMatchObject({ allowed: false, denied: ["create or remove job orders"] });
    expect(reviewWorkspaceChange(state, created, capabilitiesForDemoRole("planner")).allowed).toBe(true);
    const resized = structuredClone(state);
    resized.data.jobOrders[0].quantity += 1;
    expect(reviewWorkspaceChange(state, resized, production).denied).toEqual(["edit job orders"]);
  });
  it("requires every new activity to carry out a job order, and never unlinks one", () => {
    const planner = capabilitiesForDemoRole("planner");
    expect(state.data.lines.every((line) => line.jobOrderId)).toBe(true);
    const linked = state.data.lines.find((line) => line.jobOrderId && !line.completedAt)!;
    const adhoc = structuredClone(state);
    adhoc.data.lines.push({ ...linked, id: "adhoc", jobOrderId: undefined });
    expect(reviewWorkspaceChange(state, adhoc, planner)).toMatchObject({ allowed: false, denied: ["add activities without a job order"] });
    const withJob = structuredClone(state);
    withJob.data.lines.push({ ...linked, id: "second-day" });
    expect(reviewWorkspaceChange(state, withJob, planner).allowed).toBe(true);
    const unlinked = structuredClone(state);
    const line = unlinked.data.lines.find((item) => item.id === linked.id)!;
    delete line.jobOrderId;
    expect(reviewWorkspaceChange(state, unlinked, planner).denied).toContain("unlink activities from their job order");
  });
  it("creates a keyed-in job order number for a PO item, once, within one allowable batch", () => {
    const context = { today, userName: "Aida", newId: () => "job-typed" };
    const typed = createManualJobOrder({ number: " JO/BT/0457 ", orderId: order.id, quantity: 250000, uom: "tablets", ...measures }, state.data.orders, state.data.jobOrders, state.products, context);
    expect(typed).toMatchObject({ id: "job-typed", number: "JO/BT/0457", orderId: order.id, sequence: 1, quantity: 250000 });
    const jobs = [...state.data.jobOrders, typed as never];
    expect(findJobByNumber("jo/bt/0457", jobs)?.id).toBe("job-typed");
    expect(createManualJobOrder({ number: "jo/bt/0457", orderId: order.id, quantity: 1, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "Job order jo/bt/0457 already exists." });
    expect(createManualJobOrder({ number: "JO-X", orderId: "missing", quantity: 1, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "Choose the PO item job order JO-X belongs to." });
    // Folic acid's allowable batch is 300,000 tablets.
    expect(createManualJobOrder({ number: "JO-Y", orderId: order.id, quantity: 300001, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "One job order holds at most the allowable batch quantity of 300,000 tablets." });
  });
  it("keeps the pack quantity, pack UOM and pack size, rounding packs up", () => {
    expect(packsFor(125000, 30)).toBe(4167);
    expect(packsFor(120000, 30)).toBe(4000);
    expect(packsFor(1000)).toBeUndefined();
    const context = { today, userName: "Aida", newId: () => "job-pack" };
    const packed = createManualJobOrder({ number: "JO0030", orderId: order.id, quantity: 300000, uom: "tablets", batchSizeKg: 75, packQuantity: 10000, packUom: "bottles", packSize: 30, boxQuantity: 417 }, state.data.orders, state.data.jobOrders, state.products, context);
    expect(packed).toMatchObject({ batchSizeKg: 75, packQuantity: 10000, packUom: "bottles", packSize: 30 });
    const next = structuredClone(state);
    next.data.jobOrders.push(packed as JobOrder);
    expect(() => parseWorkspace(next)).not.toThrow();
    expect(createManualJobOrder({ number: "JO0031", orderId: order.id, quantity: 1, uom: "tablets", packQuantity: 5 }, state.data.orders, state.data.jobOrders, state.products, context)).toEqual({ error: "Choose the pack UOM (blisters, bottles, sachets...)." });
    expect(updateJobOrder({ ...(packed as JobOrder), packSize: 0 }, [...state.data.jobOrders, packed as JobOrder], state.data.orders, state.products)).toEqual({ error: "Pack size must be greater than zero." });
  });
  it("captures each process's quantity on the job order, and needs every one its route uses", () => {
    const context = { today, userName: "Aida", newId: () => "job-measures" };
    const make = (extra: object) => createManualJobOrder({ number: "JO0040", orderId: order.id, quantity: 300000, uom: "tablets", ...extra }, state.data.orders, state.data.jobOrders, state.products, context);
    const job = make(measures) as JobOrder;
    expect(processQuantity(job, "dispensing")).toEqual({ quantity: 75, uom: "kg" });
    expect(processQuantity(job, "tableting")).toEqual({ quantity: 300000, uom: "tablets" });
    expect(processQuantity(job, "coating")).toEqual({ quantity: 300000, uom: "tablets" });
    expect(processQuantity(job, "filling")).toEqual({ quantity: 5000, uom: "bottles" });
    expect(processQuantity(job, "packing")).toEqual({ quantity: 209, uom: "boxes" });
    // Liquids are dispensed in litres instead.
    const liquid = make({ ...measures, batchSizeKg: undefined, batchVolumeL: 120 }) as JobOrder;
    expect(processQuantity(liquid, "dispensing")).toEqual({ quantity: 120, uom: "L" });
    expect(make({ ...measures, batchVolumeL: 120 })).toEqual({ error: "Key in the batch size in kg or in L, not both." });
    expect(make({ ...measures, batchSizeKg: undefined })).toEqual({ error: "Key in the batch size (kg or L) for Dispensing." });
    expect(make({ ...measures, packQuantity: undefined })).toEqual({ error: "Key in the pack quantity (blisters, bottles or sachets) for Filling." });
    expect(make({ ...measures, boxQuantity: undefined })).toEqual({ error: "Key in the total pack quantity (boxes) for Packing." });
    expect(make({ ...measures, boxQuantity: 0 })).toEqual({ error: "Total pack quantity must be greater than zero." });
    expect(missingQuantity(job, "Other")).toBe("");
  });
  it("warns when a process's planned quantity no longer tallies with its job order", () => {
    // The sample plan tallies: every process plans exactly its job order's figure, split days included.
    expect(checkTally(state.data.lines, state.data.jobOrders, state.directory)).toEqual([]);
    const job = state.data.jobOrders.find((item) => state.data.lines.some((line) => line.jobOrderId === item.id && line.activityType === "Filling"))!;
    const lines = structuredClone(state.data.lines);
    const filling = lines.find((line) => line.jobOrderId === job.id && line.activityType === "Filling")!;
    filling.quantity += 10;
    const warnings = checkTally(lines, state.data.jobOrders, state.directory);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: "tally", orderId: job.orderId, lineIds: expect.arrayContaining([filling.id]) });
    expect(warnings[0].message).toContain(`job order's pack quantity (blisters, bottles or sachets) is ${job.packQuantity!.toLocaleString("en-GB")} ${job.packUom}`);
  });
  it("keeps a PO's production unit optional, but only a unit that exists", () => {
    const base = { id: "new", customerName: "Acme", poNumber: "PO-UNIT-1", productId: state.products[0].id, quantity: 10 };
    expect(validateOrder(base, state.data.orders, state.products)).toEqual([]);
    const next = structuredClone(state);
    next.data.orders[0].unitId = "no-such-unit";
    expect(() => parseWorkspace(next)).toThrow("Invalid order production unit");
  });
  it("totals a job order's final output: completed work not sent on to another process", () => {
    const job = state.data.jobOrders.find((item) => state.data.lines.some((line) => line.jobOrderId === item.id && line.activityType === "Packing" && line.completedAt))!;
    const lines = state.data.lines.filter((line) => line.jobOrderId === job.id);
    const packed = lines.filter((line) => line.activityType === "Packing" && line.completedAt);
    const boxes = packed.reduce((sum, line) => sum + line.yieldQuantity!, 0);
    // Earlier processes handed their output on, so only packing's boxes count.
    const handed = lines.filter((line) => line.completedAt && line.activityType !== "Packing").map((line) => ({ sourceLineId: line.id }));
    expect(finalOutput(job.id, state.data.lines, handed)).toEqual([{ quantity: boxes, uom: "boxes" }]);
    expect(finalOutput(job.id, state.data.lines, [...handed, ...packed.map((line) => ({ sourceLineId: line.id }))])).toEqual([]);
    expect(finalOutput("no-such-job", state.data.lines, [])).toEqual([]);
  });
  it("labels a planned activity with batch number, job order number and its process quantity", () => {
    const job = { ...state.data.jobOrders[0], number: "JO0099", batchNumber: " FA-099 " };
    const line = { ...state.data.lines[0], jobOrderId: job.id, quantity: 75, uom: "kg", completedAt: undefined, yieldQuantity: undefined, yieldUom: undefined };
    expect(activityFacts(line, [job])).toEqual({ batchNumber: "FA-099", jobNumber: "JO0099", quantity: "75 kg", done: false });
    // Once completed, the actual quantity in the unit production reported.
    expect(activityFacts({ ...line, completedAt: "2026-10-08T09:00:00Z", yieldQuantity: 74.5 }, [job]).quantity).toBe("Actual 74.5 kg");
    expect(activityFacts({ ...line, jobOrderId: undefined, orderReference: "Batch 4" }, [job])).toMatchObject({ batchNumber: "", jobNumber: "Batch 4" });
  });
  it("gives packing its own job order number: the job order number with PJO in front, unless keyed in", () => {
    expect(defaultPackingNumber("JO0009")).toBe("PJO0009");
    expect(defaultPackingNumber("jo2026-240")).toBe("PJO2026-240");
    expect(defaultPackingNumber("2610-7")).toBe("PJO2610-7");
    const context = { today, userName: "Aida", newId: () => "job-pjo" };
    const job = createManualJobOrder({ number: "JO0060", orderId: order.id, quantity: 300000, uom: "tablets", ...measures }, state.data.orders, state.data.jobOrders, state.products, context) as JobOrder;
    expect(job.packingNumber).toBeUndefined();
    expect(packingNumber(job)).toBe("PJO0060");
    // Renaming the job order renumbers packing too; a keyed-in packing number stays.
    const jobs = [...state.data.jobOrders, job];
    expect(packingNumber(updateJobOrder({ ...job, number: "JO0061" }, jobs, state.data.orders, state.products) as JobOrder)).toBe("PJO0061");
    expect(updateJobOrder({ ...job, packingNumber: " PJO-SPECIAL " }, jobs, state.data.orders, state.products)).toMatchObject({ packingNumber: "PJO-SPECIAL" });
    const other = { ...job, id: "job-other", number: "JO0070" };
    expect(updateJobOrder({ ...other, packingNumber: "pjo0060" }, [...jobs, other], state.data.orders, state.products)).toEqual({ error: "Packing job order pjo0060 is already used by JO0060." });
    // Packing activities show the packing number.
    const packingLine = { ...state.data.lines[0], jobOrderId: job.id, activityType: "Packing" };
    expect(activityFacts(packingLine, [job]).jobNumber).toBe("PJO0060");
    expect(activityFacts({ ...packingLine, activityType: "Filling" }, [job]).jobNumber).toBe("JO0060");
  });
});

