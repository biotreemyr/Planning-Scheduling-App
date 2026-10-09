import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { moveActivity, resizeActivity } from "../src/lib/services/planChanges";
import { lineDays, lineEnd } from "../src/lib/services/scheduling";
import { checkProcessFlow } from "../src/lib/services/processRules";
import { orderBatchMatrix } from "../src/lib/services/orders";

const state = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const open = state.data.lines.find((line) => !line.completedAt && line.activityType === "Coating" && state.data.entries.some((entry) => entry.planLineId === line.id && entry.status !== "Completed" && entry.status !== "Cancelled"))!;
const shift = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; };

describe("activities over several days", () => {
  it("stretches an activity to a later day, with its machine booking", () => {
    const end = shift(open.plannedDate, 2);
    const result = resizeActivity(state.data.lines, state.data.entries, open.id, end, "Aida");
    if ("error" in result) throw new Error(result.error);
    const line = result.lines.find((item) => item.id === open.id)!;
    expect([line.endDate, lineEnd(line), lineDays(line)]).toEqual([end, end, 3]);
    const booking = result.entries.find((entry) => entry.id === result.changedEntryIds[0])!;
    expect(booking.endAt.slice(0, 10)).toBe(end);
    // Shortening back to one day drops the end date; the workspace accepts both.
    const back = resizeActivity(result.lines, result.entries, open.id, open.plannedDate, "Aida");
    if ("error" in back) throw new Error(back.error);
    expect(back.lines.find((item) => item.id === open.id)!.endDate).toBeUndefined();
    expect(() => parseWorkspace({ ...state, data: { ...state.data, lines: result.lines, entries: result.entries } })).not.toThrow();
    expect(resizeActivity(state.data.lines, state.data.entries, open.id, shift(open.plannedDate, -1), "Aida")).toEqual({ error: "An activity cannot end before the day it starts." });
  });
  it("keeps its length when moved", () => {
    const stretched = resizeActivity(state.data.lines, state.data.entries, open.id, shift(open.plannedDate, 2), "Aida") as { lines: typeof state.data.lines; entries: typeof state.data.entries };
    const moved = moveActivity(stretched.lines, stretched.entries, open.id, shift(open.plannedDate, 7), "Aida");
    if ("error" in moved) throw new Error(moved.error);
    const line = moved.lines.find((item) => item.id === open.id)!;
    expect([line.plannedDate, line.endDate]).toEqual([shift(open.plannedDate, 7), shift(open.plannedDate, 9)]);
  });
  it("counts every planned day in the order grid and warns when the next process starts before it ends", () => {
    const order = state.data.orders.find((item) => item.id === open.productionOrderId)!;
    const end = shift(open.plannedDate, 30);
    const stretched = resizeActivity(state.data.lines, state.data.entries, open.id, end, "Aida") as { lines: typeof state.data.lines; entries: typeof state.data.entries };
    const coating = orderBatchMatrix(order, stretched.lines, state.directory, "2026-10-07").rows.find((row) => row.processName === "Coating")!;
    const cell = Object.values(coating.cells).find((item) => item.lastDate === end)!;
    expect(cell.days).toBeGreaterThanOrEqual(31);
    const warnings = checkProcessFlow(stretched.lines, stretched.entries, state.data.orders, state.products, state.directory);
    expect(warnings.some((warning) => warning.kind === "sequence" && warning.message.includes("before Coating finishes"))).toBe(true);
  });
});
