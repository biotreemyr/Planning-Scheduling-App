import { describe, expect, it } from "vitest";
import { reflow, type PlanRow } from "../src/components/JobPlanDialog";

const row = (label: string, date: string, on = true, extra: Partial<PlanRow> = {}): PlanRow => ({ key: label, label, calendarId: label, date, quantity: "1", uom: "kg", on, machineIds: [], ...extra });
// Friday 9 Oct 2026 onwards: Mon 12, Tue 13, Wed 14...
const route = () => [row("Dispensing", "2026-10-09"), row("Blending", "2026-10-12"), row("Granulation", "2026-10-13"), row("Compression", "2026-10-14"), row("Packing", "2026-10-15")];
const dates = (rows: PlanRow[]) => rows.map((item) => `${item.label} ${item.date || "-"}`);
const pick = (rows: PlanRow[], index: number, date: string) => reflow(rows.map((item, position) => position === index ? { ...item, date } : item), index);

describe("planning dates when processes are unticked", () => {
  it("gives an unticked process no date; the later ones keep theirs", () => {
    const rows = route();
    rows[2] = { ...rows[2], on: false };
    expect(dates(reflow(rows, 2))).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-12", "Granulation -", "Compression 2026-10-14", "Packing 2026-10-15"]);
  });
  it("gives a re-ticked process the next working day, skipping weekends", () => {
    const rows = reflow(route().map((item, index) => index === 1 ? { ...item, on: false } : item), 1);
    expect(dates(rows)).toEqual(["Dispensing 2026-10-09", "Blending -", "Granulation 2026-10-13", "Compression 2026-10-14", "Packing 2026-10-15"]);
    const again = reflow(rows.map((item, index) => index === 1 ? { ...item, on: true } : item), 1);
    expect(dates(again)).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-12", "Granulation 2026-10-13", "Compression 2026-10-14", "Packing 2026-10-15"]);
  });
  it("starts with nothing ticked; ticking the front part dates it from the plan's day and leaves the rest off", () => {
    const start = "2026-10-09";
    let rows = reflow(route().map((item) => ({ ...item, on: false })), 0, start);
    expect(dates(rows)).toEqual(["Dispensing -", "Blending -", "Granulation -", "Compression -", "Packing -"]);
    rows = reflow(rows.map((item, index) => index === 0 ? { ...item, on: true } : item), 0, start);
    rows = reflow(rows.map((item, index) => index === 1 ? { ...item, on: true } : item), 1, start);
    expect(dates(rows)).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-12", "Granulation -", "Compression -", "Packing -"]);
  });
});

describe("changing a date moves later processes only when they would come before it", () => {
  it("puts two processes on the same day without moving the rest", () => {
    expect(dates(pick(route(), 1, "2026-10-09"))).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-09", "Granulation 2026-10-13", "Compression 2026-10-14", "Packing 2026-10-15"]);
  });
  it("pushes the later processes that would now come before it, one working day apart", () => {
    // Blending to Wed 14: Granulation (Tue 13) moves to Thu 15, Compression (Wed 14) to Fri 16, Packing (Thu 15) to Mon 19.
    expect(dates(pick(route(), 1, "2026-10-14"))).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-14", "Granulation 2026-10-15", "Compression 2026-10-16", "Packing 2026-10-19"]);
  });
  it("keeps a same-day pair set further down when an earlier date changes", () => {
    let rows = pick(route(), 4, "2026-10-14"); // Packing with Compression on Wed 14
    expect(dates(rows).slice(3)).toEqual(["Compression 2026-10-14", "Packing 2026-10-14"]);
    rows = pick(rows, 1, "2026-10-09"); // then Blending with Dispensing
    expect(dates(rows)).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-09", "Granulation 2026-10-13", "Compression 2026-10-14", "Packing 2026-10-14"]);
  });
  it("keeps a date picked on the row and pushes what falls before it; completed rows stay put", () => {
    expect(dates(pick(route(), 1, "2026-10-20")).slice(1)).toEqual(["Blending 2026-10-20", "Granulation 2026-10-21", "Compression 2026-10-22", "Packing 2026-10-23"]);
    const locked = route().map((item, index) => index === 3 ? { ...item, locked: true, date: "2026-10-01" } : item);
    expect(reflow(locked, 0)[3].date).toBe("2026-10-01");
  });
});

describe("processes over several days", () => {
  it("starts the next process on the working day after the last day", () => {
    const rows = route().map((item, index) => index === 0 ? { ...item, multiDay: true, endDate: "2026-10-13" } : item);
    expect(dates(reflow(rows, 0))).toEqual(["Dispensing 2026-10-09", "Blending 2026-10-14", "Granulation 2026-10-15", "Compression 2026-10-16", "Packing 2026-10-19"]);
  });
  it("keeps its length when it is moved", () => {
    const rows = route().map((item, index) => index === 1 ? { ...item, multiDay: true, endDate: "2026-10-14" } : item);
    // Blending (Mon 12 to Wed 14) moved to Tue 13 runs to Thu 15; granulation follows on Fri 16.
    const later = reflow(rows.map((item, index) => index === 1 ? { ...item, date: "2026-10-13", endDate: "2026-10-15" } : item), 1);
    expect(later[2].date).toBe("2026-10-16");
    // Pushed by dispensing over several days, blending keeps its three days.
    const pushed = reflow(later.map((item, index) => index === 0 ? { ...item, multiDay: true, endDate: "2026-10-14" } : item), 0);
    expect(`${pushed[1].date} ${pushed[1].endDate}`).toBe("2026-10-15 2026-10-17");
  });
  it("counts one day when the box is unticked", () => {
    const rows = route().map((item, index) => index === 0 ? { ...item, multiDay: false, endDate: "" } : item);
    expect(reflow(rows, 0)[1].date).toBe("2026-10-12");
  });
});
