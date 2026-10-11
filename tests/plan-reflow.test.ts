import { describe, expect, it } from "vitest";
import { reflow, type PlanRow } from "../src/components/JobPlanDialog";

const row = (label: string, date: string, on = true, extra: Partial<PlanRow> = {}): PlanRow => ({ key: label, label, calendarId: label, date, quantity: "1", uom: "kg", on, machineId: "", ...extra });
// Friday 9 Oct 2026 onwards: Mon 12, Tue 13, Wed 14...
const route = () => [row("Dispensing", "2026-10-09"), row("Blending", "2026-10-12"), row("Granulation", "2026-10-13"), row("Compression", "2026-10-14"), row("Packing", "2026-10-15")];
const dates = (rows: PlanRow[]) => rows.map((item) => `${item.label} ${item.date || "-"}`);

describe("planning dates when processes are unticked", () => {
  it("gives an unticked process no date, and the next ticked one its working day", () => {
    const rows = route();
    rows[2] = { ...rows[2], on: false };
    expect(dates(reflow(rows, 2))).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-12", "Granulation -", "Compression 2026-10-13", "Packing 2026-10-14"]);
  });
  it("gives a re-ticked process the next working day again, and skips weekends", () => {
    const rows = reflow(route().map((item, index) => index === 1 ? { ...item, on: false } : item), 1);
    expect(dates(rows)).toEqual(["Dispensing 2026-10-09", "Blending -", "Granulation 2026-10-12", "Compression 2026-10-13", "Packing 2026-10-14"]);
    const again = reflow(rows.map((item, index) => index === 1 ? { ...item, on: true } : item), 1);
    expect(dates(again)).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-12", "Granulation 2026-10-13", "Compression 2026-10-14", "Packing 2026-10-15"]);
  });
  it("keeps a date picked on the row and follows on from it; completed rows stay put", () => {
    const rows = route().map((item, index) => index === 1 ? { ...item, date: "2026-10-20" } : item);
    expect(dates(reflow(rows, 1)).slice(1)).toEqual(["Blending 2026-10-20", "Granulation 2026-10-21", "Compression 2026-10-22", "Packing 2026-10-23"]);
    const locked = route().map((item, index) => index === 3 ? { ...item, locked: true, date: "2026-10-01" } : item);
    expect(reflow(locked, 0)[3].date).toBe("2026-10-01");
  });
});
