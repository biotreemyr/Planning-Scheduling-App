import type { CalendarDirectory, Process, UnitCalendar } from "@/lib/domain/calendarAccess";
import { stepOf, type ProductFormat, type RouteStepName } from "./processRules";

/**
 * How a process takes part in production, set per process in Admin:
 * - forms: the dosage forms whose route includes it; the unit's process order is the route order
 * - optional: may be left out of a batch without a warning (e.g. granulation)
 * - planned: which job order figure is its theoretical quantity
 * - report: what production enters when completing it
 */
export type DosageForm = Exclude<ProductFormat, "Other">;
export const DOSAGE_FORMS: DosageForm[] = ["Capsule", "Tablet", "Sachet"];
export type PlannedSource = "batchSize" | "batchQuantity" | "packQuantity" | "boxes" | "none";
export type ReportKind = "measure" | "count" | "packs" | "boxes";
export type ProcessSettings = { forms: DosageForm[]; optional: boolean; planned: PlannedSource; report: ReportKind };

export const PLANNED_LABEL: Record<PlannedSource, string> = {
  batchSize: "Batch size (kg or L)", batchQuantity: "Batch quantity (tablets or capsules)", packQuantity: "Pack quantity (blisters, bottles, sachets)", boxes: "Total packs (boxes)", none: "None"
};
export const REPORT_LABEL: Record<ReportKind, string> = {
  measure: "Weight or volume (kg, g, L, mL)", count: "Output weight and unit weight, worked out as tablets or capsules", packs: "Packs (bottles, blisters, sachets, pouches)", boxes: "Boxes"
};
export const REPORT_UOMS: Record<ReportKind, string[]> = {
  measure: ["kg", "g", "L", "mL"], count: ["kg", "g", "L", "mL"], packs: ["bottles", "blisters", "sachets", "pouches"], boxes: ["boxes"]
};

// The built-in processes, as they worked before settings existed. Anything else is in no route
// until it is set up in Admin.
const BUILT_IN: Record<RouteStepName, ProcessSettings> = {
  dispensing: { forms: ["Capsule", "Tablet", "Sachet"], optional: false, planned: "batchSize", report: "measure" },
  granulation: { forms: ["Capsule", "Tablet"], optional: true, planned: "batchSize", report: "measure" },
  capsulation: { forms: ["Capsule"], optional: false, planned: "batchQuantity", report: "count" },
  tableting: { forms: ["Tablet"], optional: false, planned: "batchQuantity", report: "count" },
  coating: { forms: ["Tablet"], optional: false, planned: "batchQuantity", report: "count" },
  filling: { forms: ["Capsule", "Tablet", "Sachet"], optional: false, planned: "packQuantity", report: "packs" },
  packing: { forms: ["Capsule", "Tablet", "Sachet"], optional: false, planned: "boxes", report: "boxes" }
};
export const NEW_PROCESS: ProcessSettings = { forms: [], optional: true, planned: "batchSize", report: "measure" };
const UNKNOWN: ProcessSettings = { forms: [], optional: true, planned: "none", report: "measure" };

export function defaultSettings(name: string): ProcessSettings {
  const step = stepOf(name);
  return step ? BUILT_IN[step] : UNKNOWN;
}
export const settingsOf = (process?: Pick<Process, "name" | "settings">): ProcessSettings => process?.settings ?? (process ? defaultSettings(process.name) : UNKNOWN);

export const processOfCalendar = (d: CalendarDirectory, calendarId?: string) => d.processes.find((item) => item.id === d.calendars.find((calendar) => calendar.id === calendarId)?.processId);
export const calendarSettings = (d: CalendarDirectory, calendarId?: string) => {
  const process = processOfCalendar(d, calendarId);
  const calendar = d.calendars.find((item) => item.id === calendarId);
  return process ? settingsOf(process) : calendar ? defaultSettings(calendar.name) : UNKNOWN;
};
export const calendarProcessName = (d: CalendarDirectory, calendarId?: string) => processOfCalendar(d, calendarId)?.name ?? d.calendars.find((item) => item.id === calendarId)?.name ?? "";

export type RouteEntry = { calendar: UnitCalendar; name: string; settings: ProcessSettings };
// A unit's route for a dosage form: its processes in the unit's order that are used for that form.
export function unitRoute(d: CalendarDirectory, unitId: string | undefined, format: ProductFormat): RouteEntry[] {
  if (format === "Other" || !unitId) return [];
  return d.calendars.filter((calendar) => calendar.unitId === unitId)
    .map((calendar) => ({ calendar, name: calendarProcessName(d, calendar.id), settings: calendarSettings(d, calendar.id) }))
    .filter((entry) => entry.settings.forms.includes(format));
}
export function unitRouteLabel(d: CalendarDirectory, unitId: string | undefined, format: ProductFormat) {
  const route = unitRoute(d, unitId, format);
  return format === "Other" ? "No fixed route" : route.length ? route.map((entry) => entry.settings.optional ? `(${entry.name})` : entry.name).join(" → ") : "No processes set up for this dosage form";
}
