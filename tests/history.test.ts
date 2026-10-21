import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { buildHistory, describeChanges } from "../src/lib/services/history";

const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const order = base.data.orders.find((item) => item.poNumber === "PO-2610-142")!;

describe("transaction history", () => {
  it("describes a PO, its job order, batch number, planning and production as traceable changes", () => {
    const withJob = structuredClone(base);
    withJob.data.jobOrders.push({ id: "job-x", number: "JO0050", orderId: order.id, sequence: 1, quantity: 300000, uom: "tablets", batchSizeKg: 75, createdAt: "2026-10-07T00:00:00Z", createdBy: "Aida" });
    expect(describeChanges(base, withJob)).toEqual([{ kind: "Job order", po: "PO-2610-142", job: "JO0050", batch: undefined, product: "Folic Acid 400mcg Tablets", text: "Job order JO0050 added to PO PO-2610-142: 300,000 tablets, batch qty 75 kg" }]);

    const withBatch = structuredClone(withJob);
    withBatch.data.jobOrders.at(-1)!.batchNumber = "FA-050";
    const line = { ...base.data.lines.find((item) => item.productId === order.productId)!, id: "line-x", jobOrderId: "job-x", productionOrderId: order.id, orderReference: "JO0050", activityType: "Dispensing", plannedDate: "2026-10-19", quantity: 75, uom: "kg", completedAt: undefined, yieldQuantity: undefined };
    withBatch.data.lines.push(line);
    const planned = describeChanges(withJob, withBatch);
    expect(planned.map((change) => change.text)).toEqual(["Batch number for JO0050 set to FA-050", "Planned Dispensing · Folic Acid 400mcg Tablets on 19/10/2026: 75 kg"]);
    expect(planned[1]).toMatchObject({ kind: "Planning", po: "PO-2610-142", job: "JO0050", batch: "FA-050" });

    const done = structuredClone(withBatch);
    Object.assign(done.data.lines.at(-1)!, { plannedDate: "2026-10-20", startedAt: "2026-10-20", completedAt: "2026-10-20T09:00:00.000Z", yieldQuantity: 74.2 });
    expect(describeChanges(withBatch, done).map((change) => change.text)).toEqual([
      "Dispensing · Folic Acid 400mcg Tablets started on 20/10/2026",
      "Dispensing · Folic Acid 400mcg Tablets completed on 20/10/2026: 74.2 kg (planned 75 kg)",
      "Dispensing · Folic Acid 400mcg Tablets: moved 19/10/2026 → 20/10/2026"
    ]);
  });
  it("lists versions newest first with who and when, skipping saves that changed nothing", () => {
    const next = structuredClone(base);
    next.data.orders = next.data.orders.map((item) => item.id === order.id ? { ...item, quantity: 700000 } : item);
    const history = buildHistory([{ revision: 0, snapshot: base }, { revision: 1, snapshot: base }, { revision: 2, snapshot: next }],
      new Map([[2, { at: "2026-10-07T03:00:00.000Z", by: "Angeline Choo" }]]), new Map());
    expect(history).toEqual([{ revision: 2, at: "2026-10-07T03:00:00.000Z", by: "Angeline Choo", changes: [{ kind: "PO", po: "PO-2610-142", product: "Folic Acid 400mcg Tablets", text: "PO PO-2610-142 edited: quantity 600,000 → 700,000 tablets" }] }]);
  });
  it("keeps the SO number a planner keys in and records changes to it", () => {
    const keyed = structuredClone(base);
    keyed.data.orders = keyed.data.orders.map((item) => item.id === order.id ? { ...item, soNumber: " SO2610004 " } : item);
    const saved = parseWorkspace(keyed);
    expect(saved.data.orders.find((item) => item.id === order.id)?.soNumber).toBe("SO2610004");
    expect(() => parseWorkspace({ ...keyed, data: { ...keyed.data, orders: keyed.data.orders.map((item) => item.id === order.id ? { ...item, soNumber: "S".repeat(61) } : item) } })).toThrow();
    expect(describeChanges(base, saved).map((change) => change.text)).toEqual(["PO PO-2610-142 edited: SO number - → SO2610004"]);
  });
  it("reads versions saved before job orders and customers existed", () => {
    const old = JSON.parse(JSON.stringify(base));
    delete old.data.jobOrders; delete old.data.customers;
    expect(() => describeChanges(old, base)).not.toThrow();
  });
  it("records a corrected production update", () => {
    const line = base.data.lines.find((item) => item.completedAt && item.yieldQuantity)!;
    const fixed = structuredClone(base);
    const target = fixed.data.lines.find((item) => item.id === line.id)!;
    target.yieldQuantity = line.yieldQuantity! - 1;
    const texts = describeChanges(base, fixed).map((change) => change.text);
    expect(texts).toEqual([expect.stringContaining("production update corrected: actual")]);
  });
});


