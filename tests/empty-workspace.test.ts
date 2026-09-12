import { describe, expect, it } from "vitest";
import { emptyDirectory } from "../src/lib/domain/emptyWorkspace";
import { configureUnit, validateDirectoryChange } from "../src/lib/services/adminConfiguration";
import { accessibleCalendars } from "../src/lib/domain/calendarAccess";

describe("empty workspace setup", () => {
  it("starts without demo units, processes, calendars or staff", () => {
    const directory = emptyDirectory();
    expect(directory.people.map((person) => person.role)).toEqual(["admin"]);
    for (const key of ["units", "processes", "calendars", "teams"] as const) expect(directory[key]).toEqual([]);
    expect(validateDirectoryChange(directory, directory, [], [], "admin")).toEqual([]);
  });
  it("can configure a fresh unit and planner without legacy fixtures", () => {
    const empty = emptyDirectory();
    const next = configureUnit({ ...empty, processes: [{ id: "process", name: "Tableting" }] }, { id: "unit", name: "Beta Unit" }, ["process"], () => "calendar");
    const planner = { id: "planner", name: "Beta Planner", role: "planner" as const, unitIds: ["unit"], processIds: [], calendarIds: ["calendar"], teamIds: [] };
    next.people.push(planner);
    expect(validateDirectoryChange(empty, next, [], [], "admin")).toEqual([]);
    expect(accessibleCalendars(planner, next).map((item) => item.id)).toEqual(["calendar"]);
    expect(emptyDirectory().people).toHaveLength(1);
  });
});
