import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product, ScheduleEntry } from "@/lib/domain/types";
import type { PurchaseOrder } from "./orders";
import { lineEnd } from "./scheduling";

export const PRODUCT_FORMATS = ["Capsule", "Tablet", "Sachet", "Other"] as const;
export type ProductFormat = (typeof PRODUCT_FORMATS)[number];
type Step = "dispensing" | "granulation" | "capsulation" | "tableting" | "coating" | "filling" | "packing";

// The order of processes for each product format. "Other" has no fixed route. Granulation is
// optional: products made by direct compression or blending skip it without a warning.
export const ROUTES: Record<Exclude<ProductFormat, "Other">, Step[]> = {
  Capsule: ["dispensing", "granulation", "capsulation", "filling", "packing"],
  Tablet: ["dispensing", "granulation", "tableting", "coating", "filling", "packing"],
  Sachet: ["dispensing", "filling", "packing"]
};
export const OPTIONAL_STEPS: ReadonlySet<Step> = new Set<Step>(["granulation"]);
const STEP_LABEL: Record<Step, string> = { dispensing: "Dispensing", granulation: "Granulation", capsulation: "Capsulation", tableting: "Compression", coating: "Coating", filling: "Filling", packing: "Packing" };
// Process names used on the shop floor that mean the same step.
const ALIASES: Record<string, Step> = {
  dispensing: "dispensing", weighing: "dispensing",
  granulation: "granulation", "wet granulation": "granulation", "dry granulation": "granulation", granulating: "granulation",
  capsulation: "capsulation", encapsulation: "capsulation", "capsule filling": "capsulation",
  tableting: "tableting", tabletting: "tableting", compression: "tableting", "tablet press": "tableting",
  coating: "coating", "film coating": "coating",
  filling: "filling", bottling: "filling", "sachet filling": "filling",
  packing: "packing", packaging: "packing"
};
export const stepOf = (processName: string): Step | undefined => ALIASES[processName.trim().toLowerCase()];
export const stepLabel = (step: Step) => STEP_LABEL[step];

// The units production reports each process's actual quantity in: dispensing weighs or measures,
// compression and coating count tablets, capsulation counts capsules, filling counts the primary
// pack and packing counts boxes. Other processes report in their planned unit.
// Compression, coating and capsulation weigh (or measure) their output; it is converted to tablets or
// capsules with the weight of one compressed/coated tablet or filled capsule that production keys in.
const ACTUAL_UOMS: Record<Step, string[]> = {
  dispensing: ["kg", "g", "L", "mL"], granulation: ["kg", "g", "L", "mL"], tableting: ["kg", "g", "L", "mL"], coating: ["kg", "g", "L", "mL"], capsulation: ["kg", "g", "L", "mL"],
  filling: ["bottles", "blisters", "sachets", "pouches"], packing: ["boxes"]
};
export function actualUoms(processName: string, plannedUom?: string) {
  const step = stepOf(processName);
  return step ? ACTUAL_UOMS[step] : plannedUom ? [plannedUom] : [];
}
export type RouteStepName = Step;
export const routeLabel = (format: ProductFormat) => format === "Other" ? "No fixed route" : ROUTES[format].map((step) => OPTIONAL_STEPS.has(step) ? `(${STEP_LABEL[step]})` : STEP_LABEL[step]).join(" → ");

// A sensible default from the product's unit or name; the order's own format always wins.
export function inferFormat(product?: Pick<Product, "name" | "uom">): ProductFormat {
  const text = `${product?.uom ?? ""} ${product?.name ?? ""}`.toLowerCase();
  if (/capsule/.test(text)) return "Capsule";
  if (/tablet|\btabs?\b/.test(text)) return "Tablet";
  if (/sachet/.test(text)) return "Sachet";
  return "Other";
}

export type FlowWarning = { kind: "route" | "missing" | "sequence" | "booking" | "tally"; lineIds: string[]; orderId?: string; batch?: string; message: string };

