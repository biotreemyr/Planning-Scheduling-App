// Server only: node:util keeps it out of browser bundles.
import { isDeepStrictEqual } from "node:util";
import type { WorkspaceSnapshot } from "@/lib/domain/workspace";
import type { Customer, Product } from "@/lib/domain/types";
import { customerFor, productFor, type MasterLists } from "@/lib/services/masterData";
import type { WorkspaceCapabilities } from "./capabilities";
import { bookingMoved } from "@/lib/services/planChanges";
import { orderedInJobs, overPlanAllowed } from "@/lib/services/sharedJobs";

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

// Who/when a record was last edited: they follow the change they stamp, so need no right of their own.
const EDIT_STAMPS = ["updatedBy", "updatedAt"];
const LINE_STAMPS = [...EDIT_STAMPS, "plannedBy", "plannedAt", "correctionReason", "correctedBy", "correctedAt"];
// The reason for job orders adding up to more than a PO, given while creating or editing job orders.
const OVER_PLAN = ["overPlanReason", "overPlannedTotal", "overPlannedBy", "overPlannedAt"];
// What a completed process recorded: changing any of it later is a correction, which needs a reason.
const LINE_RECORD = ["completedAt", "startedAt", "yieldQuantity", "yieldUom", "weighedQuantity", "weighedUom", "actualUnitWeightMg", "actualUnitVolumeMl", "shellWeightMg", "plannedDate", "endDate"];
// An activity's dates, which production may change too, always with its reason.
const LINE_DATES = ["plannedDate", "endDate", "planChangeReason"];
// What production records on an activity.
const LINE_RESULTS: string[] = ["completedAt", "yieldQuantity", "yieldUom", "weighedQuantity", "weighedUom", "actualUnitWeightMg", "actualUnitVolumeMl", "shellWeightMg", "startedAt", "productionNotes", "progressQuantity", "progressUom", "progressUnitSize", "progressDestination"];
// A job order's fields that only one right may set, each with the people who record them.
const jobGroups = (can: WorkspaceCapabilities) => [
  { keys: ["batchNumber", "batchNumberBy", "batchNumberAt"], allowed: can.produce || can.editPlan, what: "enter batch numbers" },
  { keys: ["testedAt", "testedBy", "testResult"], allowed: can.passTesting, what: "record testing results" },
  { keys: ["releaseQuantity", "releaseUom", "releasedAt", "releasedBy", "rejectedAt", "rejectedBy", "poReleases"], allowed: can.release, what: "release or reject batches" },
  // QA confirms that POs with different FG codes sharing a batch are the same formula.
  { keys: ["formulaConfirmedBy", "formulaConfirmedAt"], allowed: can.release, what: "confirm a shared batch's formula", clearedByEdit: true }
];
const JOB_GROUPED = new Set(jobGroups({} as WorkspaceCapabilities).flatMap((group) => group.keys));

export type ChangeReview = { allowed: boolean; denied: string[]; summary: string[] };

/**
 * Decide whether a full workspace save is allowed, by comparing it with the stored
 * snapshot and requiring the Core permission for every kind of change it contains.
 * The browser sends the whole workspace, so nothing it claims about itself is trusted.
 */
// A record added or linked exactly as an order takes it from Master Data: nothing else about it changed.
function productFromMasterData(old: Product | undefined, product: Product, lists: MasterLists) {
  const master = lists.products.find((item) => item.id === product.masterDataId);
  return !!master && isDeepStrictEqual(product, productFor(master, old ? [old] : []));
}
function customerFromMasterData(old: Customer, customer: Customer, lists: MasterLists) {
  const master = lists.customers.find((item) => item.id === customer.masterDataId);
  return !!master && isDeepStrictEqual(customer, customerFor(master, [old]));
}

/**
 * `lists` is Master Data's products and customers an order may use, read by the server. Adding or
 * linking one of those as it stands there is part of creating an order; any other product change
 * is master data management, and any other customer change is editing orders.
 */
