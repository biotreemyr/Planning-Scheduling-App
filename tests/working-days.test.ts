import { describe, expect, it } from "vitest";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { capabilitiesFromPermissions } from "../src/lib/auth/capabilities";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";
import { describeChanges } from "../src/lib/services/history";
import { addSampleData } from "../src/lib/domain/sampleData";
import { dayStatus, nextWorkingDay, spanDays, workingCalendar, type SpecialDay } from "../src/lib/services/workingDays";
import { reflow, type PlanRow } from "../src/components/JobPlanDialog";

// Week of Mon 19 Oct 2026: Fri 23, Sat 24, Sun 25, Mon 26. Say Mon 26 is a public holiday.
const holidays = [{ date: "2026-10-26", name: "Test holiday" }];
const special = (date: string, kind: SpecialDay["kind"]): SpecialDay => ({ id: `day-${date}`, unitId: "u", date, kind, reason: "Overtime for PO1", addedBy: "Aida", addedAt: "2026-10-21T08:00:00.000Z" });
const unit = { id: "u", name: "BTP" };

describe("a unit's working days", () => {
  it("skips Saturday, Sunday and public holidays unless a day is opened", () => {
    const work = workingCalendar(unit, [], holidays);
    expect(nextWorkingDay(work, "2026-10-23")).toBe("2026-10-27");
    expect(dayStatus(work, "2026-10-25")).toMatchObject({ working: false, label: "Off" });
    expect(dayStatus(work, "2026-10-26")).toMatchObject({ working: false, kind: "holiday", label: "Test holiday" });
    const overtime = workingCalendar(unit, [special("2026-10-24", "working")], holidays);
    expect(nextWorkingDay(overtime, "2026-10-23")).toBe("2026-10-24");
    expect(dayStatus(overtime, "2026-10-24")).toMatchObject({ working: true, kind: "overtime" });
  });
  it("closes a working day and counts the working days of a span", () => {
    const work = workingCalendar(unit, [special("2026-10-22", "closed")], holidays);
    expect(nextWorkingDay(work, "2026-10-21")).toBe("2026-10-23");
    const span = spanDays(work, "2026-10-21", "2026-10-27");
    expect(span.working).toBe(3);
    expect(span.off.map((day) => day.date)).toEqual(["2026-10-22", "2026-10-24", "2026-10-25", "2026-10-26"]);
  });
  it("follows the weekdays Admin ticks, and other units' special days don't count", () => {
    const sixDays = workingCalendar({ ...unit, workingDays: [1, 2, 3, 4, 5, 6] }, [{ ...special("2026-10-25", "working"), unitId: "other" }]);
    expect(nextWorkingDay(sixDays, "2026-10-23")).toBe("2026-10-24");
    expect(nextWorkingDay(sixDays, "2026-10-24")).toBe("2026-10-26");
  });
});

describe("planning a job order over off days", () => {
  const row = (label: string, date: string, extra: Partial<PlanRow> = {}): PlanRow => ({ key: label, label, calendarId: label, date, quantity: "1", uom: "kg", on: true, machineIds: [], ...extra });
  it("starts the next process on the working day after the weekend and the holiday", () => {
    const work = workingCalendar(unit, [], holidays);
    const rows = reflow([row("Dispensing", "2026-10-23"), row("Blending", "")], 0, "2026-10-23", work);
    expect(rows[1].date).toBe("2026-10-27");
  });
  it("moves a plan opened on a Sunday to Monday, or keeps Sunday once it is opened", () => {
    expect(reflow([row("Dispensing", "")], 0, "2026-10-25", workingCalendar(unit))[0].date).toBe("2026-10-26");
    expect(reflow([row("Dispensing", "")], 0, "2026-10-25", workingCalendar(unit, [special("2026-10-25", "working")]))[0].date).toBe("2026-10-25");
  });
});

describe("saving off days", () => {
  const role = (...keys: string[]) => capabilitiesFromPermissions(keys.map((key) => `scheduler.${key}`));
  const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
  const unitId = base.directory.units[0].id;
  const withDay = parseWorkspace({ ...base, data: { ...base.data, specialDays: [{ ...special("2026-10-25", "working"), unitId }] } });
  it("lets planners and managers (planning edit) open a day, not production", () => {
    expect(reviewWorkspaceChange(base, withDay, role("planning.view", "planning.edit")).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, withDay, role("planning.view", "schedule.edit")).denied).toEqual(["open or close days"]);
  });
  it("keeps one special day per unit and day", () => {
    expect(() => parseWorkspace({ ...withDay, data: { ...withDay.data, specialDays: [...withDay.data.specialDays, { ...special("2026-10-25", "closed"), id: "again", unitId }] } })).toThrow();
  });
  it("records the day, what it became and why in the audit trail", () => {
    expect(describeChanges(base, withDay).map((change) => change.text)).toContainEqual(expect.stringMatching(/25\/10\/2026 opened as a working day: Overtime for PO1/));
  });
});
