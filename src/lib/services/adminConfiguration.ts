import type { CalendarDirectory, Unit } from "@/lib/domain/calendarAccess";
import type { Machine } from "@/lib/domain/types";

export function cleanDirectoryLinks(directory: CalendarDirectory): CalendarDirectory {
  const calendars = directory.calendars.filter((item) => directory.units.some((unit) => unit.id === item.unitId) && directory.processes.some((process) => process.id === item.processId));
  const teams = directory.teams.filter((item) => directory.processes.some((process) => process.id === item.processId));
  return { ...directory, calendars, teams, people: directory.people.map((person) => ({ ...person,
    unitIds: person.unitIds.filter((id) => directory.units.some((unit) => unit.id === id)),
    calendarIds: person.calendarIds.filter((id) => calendars.some((calendar) => calendar.id === id)),
    teamIds: person.teamIds.filter((id) => teams.some((team) => team.id === id)),
    processIds: person.processIds?.filter((id) => directory.processes.some((process) => process.id === id))
  })) };
}

export function removeDirectoryItem(directory: CalendarDirectory, kind: "units" | "processes" | "people", id: string) {
  return cleanDirectoryLinks({ ...directory, [kind]: directory[kind].filter((item) => item.id !== id) });
}

// processIds are the unit's processes in route order: the unit's calendars follow that order.
export function configureUnit(directory: CalendarDirectory, unit: Unit, processIds: string[], makeId: () => string): CalendarDirectory {
  const existing = directory.units.some((item) => item.id === unit.id);
  const own = processIds.map((processId) => directory.calendars.find((item) => item.unitId === unit.id && item.processId === processId)
    ?? { id: makeId(), unitId: unit.id, processId, name: directory.processes.find((item) => item.id === processId)?.name ?? "Process" });
  const first = directory.calendars.findIndex((item) => item.unitId === unit.id);
  const others = directory.calendars.filter((item) => item.unitId !== unit.id);
  const at = first < 0 ? others.length : directory.calendars.slice(0, first).filter((item) => item.unitId !== unit.id).length;
  return cleanDirectoryLinks({
    ...directory,
    units: existing ? directory.units.map((item) => item.id === unit.id ? unit : item) : [...directory.units, unit],
    calendars: [...others.slice(0, at), ...own, ...others.slice(at)]
  });
}

export function validateDirectoryChange(previous: CalendarDirectory, next: CalendarDirectory, machines: Machine[], usedCalendarIds: string[], currentUserId: string) {
  const errors: string[] = [];
  const has = (items: { id: string }[], id: string) => items.some((item) => item.id === id);
  // With Bio Tree Core sign-in there is no local user ID; people and access live in Core.
  if (currentUserId) {
    if (!has(next.people, currentUserId)) errors.push("You cannot delete the current user.");
    if (!next.people.some((person) => person.role === "admin")) errors.push("Keep at least one administrator.");
  }
  for (const kind of ["units", "processes", "teams", "people", "calendars"] as const) {
    if (next[kind].some((item) => !item.name.trim())) errors.push("Names cannot be empty.");
    if (new Set(next[kind].map((item) => item.id)).size !== next[kind].length) errors.push("Duplicate record ID.");
  }
  for (const kind of ["units", "processes"] as const) {
    if (new Set(next[kind].map((item) => item.name.trim().toLowerCase())).size !== next[kind].length) errors.push(`${kind === "units" ? "Unit" : "Process"} name already exists.`);
  }
  if (next.calendars.some((item) => !has(next.units, item.unitId) || !has(next.processes, item.processId))) errors.push("Remove the linked calendars before deleting a unit or process.");
  if (new Set(next.calendars.map((item) => `${item.unitId}:${item.processId}`)).size !== next.calendars.length) errors.push("Each unit can have only one calendar per process.");
  if (next.teams.some((item) => !has(next.processes, item.processId))) errors.push("Reassign the linked project teams first.");
  if (next.people.some((person) => person.unitIds.some((id) => !has(next.units, id)) || person.teamIds.some((id) => !has(next.teams, id)) || person.calendarIds.some((id) => !has(next.calendars, id)))) errors.push("Remove the linked people or planner access assignments first.");
  if (next.people.some((person) => person.processIds?.some((id) => !has(next.processes, id)))) errors.push("Select valid process access assignments.");
  if (machines.some((machine) => !has(next.units, machine.unitId ?? "") || machine.processIds?.some((id) => !next.calendars.some((calendar) => calendar.unitId === machine.unitId && calendar.processId === id)))) errors.push("Reassign the unit's machines before removing its processes or deleting the unit.");
  if (usedCalendarIds.some((id) => !has(next.calendars, id))) errors.push("This calendar contains planning, production or WIP records and cannot be removed.");
  if (previous.calendars.some((old) => next.calendars.some((item) => item.id === old.id && (item.unitId !== old.unitId || item.processId !== old.processId)))) errors.push("An existing calendar's unit and process cannot be changed.");
  return [...new Set(errors)];
}
