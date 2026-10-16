import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine } from "@/lib/domain/types";
import { isCounted } from "./jobQuantities";
import type { JobOrder } from "./jobOrders";
import { orderWeightKind, type PurchaseOrder } from "./orders";
import { calendarProcessName, calendarSettings } from "./processSetup";
import { isPerOrderLine, isShared, jobForOrder, jobParts, partFor } from "./sharedJobs";

/**
 * Yield at each stage of a batch, as production records it down the process route.
 *
 * Two figures per stage:
 * - % of theoretical (the batch-record yield) = what a stage made ÷ what the batch formula gives at
 *   that stage with no loss (the batch size in kg, the batch quantity in capsules or tablets, and that
 *   in packs and boxes). QA's limits apply to it.
 * - Step yield = what a stage made ÷ what the stage before it handed over, converted to this stage's
 *   unit (the first stage compares with the job order's batch size). It shows where a loss happened.
 *   Capsules weighed with the empty shell weight are compared by powder: weighed − shells ÷ powder in.
 * Converting needs the unit weight (kg to capsules or tablets), the units per pack (to blisters,
 * bottles, sachets) and the units per box (to boxes). Final yield = the last stage's good output, back
 * in capsules or tablets, ÷ the batch quantity.
 */
export type YieldRange = { min?: number; max?: number };
export type YieldLimits = { byProcess: Record<string, YieldRange>; final?: YieldRange };
export type YieldTone = "ok" | "near" | "out" | "none";

type Kind = "weight" | "count" | "packs" | "boxes";
export type StageYield = {
  calendarId: string; processName: string; uom: string; kind: Kind;
  // The stage's total over its days; undefined until every day of it is completed.
  actual?: number; done: boolean; started: boolean;
  // Step yield: against what the stage before handed over.
  expected?: number; percent?: number;
  // How it was worked out, e.g. "59,200 ÷ (42.8 kg × 1,000,000 ÷ 720 mg = 59,444)".
  working?: string; missing?: string;
  // % of theoretical: against the batch formula. The tone and QA's limit go with it.
  theoretical?: number; ofTheoretical?: number; theoreticalWorking?: string;
  tone: YieldTone; limit?: YieldRange;
  // Capsules weighed with their empty shell weight: step yield by powder, and the average net fill.
  powder?: { kg: number; fillMg: number; targetMg?: number };
};
export type FinalYield = { percent?: number; tone: YieldTone; limit?: YieldRange; working?: string; missing?: string };
export type BatchYield = { stages: StageYield[]; final?: FinalYield; missing: string[] };

const KG: Record<string, number> = { kg: 1, g: 0.001, mg: 0.000001 };
const round1 = (value: number) => Math.round(value * 10) / 10;
const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });
export const formatYield = (percent?: number) => percent === undefined ? "–" : `${percent.toFixed(1)}%`;

export function yieldTone(percent: number | undefined, limit?: YieldRange): YieldTone {
  if (percent === undefined || !limit || (limit.min === undefined && limit.max === undefined)) return "none";
  if ((limit.min !== undefined && percent < limit.min) || (limit.max !== undefined && percent > limit.max)) return "out";
  // Amber within 1 point of a limit, or a quarter of the range when QA's range is narrow.
  const band = limit.min !== undefined && limit.max !== undefined ? Math.min(1, (limit.max - limit.min) / 4) : 1;
  if ((limit.min !== undefined && percent < limit.min + band) || (limit.max !== undefined && percent > limit.max - band)) return "near";
  return "ok";
}
export const limitText = (limit?: YieldRange) => !limit || (limit.min === undefined && limit.max === undefined) ? "" : `${limit.min !== undefined ? limit.min.toFixed(1) : "…"}–${limit.max !== undefined ? limit.max.toFixed(1) : "…"}%`;

function kindOf(directory: CalendarDirectory, calendarId: string, uom: string): Kind {
  const planned = calendarSettings(directory, calendarId).planned;
  if (planned === "batchSize" || uom.toLowerCase() in KG) return "weight";
  if (planned === "boxes" || uom.toLowerCase() === "boxes") return "boxes";
  if (planned === "packQuantity") return "packs";
  return "count";
}

/**
 * Each stage's step yield and the final yield of one PO's part of a batch (the whole batch when it
 * serves one PO). A shared batch's common stages are the batch's; its filling and packing that PO's.
 */