export function reviewWorkspaceChange(before: WorkspaceSnapshot, after: WorkspaceSnapshot, can: WorkspaceCapabilities, lists: MasterLists = { products: [], customers: [] }): ChangeReview {
  const denied: string[] = [];
  const summary: string[] = [];
  const need = (allowed: boolean, what: string) => { if (!allowed && !denied.includes(what)) denied.push(what); };
  const count = (label: string, n: number) => { if (n) summary.push(`${label}: ${n}`); };

  const configuration = (["directory", "products", "workCentres", "machines", "measurements"] as const).filter((key) => !isDeepStrictEqual(before[key], after[key]));
  // QA sets the acceptable yield ranges.
  if (!isDeepStrictEqual(before.yieldLimits ?? { byProcess: {} }, after.yieldLimits ?? { byProcess: {} })) { need(can.release, "set yield limits"); summary.push("yield limits changed"); }
  const products = diff(before.products, after.products);
  const fromMasterData = [...products.added.map((item) => ({ before: undefined, after: item })), ...products.changed].filter((change) => productFromMasterData(change.before, change.after, lists));
  // A product keyed in on an R&D, trial or pilot order is added to the R&D list as part of creating the order.
  const newRnd = products.added.filter((item) => item.rnd && !item.masterDataId && !fromMasterData.some((change) => change.after === item));
  const onlyFromMasterData = configuration.length === 1 && configuration[0] === "products" && !products.removed.length && fromMasterData.length + newRnd.length === products.added.length + products.changed.length;
  if (onlyFromMasterData) need(can.createOrders, newRnd.length ? "add R&D products" : "add products from Master Data");
  else if (configuration.length) need(can.manage, "change units, people, products, machines or measurements");
  if (configuration.length) summary.push(`configuration: ${configuration.join(", ")}`);
  count("products taken from Master Data", fromMasterData.length);
  count("R&D products added", newRnd.length);

  const orders = diff(before.data.orders, after.data.orders);
  if (orders.added.length) need(can.createOrders, "add orders");
  const overPlanOnly = orders.changed.filter((change) => only(changedKeys(change.before, change.after), [...OVER_PLAN, ...EDIT_STAMPS]) && !!change.after.overPlanReason?.trim());
  if (overPlanOnly.length) need(can.createOrders || can.editOrders, "give a reason for planning more than a PO");
  if (orders.removed.length || orders.changed.length > overPlanOnly.length) need(can.editOrders, "edit or delete orders");
  count("orders added", orders.added.length); count("orders changed", orders.changed.length); count("orders removed", orders.removed.length);

  const customers = diff(before.data.customers, after.data.customers);
  const linked = customers.changed.filter((change) => customerFromMasterData(change.before, change.after, lists));
  if (customers.added.length || linked.length) need(can.createOrders, "add customers");
  if (customers.removed.length || customers.changed.length > linked.length) need(can.editOrders, "edit customers");
  count("customers added", customers.added.length); count("customers taken from Master Data", linked.length); count("customers changed", customers.changed.length - linked.length);

  const jobs = diff(before.data.jobOrders, after.data.jobOrders);
  if (jobs.added.length) need(can.createOrders, "create or remove job orders");
  if (jobs.removed.length) need(can.editOrders, "create or remove job orders");
  // A new job order is created bare: any batch, testing, release or formula field it carries needs that right too.
  for (const job of jobs.added) for (const group of jobGroups(can)) if (group.keys.some((key) => (job as Record<string, unknown>)[key] !== undefined)) need(group.allowed, group.what);
  for (const { before: old, after: job } of jobs.changed) {
    // Each kind of field needs its own right, however the change is bundled: production keys in the batch
    // number, testing passes the batch, release releases it, QA confirms a shared formula; the rest is orders.
    const keys = changedKeys(old, job);
    for (const group of jobGroups(can)) {
      if (!keys.some((key) => group.keys.includes(key))) continue;
      // A job order whose shares change loses its formula confirmation; clearing it is part of the edit.
      if (group.clearedByEdit && group.keys.every((key) => (job as Record<string, unknown>)[key] === undefined)) need(can.editOrders || group.allowed, "edit job orders");
      else need(group.allowed, group.what);
    }
    const rest = keys.filter((key) => !JOB_GROUPED.has(key));
    if (rest.some((key) => !EDIT_STAMPS.includes(key)) || (rest.length && rest.length === keys.length)) need(can.editOrders, "edit job orders");
  }
  // Job orders may add up to more than a PO (process waste, samples) only with a reason kept on the PO.
  for (const order of after.data.orders) {
    const { total } = orderedInJobs(order, after.data.jobOrders);
    const was = before.data.orders.find((item) => item.id === order.id);
    if (total > (was ? orderedInJobs(was, before.data.jobOrders).total : 0) + 1e-9 && !overPlanAllowed(order, total)) need(false, "plan job orders above the PO without a reason");
  }
  count("job orders added", jobs.added.length); count("job orders changed", jobs.changed.length); count("job orders removed", jobs.removed.length);

  const lines = diff(before.data.lines, after.data.lines);
  if (lines.added.length) need(can.createPlan, "add plan activities");
  // Every new activity carries out a job order; received work in progress follows its source batch.
  if (lines.added.some((line) => !line.jobOrderId && !line.incomingWipId)) need(false, "add activities without a job order");
  if (lines.changed.some(({ before: old, after: line }) => old.jobOrderId && !line.jobOrderId)) need(false, "unlink activities from their job order");
  if (lines.removed.length) need(can.editPlan, "remove plan activities");
  // Production results need production's right, whether set on a new activity or bundled with a plan change.
  if (lines.added.some((line) => LINE_RESULTS.some((key) => (line as Record<string, unknown>)[key] !== undefined))) need(can.produce, "record production results");
  for (const { before: old, after: line } of lines.changed) {
    const keys = changedKeys(old, line);
    // Correcting a completed process's dates or quantity carries a fresh correction with its reason.
    if (old.completedAt && keys.some((key) => LINE_RECORD.includes(key)) && !(keys.includes("correctedAt") && line.correctionReason?.trim())) need(false, "correct completed production without a reason");
    if (keys.some((key) => LINE_RESULTS.includes(key))) need(can.produce, "record production results");
    // When production reports another machine than planned, the planned one is kept on the activity.
    const keptMachine = (key: string) => key === "plannedMachineIds" && old.plannedMachineIds === undefined && old.plannedMachineId === undefined;
    const rest = keys.filter((key) => !LINE_RESULTS.includes(key) && !keptMachine(key));
    if (rest.some((key) => !LINE_STAMPS.includes(key)) || (rest.length && rest.length === keys.length)) {
      const datesOnly = rest.every((key) => LINE_DATES.includes(key) || LINE_STAMPS.includes(key)) && !!line.planChangeReason?.trim();
      need(can.editPlan || (datesOnly && can.produce), "move or edit plan activities");
    }
  }
  count("activities added", lines.added.length); count("activities changed", lines.changed.length); count("activities removed", lines.removed.length);

  const entries = diff(before.data.entries, after.data.entries);
  if (entries.added.length || entries.removed.length || entries.changed.length) need(can.produce || can.editPlan, "change machine bookings");
  const previous = new Map(before.data.entries.map((entry) => [entry.id, entry]));
  for (const entry of [...entries.added, ...entries.changed.map((item) => item.after)]) {
    const was = previous.get(entry.id);
    if (entry.status === "Confirmed" && was?.status !== "Confirmed") need(can.approve, "confirm machine bookings");
    if (entry.status === "Cancelled" && was?.status !== "Cancelled") need(can.cancel, "cancel machine bookings");
    // A confirmed booking keeps its machine and time unless an approver moves it (else it goes back to Draft).
    if (was?.status === "Confirmed" && entry.status === "Confirmed" && bookingMoved(was, entry)) need(can.approve, "move confirmed machine bookings");
  }
  // Deleting a booking past Draft takes it off the machine as cancelling would.
  if (entries.removed.some((entry) => entry.status !== "Draft" && entry.status !== "Cancelled")) need(can.cancel, "cancel machine bookings");
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

  // Opening an off day for overtime, or closing a working day: planners, production managers and Admin
  // (everyone who may edit the plan). The unit's weekly working days are Setup, above.
  const specialDays = diff(before.data.specialDays ?? [], after.data.specialDays ?? []);
  if (specialDays.added.length || specialDays.removed.length || specialDays.changed.length) need(can.editPlan, "open or close days");
  count("special days added", specialDays.added.length); count("special days changed", specialDays.changed.length); count("special days removed", specialDays.removed.length);

  return { allowed: denied.length === 0, denied, summary };
}
