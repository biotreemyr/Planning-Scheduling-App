// Server only: node:util keeps it out of browser bundles.
import { isDeepStrictEqual } from "node:util";
import type { WorkspaceSnapshot } from "@/lib/domain/workspace";
import type { WorkspaceCapabilities } from "./capabilities";

type Keyed = { id: string };
function diff<T extends Keyed>(before: T[], after: T[]) {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  return {
    added: after.filter((item) => !old.has(item.id)),
    removed: before.filter((item) => !next.has(item.id)),
    changed: after.filter((item) => old.has(item.id) && !isDeepStrictEqual(old.get(item.id), item)).map((item) => ({ before: old.get(item.id)!, after: item }))
  };
}
function changedKeys(before: object, after: object) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !isDeepStrictEqual((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key]));
}
const only = (keys: string[], allowed: string[]) => keys.every((key) => allowed.includes(key));

export type ChangeReview = { allowed: boolean; denied: string[]; summary: string[] };

/**
 * Decide whether a full workspace save is allowed, by comparing it with the stored
 * snapshot and requiring the Core permission for every kind of change it contains.
 * The browser sends the whole workspace, so nothing it claims about itself is trusted.
 */
export function reviewWorkspaceChange(before: WorkspaceSnapshot, after: WorkspaceSnapshot, can: WorkspaceCapabilities): ChangeReview {
  const denied: string[] = [];
  const summary: string[] = [];
  const need = (allowed: boolean, what: string) => { if (!allowed && !denied.includes(what)) denied.push(what); };
  const count = (label: string, n: number) => { if (n) summary.push(`${label}: ${n}`); };

  const configuration = (["directory", "products", "workCentres", "machines", "measurements"] as const).filter((key) => !isDeepStrictEqual(before[key], after[key]));
  if (configuration.length) { need(can.manage, "change units, people, products, machines or measurements"); summary.push(`configuration: ${configuration.join(", ")}`); }

  const orders = diff(before.data.orders, after.data.orders);
  if (orders.added.length || orders.removed.length || orders.changed.length) need(can.createPlan || can.manage, "add or edit orders");
  count("orders added", orders.added.length); count("orders changed", orders.changed.length); count("orders removed", orders.removed.length);

  const customers = diff(before.data.customers, after.data.customers);
  if (customers.added.length || customers.removed.length || customers.changed.length) need(can.createPlan || can.manage, "add or edit customers");
  count("customers added", customers.added.length); count("customers changed", customers.changed.length);

  const jobs = diff(before.data.jobOrders, after.data.jobOrders);
  if (jobs.added.length || jobs.removed.length) need(can.createPlan || can.manage, "create or remove job orders");
  for (const { before: old, after: job } of jobs.changed) {
    // Production keys in the batch number; anything else on a job order is planning.
    if (only(changedKeys(old, job), ["batchNumber", "batchNumberBy", "batchNumberAt"])) need(can.produce || can.editPlan, "enter batch numbers");
    else need(can.createPlan || can.manage, "edit job orders");
  }
  count("job orders added", jobs.added.length); count("job orders changed", jobs.changed.length); count("job orders removed", jobs.removed.length);

  const lines = diff(before.data.lines, after.data.lines);
  if (lines.added.length) need(can.createPlan, "add plan activities");
  // Every new activity carries out a job order; received work in progress follows its source batch.
  if (lines.added.some((line) => !line.jobOrderId && !line.incomingWipId)) need(false, "add activities without a job order");
  if (lines.changed.some(({ before: old, after: line }) => old.jobOrderId && !line.jobOrderId)) need(false, "unlink activities from their job order");
  if (lines.removed.length) need(can.editPlan, "remove plan activities");
  for (const { before: old, after: line } of lines.changed) {
    // Production writes only its progress: start date, notes, completion time and actual quantity.
    if (only(changedKeys(old, line), ["completedAt", "yieldQuantity", "yieldUom", "startedAt", "productionNotes"])) need(can.produce, "record production results");
    else need(can.editPlan, "move or edit plan activities");
  }
  count("activities added", lines.added.length); count("activities changed", lines.changed.length); count("activities removed", lines.removed.length);

  const entries = diff(before.data.entries, after.data.entries);
  if (entries.added.length || entries.removed.length || entries.changed.length) need(can.produce || can.editPlan, "change machine bookings");
  const previous = new Map(before.data.entries.map((entry) => [entry.id, entry.status]));
  for (const entry of [...entries.added, ...entries.changed.map((item) => item.after)]) {
    if (entry.status === "Confirmed" && previous.get(entry.id) !== "Confirmed") need(can.approve, "confirm machine bookings");
    if (entry.status === "Cancelled" && previous.get(entry.id) !== "Cancelled") need(can.cancel, "cancel machine bookings");
  }
  count("bookings added", entries.added.length); count("bookings changed", entries.changed.length); count("bookings removed", entries.removed.length);

  const actuals = diff(before.data.actuals.map((item) => ({ ...item, id: item.planLineId })), after.data.actuals.map((item) => ({ ...item, id: item.planLineId })));
  if (actuals.added.length || actuals.removed.length || actuals.changed.length) need(can.produce, "record production results");
  count("results recorded", actuals.added.length + actuals.changed.length);

  const transfers = diff(before.data.transfers, after.data.transfers);
  if (transfers.added.length || transfers.removed.length) need(can.produce, "hand over work in progress");
  for (const { before: old, after: transfer } of transfers.changed) {
    // Planning received WIP links it to a new plan line; receiving it is production work.
    if (only(changedKeys(old, transfer), ["plannedLineId"])) need(can.createPlan, "plan received work in progress");
    else need(can.produce, "receive work in progress");
  }
  count("handovers", transfers.added.length + transfers.changed.length);

  return { allowed: denied.length === 0, denied, summary };
}