export function batchYield(job: JobOrder, orderId: string, lines: PlanLine[], orders: PurchaseOrder[], directory: CalendarDirectory, limits?: YieldLimits): BatchYield {
  const order = orders.find((item) => item.id === orderId);
  const view = jobForOrder(job, orderId);
  // Each activity once: the Orders tab repeats a shared batch's common activities under every PO.
  const own = [...new Map(lines.map((line) => [line.id, line])).values()].filter((line) => line.jobOrderId === job.id && line.calendarId && (!isShared(job) || line.productionOrderId === orderId
    || (line.productionOrderId === job.orderId && !isPerOrderLine(line, directory))));
  const unitWeight = order?.unitWeightMg && order.unitWeightMg > 0 ? order.unitWeightMg : undefined;
  // Sachets filled one per pack need no pack size.
  const packSize = view.packSize && view.packSize > 0 ? view.packSize : view.packUom && isCounted(view.packUom) ? 1 : undefined;
  const unitsPerBox = order && orderWeightKind(order.uom) === "pack" && order.unitsPerPack && order.unitsPerPack > 0 ? order.unitsPerPack : undefined;
  const po = order?.poNumber ?? "the PO";
  const need = { unitWeight: `add the unit weight (mg) on PO ${po}`, packSize: `add the units per pack on job order ${job.number}`, unitsPerBox: `add the units per box on PO ${po}` };
  // A quantity of one kind in single units (capsules, tablets, sachets), and back.
  const toUnits = (quantity: number, kind: Kind): number | string => kind === "count" ? quantity : kind === "weight" ? unitWeight ? quantity * 1e6 / unitWeight : need.unitWeight
    : kind === "packs" ? packSize ? quantity * packSize : need.packSize : unitsPerBox ? quantity * unitsPerBox : need.unitsPerBox;
  const fromUnits = (units: number, kind: Kind): number | string => kind === "count" ? units : kind === "weight" ? unitWeight ? units * unitWeight / 1e6 : need.unitWeight
    : kind === "packs" ? packSize ? units / packSize : need.packSize : unitsPerBox ? units / unitsPerBox : need.unitsPerBox;
  const convert = (quantity: number, from: Kind, to: Kind): number | string => {
    if (from === to) return quantity;
    const units = toUnits(quantity, from);
    return typeof units === "string" ? units : fromUnits(units, to);
  };

  const part = partFor(job, orderId) ?? jobParts(job)[0];
  const missing = new Set<string>();
  const stages: StageYield[] = [];
  let previous: StageYield | undefined;
  for (const calendar of directory.calendars) {
    const items = own.filter((line) => line.calendarId === calendar.id);
    if (!items.length) continue;
    const uom = items[0].uom ?? "";
    const kind = kindOf(directory, calendar.id, uom);
    const done = items.every((line) => line.completedAt && line.yieldQuantity !== undefined);
    const started = items.some((line) => line.completedAt || line.startedAt);
    // Actuals in the stage's unit (weights reported in g or mg count as kg).
    const actual = done ? Number(items.reduce((sum, line) => {
      const unit = (line.yieldUom ?? line.uom ?? "").toLowerCase();
      return sum + (kind === "weight" && unit in KG ? line.yieldQuantity! * KG[unit] : line.yieldQuantity!);
    }, 0).toPrecision(12)) : undefined;
    const limit = limits?.byProcess[calendar.processId];
    const stage: StageYield = { calendarId: calendar.id, processName: calendarProcessName(directory, calendar.id), uom: kind === "weight" ? "kg" : uom, kind, actual, done, started, tone: "none", limit };
    // Capsules weighed with the empty shell weight: the powder in them is what was weighed less the shells.
    const shelled = kind === "count" && items.every((line) => line.weighedQuantity !== undefined && (line.weighedUom ?? "").toLowerCase() in KG && line.shellWeightMg);
    if (done && shelled && actual) {
      const kg = items.reduce((sum, line) => sum + line.weighedQuantity! * KG[(line.weighedUom ?? "").toLowerCase()] - line.yieldQuantity! * line.shellWeightMg! / 1e6, 0);
      stage.powder = { kg: Number(kg.toPrecision(12)), fillMg: Math.round(kg * 1e6 / actual * 100) / 100, ...(unitWeight ? { targetMg: unitWeight } : {}) };
    }
    if (actual !== undefined) {
      // Against the batch formula: the whole batch at the common stages, this PO's part at its own.
      const perOrder = isShared(job) && items.some((line) => isPerOrderLine(line, directory));
      const formula = perOrder ? part.quantity : job.quantity;
      const theoretical = kind === "weight" && !perOrder && job.batchSizeKg ? job.batchSizeKg
        : (() => { const units = isCounted(job.uom) ? formula : toUnits(formula, "weight"); return typeof units === "string" ? units : convert(units, "count", kind); })();
      if (typeof theoretical === "string") missing.add(theoretical);
      else if (theoretical > 0) {
        stage.theoretical = theoretical;
        stage.ofTheoretical = round1(actual / theoretical * 100);
        stage.theoreticalWorking = `${amount(actual)} ÷ ${amount(round1(theoretical))} ${stage.uom} theoretical`;
        stage.tone = yieldTone(stage.ofTheoretical, limit);
      }
      if (!previous) {
        // The first stage compares with what the job order planned for it.
        const planned = items.reduce((sum, line) => sum + line.quantity, 0);
        stage.expected = planned;
        stage.working = `${amount(actual)} ÷ ${amount(planned)} ${stage.uom} planned`;
      } else if (previous.actual !== undefined) {
        const expected = convert(previous.actual, previous.kind, kind);
        if (stage.powder && previous.kind === "weight") {
          // By powder: overfill no longer counts as a loss.
          stage.expected = previous.actual;
          stage.percent = round1(stage.powder.kg / previous.actual * 100);
          stage.working = `${amount(Number(stage.powder.kg.toFixed(3)))} kg powder in capsules (weighed less ${amount(actual)} empty shells) ÷ ${amount(previous.actual)} kg from ${previous.processName}`;
        } else if (typeof expected === "string") { stage.missing = expected; missing.add(expected); }
        else {
          stage.expected = expected;
          stage.working = `${amount(actual)} ÷ ${previous.kind === kind ? `${amount(expected)} ${stage.uom} from ${previous.processName}` : `(${amount(previous.actual)} ${previous.uom} from ${previous.processName} = ${amount(round1(expected))} ${stage.uom})`}`;
        }
      }
      if (stage.expected && stage.percent === undefined) stage.percent = round1(actual / stage.expected * 100);
    }
    stages.push(stage);
    // A stage with no result yet leaves the next stage nothing to compare with.
    previous = stage;
  }

  // Final yield: the last stage's output back in single units, ÷ this PO's share of the batch.
  let final: FinalYield | undefined;
  const last = stages.at(-1);
  if (last?.done && last.actual !== undefined && stages.every((stage) => stage.done)) {
    const made = toUnits(last.actual, last.kind);
    const base = isCounted(job.uom) ? part.quantity : typeof toUnits(part.quantity, "weight") === "number" ? toUnits(part.quantity, "weight") as number : need.unitWeight;
    if (typeof made === "string" || typeof base === "string") { const reason = typeof made === "string" ? made : base as string; missing.add(reason); final = { tone: "none", missing: reason, limit: limits?.final }; }
    else {
      const percent = round1(made / base * 100);
      final = { percent, tone: yieldTone(percent, limits?.final), limit: limits?.final, working: `${amount(Math.round(made))} ${isCounted(job.uom) ? job.uom : "units"} ÷ ${amount(base)} planned` };
    }
  }
  return { stages, final, missing: [...missing] };
}

