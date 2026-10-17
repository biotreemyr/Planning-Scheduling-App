import { describe, expect, it } from "vitest";
import { emptyDirectory } from "../src/lib/domain/emptyWorkspace";
import type { CalendarDirectory } from "../src/lib/domain/calendarAccess";
import type { PlanLine } from "../src/lib/domain/types";
import type { PurchaseOrder } from "../src/lib/services/orders";
import { checkProcessFlow } from "../src/lib/services/processRules";

// BTP's capsule route in Admin order: Dispensing → Blending (required) → (Granulation) → Capsulation.
const blend = { forms: ["Capsule" as const], optional: false, planned: "batchSize" as const, report: "measure" as const };
const directory: CalendarDirectory = { ...emptyDirectory(), units: [{ id: "u", name: "BTP" }],
  processes: [{ id: "p-disp", name: "Dispensing" }, { id: "p-blend", name: "Blending", settings: blend }, { id: "p-gran", name: "Granulation" }, { id: "p-caps", name: "Capsulation" }],
  calendars: [{ id: "c-disp", unitId: "u", processId: "p-disp", name: "Dispensing" }, { id: "c-blend", unitId: "u", processId: "p-blend", name: "Blending" }, { id: "c-gran", unitId: "u", processId: "p-gran", name: "Granulation" }, { id: "c-caps", unitId: "u", processId: "p-caps", name: "Capsulation" }] };
const order: PurchaseOrder = { id: "po", poNumber: "PO-1", productId: "fg", quantity: 1000, uom: "capsules", format: "Capsule", expectedDates: {}, createdAt: "2026-10-01T00:00:00Z", createdBy: "Planner" };
const line = (calendarId: string, plannedDate: string): PlanLine => ({ id: calendarId, planId: "plan", calendarId, productId: "fg", quantity: 1, plannedDate, priority: "Normal", status: "Unscheduled", productionOrderId: "po", orderReference: "JO-1" });
const check = (lines: PlanLine[]) => checkProcessFlow(lines, [], [order], [], directory).filter((warning) => warning.kind !== "booking");

describe("blending before or after granulation", () => {
  it("is fine either side", () => {
    expect(check([line("c-disp", "2026-10-20"), line("c-blend", "2026-10-21"), line("c-gran", "2026-10-22"), line("c-caps", "2026-10-23")])).toEqual([]);
    expect(check([line("c-disp", "2026-10-20"), line("c-gran", "2026-10-21"), line("c-blend", "2026-10-22"), line("c-caps", "2026-10-23")])).toEqual([]);
  });
  it("is still required, and still comes before capsulation", () => {
    expect(check([line("c-disp", "2026-10-20"), line("c-gran", "2026-10-21"), line("c-caps", "2026-10-23")]).map((warning) => warning.kind)).toEqual(["missing"]);
    expect(check([line("c-disp", "2026-10-20"), line("c-gran", "2026-10-21"), line("c-blend", "2026-10-24"), line("c-caps", "2026-10-23")]).map((warning) => warning.kind)).toEqual(["sequence"]);
  });
});