describe("shared batches in the transaction history", () => {
  it("describes sharing a batch, QA's formula confirmation, release to each PO and closing the PO", () => {
    const other = base.data.orders.find((item) => item.id !== order.id)!;
    const job = { id: "job-s", number: "JO0060", orderId: order.id, sequence: 1, quantity: 120000, uom: "tablets", createdAt: "2026-10-07T00:00:00Z", createdBy: "Aida" };
    const before = structuredClone(base); before.data.jobOrders.push(job);
    const shared = structuredClone(before); shared.data.jobOrders.at(-1)!.shares = [{ orderId: other.id, quantity: 60000 }];
    expect(describeChanges(before, shared).map((change) => change.text)).toEqual([`Batch JO0060 also made for PO ${other.poNumber}: 60,000 tablets`]);
    const confirmed = structuredClone(shared); Object.assign(confirmed.data.jobOrders.at(-1)!, { formulaConfirmedAt: "2026-10-16T00:00:00Z", formulaConfirmedBy: "QA" });
    expect(describeChanges(shared, confirmed).map((change) => change.text)).toEqual(["QA confirmed the POs sharing JO0060 are the same formula"]);
    const released = structuredClone(confirmed);
    released.data.jobOrders.at(-1)!.poReleases = [{ orderId: order.id, quantity: 2006, uom: "bottles", otherUses: [{ quantity: 2, note: "Retention sample" }], releasedAt: "2026-10-20T00:00:00Z", releasedBy: "QA" }];
    expect(describeChanges(confirmed, released).map((change) => change.text)).toEqual(["JO0060 released to PO PO-2610-142: 2,006 bottles; also 2 Retention sample"]);
    const closed = structuredClone(released);
    Object.assign(closed.data.orders.find((item) => item.id === order.id)!, { closedQuantity: 2006, closedUom: order.uom, closedAt: "2026-10-21T00:00:00Z", closedBy: "Planner", closeNote: "Customer took the extra 6" });
    expect(describeChanges(released, closed).map((change) => change.text)).toEqual([`PO PO-2610-142 closed at 2,006 ${order.uom} (ordered ${order.quantity.toLocaleString("en-GB")} ${order.uom}): Customer took the extra 6`]);
  });
});

describe("corrections in the audit trail", () => {
  it("records the reason for correcting completed production", () => {
    const line = base.data.lines.find((item) => item.completedAt && item.yieldQuantity)!;
    const fixed = structuredClone(base);
    Object.assign(fixed.data.lines.find((item) => item.id === line.id)!, { yieldQuantity: line.yieldQuantity! - 1, correctionReason: "Recount after reconciliation", correctedBy: "QC", correctedAt: "2026-10-21T08:00:00.000Z" });
    expect(describeChanges(base, fixed).map((change) => change.text)).toEqual([expect.stringContaining("production update corrected: actual") && expect.stringContaining("(reason: Recount after reconciliation)")]);
  });
});

describe("planning above the PO in the audit trail", () => {
  it("records the extra quantity and its reason", () => {
    const order = base.data.orders.find((item) => item.poNumber === "PO-2610-142")!;
    const next = structuredClone(base);
    Object.assign(next.data.orders.find((item) => item.id === order.id)!, { overPlanReason: "Retain samples", overPlannedTotal: order.quantity + 6000, overPlannedBy: "Aida", overPlannedAt: "2026-10-21T08:00:00.000Z" });
    expect(describeChanges(base, next).map((change) => change.text)).toEqual([`PO PO-2610-142 planned above the order: job orders 606,000 tablets, 6,000 (1.0%) more than the 600,000 ordered (reason: Retain samples)`]);
  });
});
