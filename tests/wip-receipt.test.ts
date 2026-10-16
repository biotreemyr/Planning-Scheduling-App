import { describe, expect, it } from "vitest";
import type { PlanLine } from "../src/lib/domain/types";
import { awaitingReceipt, type WipTransfer } from "../src/lib/services/productionFlow";

const line = (id: string, calendarId: string, extra: Partial<PlanLine> = {}): PlanLine => ({ id, planId: "plan", calendarId, productId: "p", quantity: 1, plannedDate: "2026-09-28", priority: "Normal", status: "Unscheduled", jobOrderId: "jo-2", productionOrderId: "po", ...extra });
const blending = line("blend", "c-blend", { completedAt: "2026-09-28T10:00:00.000Z" });
const capsulation = line("caps", "c-caps");
const handover: WipTransfer = { id: "wip-1", sourceLineId: "blend", sourceCalendarId: "c-blend", calendarId: "c-caps", productId: "p", quantity: 43.5, uom: "kg", notes: "", createdAt: "2026-09-28T10:00:00.000Z", createdBy: "Kumar" };

describe("a handover into the next process", () => {
  it("must be received before that process starts", () => {
    expect(awaitingReceipt(capsulation, [blending, capsulation], [handover])).toEqual([handover]);
    expect(awaitingReceipt(capsulation, [blending, capsulation], [{ ...handover, receivedAt: "2026-09-28T11:00:00.000Z", receivedBy: "Siti" }])).toEqual([]);
  });
  it("concerns only the same job order's activities in that process", () => {
    expect(awaitingReceipt({ ...capsulation, jobOrderId: "jo-3" }, [blending, capsulation], [handover])).toEqual([]);
    expect(awaitingReceipt(line("other", "c-coat"), [blending], [handover])).toEqual([]);
  });
});