/**
 * The yields a stage would have with this total actual (and what was weighed, with the shell weight),
 * for checking QA's limits when production saves it.
 */
export function stepYieldWith(job: JobOrder, orderId: string, lines: PlanLine[], orders: PurchaseOrder[], directory: CalendarDirectory, lineId: string, actual: number, limits?: YieldLimits, recorded: Partial<PlanLine> = {}) {
  const changed = lines.map((line) => line.id === lineId ? { ...line, ...recorded, completedAt: line.completedAt ?? new Date().toISOString(), yieldQuantity: actual } : line);
  const line = changed.find((item) => item.id === lineId);
  return batchYield(job, orderId, changed, orders, directory, limits).stages.find((stage) => stage.calendarId === line?.calendarId);
}

/**
 * For the planner: batches whose yield can't be worked out because a conversion figure is missing
 * (unit weight, units per pack, units per box). Checked on the planned quantities, so it shows as soon
 * as the batch is planned, before production records anything.
 */
export function yieldWarnings(jobs: JobOrder[], lines: PlanLine[], orders: PurchaseOrder[], directory: CalendarDirectory) {
  return jobs.flatMap((job) => {
    const planned = lines.filter((line) => line.jobOrderId === job.id);
    if (!planned.length) return [];
    // As if every activity made exactly what was planned: only the conversions are being checked.
    const asPlanned = planned.map((line) => ({ ...line, completedAt: line.completedAt ?? "planned", yieldQuantity: line.yieldQuantity ?? line.quantity }));
    return jobParts(job).flatMap((part) => {
      const missing = batchYield(job, part.orderId, asPlanned, orders, directory).missing;
      if (!missing.length) return [];
      const ids = planned.filter((line) => line.productionOrderId === part.orderId || !isShared(job)).map((line) => line.id);
      return [{ kind: "yield" as const, lineIds: ids, orderId: part.orderId, batch: job.number, message: `Yield for ${job.number} can't be worked out: ${missing.join("; ")}.` }];
    });
  });
}
