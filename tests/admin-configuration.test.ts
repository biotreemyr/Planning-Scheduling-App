import { describe, expect, it } from "vitest";
import { configureUnit, removeDirectoryItem, validateDirectoryChange } from "../src/lib/services/adminConfiguration";
import { initialDirectory as d } from "../src/lib/domain/calendarAccess";
import type { Machine } from "../src/lib/domain/types";

describe("admin configuration", () => {
  it("deletes an unused unit and cleans its process calendars and people assignments", () => {
    const next = removeDirectoryItem(d, "units", "pilot");
    expect(validateDirectoryChange(d, next, [], [], "admin")).toEqual([]);
    expect(next.calendars.some((item) => item.unitId === "pilot")).toBe(false);
    expect(next.people.find((person) => person.id === "mei")?.unitIds).toEqual([]);
    expect(next.people.find((person) => person.id === "mei")?.calendarIds).toEqual([]);
    expect(next.calendars.filter((item) => item.unitId === "manufacturing")).toEqual(d.calendars.filter((item) => item.unitId === "manufacturing"));
  });
  it("still protects planning records when deleting a unit with cleaned links", () => {
    const next = removeDirectoryItem(d, "units", "manufacturing");
    expect(validateDirectoryChange(d, next, [], ["mfg-production"], "admin").some((error) => error.includes("planning"))).toBe(true);
  });
  it("deletes unused processes with their links and direct assignments", () => {
    const previous = { ...d, people: d.people.map((person) => ({ ...person, processIds: ["extraction"] })) };
    const next = removeDirectoryItem(previous, "processes", "extraction");
    expect(validateDirectoryChange(previous, next, [], [], "admin")).toEqual([]);
    expect(next.people.every((person) => !person.processIds?.includes("extraction"))).toBe(true);
  });
  it("creates calendars for the processes assigned to a new unit", () => {
    let counter = 0;
    const next = configureUnit(d, { id: "unit-new", name: "New Unit" }, ["production", "packing"], () => `calendar-${++counter}`);
    expect(next.calendars.filter((item) => item.unitId === "unit-new").map((item) => item.processId)).toEqual(["production", "packing"]);
    expect(validateDirectoryChange(d, next, [], [], "admin")).toEqual([]);
  });
  it("retains calendar IDs and custom names while editing a unit", () => {
    const next = configureUnit(d, { id: "manufacturing", name: "Renamed Unit" }, ["production", "packing", "fermentation"], () => "unexpected");
    expect(next.calendars).toEqual(d.calendars);
    expect(next.units[0].name).toBe("Renamed Unit");
  });
  it("blocks deleting calendar data or access assignments", () => {
    const next = { ...d, calendars: d.calendars.filter((item) => item.id !== "mfg-fermentation") };
    const errors = validateDirectoryChange(d, next, [], ["mfg-fermentation"], "admin");
    expect(errors.some((error) => error.includes("planning"))).toBe(true);
    expect(errors.some((error) => error.includes("access assignments"))).toBe(true);
  });
  it("blocks removing processes used by machines", () => {
    const machine: Machine = { id: "m", code: "M", name: "Machine", unitId: "manufacturing", processIds: ["fermentation"], workCentreId: "wc", active: "Active" };
    const next = configureUnit(d, d.units[0], ["production", "packing"], () => "unused");
    expect(validateDirectoryChange(d, next, [machine], [], "admin").some((error) => error.includes("machines"))).toBe(true);
  });
  it("allows deleting an unreferenced process, but protects current user and last admin", () => {
    const previous = { ...d, processes: [...d.processes, { id: "unused", name: "Unused" }] };
    expect(validateDirectoryChange(previous, d, [], [], "admin")).toEqual([]);
    const next = { ...d, people: d.people.filter((person) => person.id !== "admin") };
    expect(validateDirectoryChange(d, next, [], [], "admin")).toContain("You cannot delete the current user.");
    expect(validateDirectoryChange(d, next, [], [], "admin")).toContain("Keep at least one administrator.");
  });
  it("rejects duplicate names and invalid team references", () => {
    expect(validateDirectoryChange(d, { ...d, units: [...d.units, { id: "dup", name: " manufacturing " }] }, [], [], "admin")).toContain("Unit name already exists.");
    expect(validateDirectoryChange(d, { ...d, processes: [] }, [], [], "admin").some((error) => error.includes("project teams"))).toBe(true);
  });
});
