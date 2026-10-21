/**
 * Which days a unit works. Each unit has its weekly working days (Monday to Friday unless Admin
 * changes them in Setup), the company's public holidays come from Circulo, and planners can open an
 * off day for overtime or close a working day (a shutdown, say) as a special day with its reason.
 * A special day wins over the week and over a holiday; a holiday wins over the week.
 */
import { formatDate } from "./dates";

// Weekday numbers as Date.getDay(): 0 is Sunday.
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
// Monday first, the order the calendar and Setup show them in.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

// kind "working": an off day opened (overtime); "closed": a working day closed.
export type SpecialDay = { id: string; unitId: string; date: string; kind: "working" | "closed"; reason: string; addedBy: string; addedAt: string };
export type Holiday = { date: string; name: string };
// Circulo's list as the page read it: "unavailable" when Circulo could not be reached, "off" when not set up.
export type HolidayList = { status: "ok"; holidays: Holiday[] } | { status: "unavailable" | "off"; holidays: Holiday[] };

export type WorkingCalendar = { workingDays: number[]; specialDays: SpecialDay[]; holidays: Holiday[] };
export type DayStatus = { working: boolean; kind: "work" | "weekly-off" | "holiday" | "overtime" | "closed"; label?: string; special?: SpecialDay };

export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const shift = (date: string, days: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };

export function workingCalendar(unit: { id: string; workingDays?: number[] } | undefined, specialDays: SpecialDay[] = [], holidays: Holiday[] = []): WorkingCalendar {
  return { workingDays: unit?.workingDays ?? DEFAULT_WORKING_DAYS, specialDays: unit ? specialDays.filter((day) => day.unitId === unit.id) : [], holidays };
}

export function dayStatus(calendar: WorkingCalendar, date: string): DayStatus {
  const special = calendar.specialDays.find((day) => day.date === date);
  const holiday = calendar.holidays.find((day) => day.date === date);
  if (special?.kind === "working") return { working: true, kind: "overtime", label: "Overtime", special };
  if (special?.kind === "closed") return { working: false, kind: "closed", label: "Closed", special };
  if (holiday) return { working: false, kind: "holiday", label: holiday.name };
  return calendar.workingDays.includes(weekday(date)) ? { working: true, kind: "work" } : { working: false, kind: "weekly-off", label: "Off" };
}

export const isWorkingDay = (calendar: WorkingCalendar, date: string) => dayStatus(calendar, date).working;

// The next working day after a date. With no working day in the next year (nothing ticked), the next day.
export function nextWorkingDay(calendar: WorkingCalendar, date: string) {
  for (let days = 1; days <= 366; days++) { const next = shift(date, days); if (isWorkingDay(calendar, next)) return next; }
  return shift(date, 1);
}

// The days from start to end (both included) that are off, and how many are worked.
export function spanDays(calendar: WorkingCalendar, start: string, end: string) {
  const off: { date: string; status: DayStatus }[] = [];
  let working = 0;
  for (let date = start; date <= end; date = shift(date, 1)) {
    const status = dayStatus(calendar, date);
    if (status.working) working += 1; else off.push({ date, status });
  }
  return { working, off };
}

// "Sun 25/10/2026" for notes and labels: the weekday, then the date as the app shows every date.
export const shortDay = (date: string) => `${WEEKDAYS[weekday(date)].slice(0, 3)} ${formatDate(date)}`;
// "Saturday, Sunday" for a unit's weekly off days.
export const offDayNames = (workingDays: number[]) => WEEK_ORDER.filter((day) => !workingDays.includes(day)).map((day) => WEEKDAYS[day]).join(", ") || "None";
