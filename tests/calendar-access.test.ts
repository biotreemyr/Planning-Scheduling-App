import { describe, expect, it } from "vitest";
import { initialDirectory as directory, canViewCalendar, accessibleCalendars, selectedUnitCalendars, scopeCalendarRecords } from "../src/lib/domain/calendarAccess";
const fermentation = directory.calendars[0];
const production = directory.calendars[1];
const lim = directory.people.find((person) => person.id === "lim")!;
const planner = directory.people.find((person) => person.id === "aida")!;

describe("unit and process calendar access", () => {
  it("uses direct process assignments without legacy teams widening access", () => {
    const direct = { ...lim, processIds: ["production"] };
    expect(canViewCalendar(direct, production, directory)).toBe(true);
    expect(canViewCalendar(direct, fermentation, directory)).toBe(false);
    expect(canViewCalendar({ ...direct, processIds: [] }, production, directory)).toBe(false);
    expect(canViewCalendar({ ...direct, unitIds: [] }, production, directory)).toBe(false);
  });
  it("limits All to authorised processes in the chosen unit", () => {
    expect(selectedUnitCalendars(lim, directory, "manufacturing", null).map((item) => item.id)).toEqual([fermentation.id]);
    expect(selectedUnitCalendars(planner, directory, "pilot", null)).toEqual([]);
  });
  it("supports no processes and multiple selected processes without widening access", () => {
    expect(selectedUnitCalendars(planner, directory, "manufacturing", [])).toEqual([]);
    expect(selectedUnitCalendars(planner, directory, "manufacturing", [fermentation.id, production.id]).map((item) => item.id)).toEqual([fermentation.id, production.id]);
    expect(selectedUnitCalendars(lim, directory, "manufacturing", [production.id])).toEqual([]);
  });
  it("requires unit membership even with explicit planner access", () => {
    expect(canViewCalendar({ ...planner, unitIds: [] }, fermentation, directory)).toBe(false);
    expect(canViewCalendar({ ...planner, calendarIds: [] }, fermentation, directory)).toBe(false);
    expect(canViewCalendar(planner, production, directory)).toBe(true);
  });
  it("restricts production staff to their process teams", () => {
    expect(canViewCalendar(lim, fermentation, directory)).toBe(true);
    expect(canViewCalendar(lim, production, directory)).toBe(false);
    expect(canViewCalendar({ ...lim, unitIds: [] }, fermentation, directory)).toBe(false);
  });
  it("keeps administrators within assigned units for calendar viewing", () => {
    expect(accessibleCalendars({ ...lim, role: "admin", unitIds: [] }, directory)).toEqual([]);
  });
  it("fails closed for unassigned records, calendars and revoked memberships", () => {
    const records = [{ id: "one", calendarId: fermentation.id }, { id: "other", calendarId: production.id }, { id: "legacy" }];
    expect(scopeCalendarRecords(records, lim, fermentation, directory).map((record) => record.id)).toEqual(["one"]);
    expect(scopeCalendarRecords(records, lim, production, directory)).toEqual([]);
    expect(scopeCalendarRecords(records, { ...lim, teamIds: [] }, fermentation, directory)).toEqual([]);
    expect(scopeCalendarRecords(records, lim, undefined, directory)).toEqual([]);
  });
});
