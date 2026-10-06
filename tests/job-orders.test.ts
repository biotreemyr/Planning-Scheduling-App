import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { buildJobOrders, createManualJobOrder, findJobByNumber, nextJobNumber, planJobOrders, validateBatchNumber, validateCustomer } from "../src/lib/services/jobOrders";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { capabilitiesForDemoRole } from "../src/lib/auth/capabilities";
import { createBatchLines } from "../src/lib/services/planChanges";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
// A newly received PO with no job orders yet: 600,000 folic acid tablets.
const order = state.data.orders.find((item) => item.poNumber === "PO-2610-142")!;
const today = new Date(2026, 9, 7, 10);

describe("job orders", () => {
  it("splits a PO item by the allowable batch quantity, scaling the batch size for a part batch", () => {
    const plan = planJobOrders(order, state.data.jobOrders, 250000, 62.5);
    expect(plan).toEqual({ remaining: 0, jobs: [{ quantity: 250000, batchSizeKg: 62.5 }, { quantity: 250000, batchSizeKg: 62.5 }, { quantity: 100000, batchSizeKg: 25 }] });
    expect(planJobOrders(order, state.data.jobOrders, 0)).toEqual({ error: "Enter the allowable batch quantity." });
  });
  it("numbers job orders by month and continues after the ones released already", () => {
    const plan = planJobOrders(order, state.data.jobOrders, 300000);
    if ("error" in plan) throw new Error(plan.error);
    let id = 0;
    const jobs = buildJobOrders(order, state.data.jobOrders, plan.jobs, { today, userName: "Aida", newId: () => `job-${++id}` });
    expect(jobs.map((job) => [job.number, job.sequence, job.quantity])).toEqual([["JO-2610-001", 1, 300000], ["JO-2610-002", 2, 300000]]);
    expect(nextJobNumber(jobs, today)).toBe("JO-2610-003");
    expect(planJobOrders(order, [...state.data.jobOrders, ...jobs], 300000)).toEqual({ error: "All 600,000 tablets of this PO item are already in job orders." });
  });
  it("plans a job order's route as activities linked to it, which the workspace accepts", () => {
    const plan = planJobOrders(order, state.data.jobOrders, 300000);
    if ("error" in plan) throw new Error(plan.error);
    const [job] = buildJobOrders(order, state.data.jobOrders, plan.jobs, { today, userName: "Aida", newId: () => "job-new" });
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
    const typed = createManualJobOrder({ number: " JO/BT/0457 ", orderId: order.id, quantity: 250000, uom: "tablets" }, state.data.orders, state.data.jobOrders, state.products, context);
    expect(typed).toMatchObject({ id: "job-typed", number: "JO/BT/0457", orderId: order.id, sequence: 1, quantity: 250000 });
    const jobs = [...state.data.jobOrders, typed as never];
    expect(findJobByNumber("jo/bt/0457", jobs)?.id).toBe("job-typed");
    expect(createManualJobOrder({ number: "jo/bt/0457", orderId: order.id, quantity: 1, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "Job order jo/bt/0457 already exists." });
    expect(createManualJobOrder({ number: "JO-X", orderId: "missing", quantity: 1, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "Choose the PO item job order JO-X belongs to." });
    // Folic acid's allowable batch is 300,000 tablets.
    expect(createManualJobOrder({ number: "JO-Y", orderId: order.id, quantity: 300001, uom: "tablets" }, state.data.orders, jobs, state.products, context)).toEqual({ error: "One job order holds at most the allowable batch quantity of 300,000 tablets." });
  });
});
