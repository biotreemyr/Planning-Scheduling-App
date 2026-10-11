import { isDeepStrictEqual } from "./deepEqual";
import type { PlanLine, ScheduleEntry } from "@/lib/domain/types";
import type { JobOrder } from "./jobOrders";
import type { PurchaseOrder } from "./orders";

/**
 * Who changed what, recorded on the record itself so it can be shown beside it. Every change to the
 * workspace passes through here, so no form has to remember to do it:
 *   activity  - a planning change (date, quantity, process, machine...) records plannedBy/plannedAt;
 *               a production update (started, completed, actual quantity, remarks) updatedBy/updatedAt.
 *               When production reports another machine than planned, the planned one is kept.
 *   order     - any edit records updatedBy/updatedAt (createdBy is kept from when it was added).
 *   job order - an edit of its figures records updatedBy/updatedAt; batch number, testing and release
 *               keep their own "by" as before.
 */
const PLAN_KEYS: (keyof PlanLine)[] = ["plannedDate", "endDate", "quantity", "uom", "calendarId", "priority", "notes", "productId", "jobOrderId", "productionOrderId", "batchSizeKg", "unitWeightMg", "activityType", "orderReference"];
const PRODUCTION_KEYS: (keyof PlanLine)[] = ["startedAt", "productionNotes", "progressQuantity", "progressUom", "progressUnitSize", "progressDestination", "completedAt", "yieldQuantity", "yieldUom", "weighedQuantity", "weighedUom", "actualUnitWeightMg", "actualUnitVolumeMl"];
const OWN_STAMPS = new Set(["updatedBy", "updatedAt", "batchNumber", "batchNumberBy", "batchNumberAt", "testedAt", "testedBy", "testResult", "releaseQuantity", "releaseUom", "releasedAt", "releasedBy", "rejectedAt", "rejectedBy"]);

type Stampable = { lines: PlanLine[]; entries: ScheduleEntry[]; orders: PurchaseOrder[]; jobOrders: JobOrder[] };
const differs = <T extends object>(a: T, b: T, keys: (keyof T)[]) => keys.some((key) => !isDeepStrictEqual(a[key], b[key]));
const changedApartFrom = (a: object, b: object, skip: Set<string>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((key) => !skip.has(key)));
  return [...keys].some((key) => !isDeepStrictEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
};
const machineOf = (entries: ScheduleEntry[], lineId: string) => entries.find((entry) => entry.planLineId === lineId && entry.status !== "Cancelled")?.machineId ?? "";

export function stampChanges<D extends Stampable>(before: D, after: D, who: string, at: string): D {
  if (before === after || !who) return after;
  let lines = after.lines, orders = after.orders, jobOrders = after.jobOrders;
  if (after.lines !== before.lines || after.entries !== before.entries) {
    const old = new Map(before.lines.map((line) => [line.id, line]));
    let touched = false;
    const stamped = after.lines.map((line) => {
      const was = old.get(line.id);
      const machineBefore = was ? machineOf(before.entries, line.id) : "", machineNow = machineOf(after.entries, line.id);
      const produced = !!was && differs(was, line, PRODUCTION_KEYS);
      const planned = !was || differs(was, line, PLAN_KEYS) || (!produced && machineBefore !== machineNow);
      if (!planned && !produced) return line;
      touched = true;
      return { ...line,
        ...(planned ? { plannedBy: who, plannedAt: at } : {}),
        ...(produced ? { updatedBy: who, updatedAt: at } : {}),
        ...(produced && machineBefore && machineBefore !== machineNow && !line.plannedMachineId ? { plannedMachineId: machineBefore } : {}) };
    });
    if (touched) lines = stamped;
  }
  if (after.orders !== before.orders) {
    const old = new Map(before.orders.map((order) => [order.id, order]));
    orders = after.orders.map((order) => { const was = old.get(order.id); return was && changedApartFrom(was, order, OWN_STAMPS) ? { ...order, updatedBy: who, updatedAt: at } : order; });
  }
  if (after.jobOrders !== before.jobOrders) {
    const old = new Map(before.jobOrders.map((job) => [job.id, job]));
    jobOrders = after.jobOrders.map((job) => { const was = old.get(job.id); return was && changedApartFrom(was, job, OWN_STAMPS) ? { ...job, updatedBy: who, updatedAt: at } : job; });
  }
  return lines === after.lines && orders === after.orders && jobOrders === after.jobOrders ? after : { ...after, lines, orders, jobOrders };
}
