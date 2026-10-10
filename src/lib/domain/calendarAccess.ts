import type { ProcessSettings } from "@/lib/services/processSetup";
export type Unit = { id: string; name: string };
// settings: how the process takes part in routes and quantities (see processSetup); processes
// without them use the built-in defaults for their name.
export type Process = { id: string; name: string; settings?: ProcessSettings };
export type UnitCalendar = { id: string; unitId: string; processId: string; name: string };
export type ProcessTeam = { id: string; processId: string; name: string };
export type CalendarPerson = { id: string; name: string; role: "admin" | "planner" | "production"; unitIds: string[]; teamIds: string[]; calendarIds: string[]; processIds?: string[] };
export type CalendarDirectory = { units: Unit[]; processes: Process[]; calendars: UnitCalendar[]; teams: ProcessTeam[]; people: CalendarPerson[] };

export const initialDirectory: CalendarDirectory = {
  units: [{ id: "manufacturing", name: "Manufacturing" }, { id: "pilot", name: "Pilot Unit" }],
  processes: [{ id: "production", name: "Production" }, { id: "packing", name: "Packing" }, { id: "fermentation", name: "Fermentation" }, { id: "extraction", name: "Extraction" }],
  calendars: [
    { id: "mfg-fermentation", unitId: "manufacturing", processId: "fermentation", name: "Fermentation" },
    { id: "mfg-production", unitId: "manufacturing", processId: "production", name: "Production" },
    { id: "mfg-packing", unitId: "manufacturing", processId: "packing", name: "Packing" },
    { id: "pilot-extraction", unitId: "pilot", processId: "extraction", name: "Extraction" }
  ],
  teams: [{ id: "fermentation", processId: "fermentation", name: "Fermentation Team" }, { id: "sachets", processId: "production", name: "Production Team" }, { id: "packing", processId: "packing", name: "Packing Team" }, { id: "pilot", processId: "extraction", name: "Pilot Projects" }],
  people: [
    { id: "aida", name: "Aida", role: "planner", unitIds: ["manufacturing"], teamIds: ["fermentation", "sachets"], calendarIds: ["mfg-fermentation", "mfg-production", "mfg-packing"] },
    { id: "lim", name: "Lim", role: "production", unitIds: ["manufacturing"], teamIds: ["fermentation"], calendarIds: [] },
    { id: "kumar", name: "Kumar", role: "production", unitIds: ["manufacturing"], teamIds: ["sachets", "packing"], calendarIds: [] },
    { id: "mei", name: "Mei", role: "planner", unitIds: ["pilot"], teamIds: ["pilot"], calendarIds: ["pilot-extraction"] },
    { id: "admin", name: "Administrator", role: "admin", unitIds: ["manufacturing", "pilot"], teamIds: [], calendarIds: [] }
  ]
};

// The same checks must run with server-verified identities before deployment.
export function canViewCalendar(person: CalendarPerson, calendar: UnitCalendar, directory: CalendarDirectory) {
  if (!directory.calendars.some((item) => item.id === calendar.id && item.unitId === calendar.unitId && item.processId === calendar.processId)) return false;
  if (!person.unitIds.includes(calendar.unitId)) return false;
  if (person.role === "admin") return true;
  if (person.role === "planner") return person.calendarIds.includes(calendar.id);
  return person.role === "production" && (person.processIds !== undefined ? person.processIds.includes(calendar.processId) : directory.teams.some((team) => person.teamIds.includes(team.id) && team.processId === calendar.processId));
}

export function accessibleCalendars(person: CalendarPerson, directory: CalendarDirectory) {
  return directory.calendars.filter((calendar) => canViewCalendar(person, calendar, directory));
}

export function selectedUnitCalendars(person: CalendarPerson, directory: CalendarDirectory, unitId: string, selection: string[] | null) {
  return accessibleCalendars(person, directory).filter((calendar) => calendar.unitId === unitId && (selection === null || selection.includes(calendar.id)));
}

export function scopeCalendarRecords<T extends { calendarId?: string }>(records: T[], person: CalendarPerson, calendar: UnitCalendar | undefined, directory: CalendarDirectory) {
  return calendar && canViewCalendar(person, calendar, directory) ? records.filter((record) => record.calendarId === calendar.id) : [];
}
