import { describe, expect, it } from "vitest";
import { emptyDirectory } from "../src/lib/domain/emptyWorkspace";
import type { CalendarDirectory } from "../src/lib/domain/calendarAccess";
import type { PlanLine } from "../src/lib/domain/types";
import type { JobOrder } from "../src/lib/services/jobOrders";
import type { PurchaseOrder } from "../src/lib/services/orders";
import { batchYield, formatYield, stepYieldWith, yieldTone } from "../src/lib/services/yields";

// A capsule batch: dispensing and blending in kg, capsulation in capsules, blisters of 10, boxes of 180.
const settings = (planned: "batchSize" | "batchQuantity" | "packQuantity" | "boxes") => ({ forms: ["Capsule" as const], optional: false, planned, report: "count" as const });
const steps = [["dispensing", "Dispensing", "batchSize"], ["blending", "Blending", "batchSize"], ["capsulation", "Capsulation", "batchQuantity"], ["filling", "Filling", "packQuantity"], ["packing", "Packing", "boxes"]] as const;
const directory: CalendarDirectory = { ...emptyDirectory(), units: [{ id: "u", name: "BTP" }],
  processes: steps.map(([id, name, planned]) => ({ id: `p-${id}`, name, settings: settings(planned) })),
  calendars: steps.map(([id, name]) => ({ id: `c-${id}`, unitId: "u", processId: `p-${id}`, name })) };
const order: PurchaseOrder = { id: "po", poNumber: "PWL005114", productId: "fg", quantity: 2000, uom: "boxes", unitWeightMg: 720, unitsPerPack: 180, format: "Capsule", expectedDates: {}, createdAt: "2026-10-01T00:00:00.000Z", createdBy: "Planner" };
const job: JobOrder = { id: "jo", number: "JO-00002", orderId: "po", sequence: 1, quantity: 60417, uom: "capsules", batchSizeKg: 43.5, packQuantity: 6041, packUom: "blisters", packSize: 10, boxQuantity: 335, createdAt: "2026-10-01T00:00:00.000Z", createdBy: "Planner" };
const done = (id: string, quantity: number, uom: string, actual: number): PlanLine => ({ id, planId: "plan", calendarId: `c-${id}`, productId: "fg", quantity, uom, plannedDate: "2026-10-20", priority: "Normal", status: "Unscheduled",
  jobOrderId: "jo", productionOrderId: "po", completedAt: "2026-10-20T09:00:00.000Z", yieldQuantity: actual });
const lines = [done("dispensing", 43.5, "kg", 43.3), done("blending", 43.5, "kg", 43.0), done("capsulation", 60417, "capsules", 59200), done("filling", 6041, "blisters", 5900), done("packing", 335, "boxes", 327)];

