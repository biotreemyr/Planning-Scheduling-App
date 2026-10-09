import { describe, expect, it } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
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

