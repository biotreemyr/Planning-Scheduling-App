import { describe, expect, it } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { stampWho } from "../src/lib/persistence/stampWho";

const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;

describe("who changed a record", () => {
  it("is the signed-in person, whatever name the browser typed", () => {
    const next = structuredClone(base);
    Object.assign(next.data.jobOrders[0], { testedAt: "2026-10-08T10:00:00.000Z", testedBy: "Head of QC", testResult: "Passed" });
    next.data.orders.push({ ...structuredClone(base.data.orders[0]), id: "new-order", createdBy: "Someone else" });
    const stamped = stampWho(base, next, "Aida");
    expect(stamped.data.jobOrders[0].testedBy).toBe("Aida");
    expect(stamped.data.orders.at(-1)!.createdBy).toBe("Aida");
  });
  it("keeps names a save leaves as they were", () => {
    const next = structuredClone(base);
    next.data.jobOrders[0].notes = "Checked";
    const stamped = stampWho(base, next, "Aida");
    expect(stamped.data.jobOrders[0].createdBy).toBe(base.data.jobOrders[0].createdBy);
    expect(stamped.data.actuals).toEqual(base.data.actuals);
    expect(stampWho(base, structuredClone(base), "Aida")).toEqual(base);
  });
});
