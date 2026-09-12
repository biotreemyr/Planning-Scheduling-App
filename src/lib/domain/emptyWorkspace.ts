import type { CalendarDirectory } from "./calendarAccess";

export function emptyDirectory(): CalendarDirectory {
  return {
    units: [], processes: [], calendars: [], teams: [],
    people: [{ id: "admin", name: "Administrator", role: "admin", unitIds: [], processIds: [], teamIds: [], calendarIds: [] }]
  };
}