const pretty = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
function bookingDate(value: string) {
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Check every batch against its format's route. Warns, never blocks:
 * - route: a process that is not part of the format's route (e.g. Coating for a capsule)
 * - missing: an earlier required process is not planned before a later one
 * - sequence: a process starts before the previous process of the same batch finishes
 * - booking: an open machine booking sits on a different day from its activity
 */
export function checkProcessFlow(lines: PlanLine[], entries: ScheduleEntry[], orders: PurchaseOrder[], products: Product[], directory: CalendarDirectory): FlowWarning[] {
  const warnings: FlowWarning[] = [];
  const processName = (line: PlanLine) => {
    const calendar = directory.calendars.find((item) => item.id === line.calendarId);
    return directory.processes.find((item) => item.id === calendar?.processId)?.name ?? calendar?.name ?? line.activityType ?? "";
  };
  const groups = new Map<string, PlanLine[]>();
  for (const line of lines) {
    const key = `${line.productionOrderId ?? "-"}|${line.productId}|${line.orderReference?.trim() || line.id}`;
    groups.set(key, [...groups.get(key) ?? [], line]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const order = orders.find((item) => item.id === first.productionOrderId);
    const format = order?.format ?? inferFormat(products.find((item) => item.id === first.productId));
    if (format === "Other") continue;
    const route = ROUTES[format];
    const batch = first.orderReference?.trim() || undefined;
    const prefix = batch ? `${order ? `${order.poNumber} ` : ""}${batch}: ` : "";
    const byStep = new Map<Step, PlanLine[]>();
    const outside = new Map<string, PlanLine[]>();
    for (const line of group) {
      const step = stepOf(processName(line));
      if (!step || !route.includes(step)) { outside.set(processName(line), [...outside.get(processName(line)) ?? [], line]); continue; }
      byStep.set(step, [...byStep.get(step) ?? [], line]);
    }
    // One warning per wrong process per batch, however many days it runs.
    for (const [name, wrong] of outside) warnings.push({ kind: "route", lineIds: wrong.map((line) => line.id), orderId: order?.id, batch, message: `${prefix}${name || "This process"} is not part of the ${format.toLowerCase()} route (${routeLabel(format)}).` });
    const present = route.filter((step) => byStep.has(step));
    if (!present.length) continue;
    // A step's days run from its first planned day to the last day of its longest activity.
    const span = (step: Step) => { const lines = byStep.get(step)!; return { first: lines.map((line) => line.plannedDate).sort()[0], last: lines.map(lineEnd).sort().at(-1)! }; };
    // Required steps skipped before the furthest planned step.
    const furthest = route.indexOf(present.at(-1)!);
    route.slice(0, furthest).forEach((step, index) => {
      if (byStep.has(step) || OPTIONAL_STEPS.has(step)) return;
      const next = route.slice(index + 1).find((item) => byStep.has(item))!;
      warnings.push({ kind: "missing", lineIds: byStep.get(next)!.map((line) => line.id), orderId: order?.id, batch, message: `${prefix}${STEP_LABEL[step]} is not planned before ${STEP_LABEL[next]}.` });
    });
    // Each planned step must not start before the previous planned step finishes (same day is allowed).
    present.slice(1).forEach((step, index) => {
      const previous = present[index];
      const before = span(previous), current = span(step);
      if (current.first < before.last) warnings.push({ kind: "sequence", lineIds: byStep.get(step)!.filter((line) => line.plannedDate < before.last).map((line) => line.id), orderId: order?.id, batch,
        message: `${prefix}${STEP_LABEL[step]} on ${pretty(current.first)} is before ${STEP_LABEL[previous]} finishes on ${pretty(before.last)}.` });
    });
  }
  for (const entry of entries) {
    if (entry.status === "Cancelled" || entry.status === "Completed") continue;
    const line = lines.find((item) => item.id === entry.planLineId);
    if (!line || line.completedAt) continue;
    const day = bookingDate(entry.startAt);
    if (day !== line.plannedDate) warnings.push({ kind: "booking", lineIds: [line.id], orderId: line.productionOrderId, batch: line.orderReference?.trim() || undefined,
      message: `${processName(line)} for ${line.orderReference?.trim() || "this activity"} is planned for ${pretty(line.plannedDate)} but its machine booking is on ${pretty(day)}.` });
  }
  return warnings;
}

export function warningsByLine(warnings: FlowWarning[]) {
  const map = new Map<string, string[]>();
  for (const warning of warnings) for (const id of warning.lineIds) map.set(id, [...map.get(id) ?? [], warning.message]);
  return map;
}