describe("step yield", () => {
  it("compares each stage with what the stage before it handed over, in its own unit", () => {
    const result = batchYield(job, "po", lines, [order], directory);
    expect(result.stages.map((stage) => [stage.processName, formatYield(stage.percent)])).toEqual([
      ["Dispensing", "99.5%"], // 43.3 ÷ 43.5 kg planned
      ["Blending", "99.3%"], // 43.0 ÷ 43.3 kg
      ["Capsulation", "99.1%"], // 59,200 ÷ (43.0 kg × 1,000,000 ÷ 720 mg = 59,722)
      ["Filling", "99.7%"], // 5,900 ÷ (59,200 ÷ 10 = 5,920)
      ["Packing", "99.8%"] // 327 ÷ (5,900 × 10 ÷ 180 = 327.8)
    ]);
    expect(result.stages[2].working).toBe("59,200 ÷ (43 kg from Blending = 59,722.2 capsules)");
    // Final: 327 boxes × 180 = 58,860 capsules ÷ 60,417.
    expect(result.final).toMatchObject({ percent: 97.4, working: "58,860 capsules ÷ 60,417 planned" });
    expect(result.missing).toEqual([]);
  });

  it("gives each stage's % of theoretical against the batch formula, the last one equal to the final yield", () => {
    const result = batchYield(job, "po", lines, [order], directory);
    expect(result.stages.map((stage) => [stage.processName, formatYield(stage.ofTheoretical)])).toEqual([
      ["Dispensing", "99.5%"], // 43.3 ÷ 43.5 kg batch size
      ["Blending", "98.9%"], // 43.0 ÷ 43.5 kg
      ["Capsulation", "98.0%"], // 59,200 ÷ 60,417 capsules
      ["Filling", "97.7%"], // 5,900 ÷ 6,041.7 blisters
      ["Packing", "97.4%"] // 327 ÷ 335.65 boxes, the same as the final yield
    ]);
    expect(result.stages[2].theoreticalWorking).toBe("59,200 ÷ 60,417 capsules theoretical");
  });

  it("compares weighed capsules by powder when the empty shell weight is given", () => {
    // 59,200 filled capsules weighed at 850 mg each = 50.32 kg; less 59,200 shells of 127 mg = 42.8016 kg powder.
    const weighed = lines.map((line) => line.id === "capsulation" ? { ...line, weighedQuantity: 50.32, weighedUom: "kg", actualUnitWeightMg: 850, shellWeightMg: 127 } : line);
    const stage = batchYield(job, "po", weighed, [order], directory).stages[2];
    expect(stage).toMatchObject({ percent: 99.5, ofTheoretical: 98, powder: { fillMg: 723, targetMg: 720 } });
    expect(stage.working).toBe("42.802 kg powder in capsules (weighed less 59,200 empty shells) ÷ 43 kg from Blending");
    // Without the shell weight it compares by count.
    expect(batchYield(job, "po", lines, [order], directory).stages[2].percent).toBe(99.1);
  });

  it("waits until every day of a stage is completed, and the next stage waits for it", () => {
    const open = lines.map((line) => line.id === "blending" ? { ...line, completedAt: undefined, yieldQuantity: undefined } : line);
    const result = batchYield(job, "po", open, [order], directory);
    expect(result.stages.map((stage) => stage.percent)).toEqual([99.5, undefined, undefined, 99.7, 99.8]);
    expect(result.final).toBeUndefined();
  });

  it("tells the planner which figure is missing", () => {
    const result = batchYield(job, "po", lines, [{ ...order, unitWeightMg: undefined }], directory);
    expect(result.stages[2].percent).toBeUndefined();
    expect(result.stages[2].missing).toBe("add the unit weight (mg) on PO PWL005114");
    expect(result.missing).toEqual(["add the unit weight (mg) on PO PWL005114"]);
    expect(result.final?.percent).toBe(97.4);
  });

  it("colours results against QA's limits: within, near a limit, outside", () => {
    expect([yieldTone(99.1, { min: 97, max: 101 }), yieldTone(97.5, { min: 97, max: 101 }), yieldTone(95.2, { min: 97, max: 101 }), yieldTone(99, undefined)]).toEqual(["ok", "near", "out", "none"]);
    // A narrow range keeps a green middle: amber only within a quarter of it from each limit.
    expect([yieldTone(99.7, { min: 99.5, max: 101 }), yieldTone(100.2, { min: 99.5, max: 101 })]).toEqual(["near", "ok"]);
    const limits = { byProcess: { "p-capsulation": { min: 99.5, max: 101 } }, final: { min: 98 } };
    const result = batchYield(job, "po", lines, [order], directory, limits);
    expect([result.stages[2].tone, result.final?.tone]).toEqual(["out", "out"]);
    // What production is about to save, checked before it is saved.
    // QA's limits apply to % of theoretical: 60,417 of 60,417 is 100.0%, though the step is 101.2%.
    expect(stepYieldWith(job, "po", lines, [order], directory, "capsulation", 60417, limits)).toMatchObject({ ofTheoretical: 100, percent: 101.2, tone: "ok" });
  });
});

describe("warning the planner", () => {
  it("as soon as a batch is planned, says which figure the yield needs", async () => {
    const { yieldWarnings } = await import("../src/lib/services/yields");
    const planned = lines.map(({ completedAt: _c, yieldQuantity: _y, ...line }) => line);
    expect(yieldWarnings([job], planned, [order], directory)).toEqual([]);
    expect(yieldWarnings([job], planned, [{ ...order, unitWeightMg: undefined, unitsPerPack: undefined }], directory).map((warning) => warning.message))
      .toEqual(["Yield for JO-00002 can't be worked out: add the unit weight (mg) on PO PWL005114; add the units per box on PO PWL005114."]);
  });
});
