import { describe, expect, it } from "vitest";
import type { Machine, PlanLine, ScheduleEntry } from "../src/lib/domain/types";
import { bookActivityMachines, bookedMachineIds, machineLabel, withMasterEquipment } from "../src/lib/services/machines";

const calendars = [{ id: "cal-filling", unitId: "btp", processId: "filling", name: "Filling" }];
const machine = (id: string, code: string, name: string, extra: Partial<Machine> = {}): Machine =>
  ({ id, code, name, unitId: "btp", processIds: ["filling"], setupMinutes: 0, workCentreId: "wc-fill", active: "Active", ...extra });
const bottleLine = [machine("com", "COM/01", "Counting Machine"), machine("cam", "CAM/01", "Capping Machine"), machine("ism", "ISM/01", "Induction Sealing Machine with Water Cooling"), machine("lmh", "LMH/02", "Around Labelling Machine (SMD) with Hologram Applicator")];
const blister = machine("bpm", "BPM/01", "Automatic High Speed Blister Machine");
const machines = [...bottleLine, blister, machine("old", "SMP-BF1", "Bottle Filling Line 1", { active: "Inactive" })];
const line: PlanLine = { id: "line-1", planId: "plan", calendarId: "cal-filling", productId: "p", quantity: 6041, uom: "bottles", plannedDate: "2026-10-20", priority: "Normal", status: "Unscheduled" };
let next = 0;
const context = { calendars, machines, products: [], who: "Planner", newId: () => `sched-${++next}` };
const book = (entries: ScheduleEntry[], ids: string[]) => bookActivityMachines(entries, line, ids, context);
const ok = (result: ReturnType<typeof book>) => { if ("error" in result) throw new Error(result.error); return result.entries; };

describe("machines", () => {
  it("show as Equipment ID and name", () => {
    expect(machineLabel(blister)).toBe("BPM/01 · Automatic High Speed Blister Machine");
  });

  it("book all four bottle-line machines on one activity, each a draft for the planned day", () => {
    const entries = ok(book([], bottleLine.map((item) => item.id)));
    expect(bookedMachineIds(entries, line.id)).toEqual(["com", "cam", "ism", "lmh"]);
    expect(entries.every((entry) => entry.status === "Draft" && entry.startAt === "2026-10-20T08:00" && entry.endAt === "2026-10-20T17:00")).toBe(true);
  });

  it("keep bookings already made, swap one machine for another in its booking, and let go of the rest", () => {
    const four = ok(book([], bottleLine.map((item) => item.id))).map((entry, index) => index === 0 ? { ...entry, startAt: "2026-10-20T09:00" } : entry);
    const swapped = ok(book(four, ["bpm", "cam", "ism", "lmh"]));
    expect(swapped).toHaveLength(4);
    expect(swapped.find((entry) => entry.machineId === "bpm")).toMatchObject({ id: four[0].id, startAt: "2026-10-20T09:00" });
    expect(bookedMachineIds(ok(book(four, ["com"])), line.id)).toEqual(["com"]);
    expect(ok(book(four, []))).toEqual([]);
  });

  it("never let go of a confirmed booking without a machine to take it over", () => {
    const confirmed = ok(book([], ["com", "cam"])).map((entry) => ({ ...entry, status: "Confirmed" as const }));
    expect(book(confirmed, ["com"])).toEqual({ error: "Confirmed bookings keep their machine. Choose another machine instead." });
    expect(bookedMachineIds(ok(book(confirmed, ["com", "bpm"])), line.id)).toEqual(["com", "bpm"]);
  });

  it("refuse an inactive machine, unless it is already booked", () => {
    expect(book([], ["old"])).toEqual({ error: "Select active machines set up for this process." });
    const existing: ScheduleEntry = { id: "e-old", calendarId: "cal-filling", planLineId: line.id, productId: "p", workCentreId: "wc-fill", machineId: "old", startAt: "2026-10-20T08:00", endAt: "2026-10-20T17:00", status: "Draft" };
    expect(bookedMachineIds(ok(book([existing], ["old", "com"])), line.id)).toEqual(["old", "com"]);
  });

  it("refuse a machine already confirmed for another batch that day", () => {
    const other: ScheduleEntry = { id: "e-other", calendarId: "cal-filling", planLineId: "line-2", productId: "p2", workCentreId: "wc-fill", machineId: "cam", startAt: "2026-10-20T08:00", endAt: "2026-10-20T17:00", status: "Confirmed" };
    const mine = ok(book([other], ["com"])).map((entry) => ({ ...entry, status: entry.id === other.id ? entry.status : "Confirmed" as const }));
    expect(book(mine, ["com", "cam"])).toEqual({ error: "CAM/01 · Capping Machine is already booked that day." });
  });

  it("show Master Data's current ID, name and active state, and keep the saved copy when it can't be read", () => {
    const linked = machine("m1", "CFM/02", "Automatic Capsule Filling Machine", { masterDataId: "4f0c5c0e-0000-4000-8000-000000000002" });
    const catalog = { status: "ok" as const, equipment: [{ id: "4f0c5c0e-0000-4000-8000-000000000002", code: "CFM/02", name: "Automatic Capsule Filling Machine (NJP-1250H)", processType: "Capsule Filling", active: false }] };
    expect(withMasterEquipment([linked], catalog)[0]).toMatchObject({ name: "Automatic Capsule Filling Machine (NJP-1250H)", active: "Inactive" });
    expect(withMasterEquipment([linked], { status: "unavailable" })[0]).toBe(linked);
  });
});
