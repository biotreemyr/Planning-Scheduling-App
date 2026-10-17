import type { WorkspaceSnapshot } from "@/lib/domain/workspace";
import type { WorkspaceCapabilities } from "./capabilities";

/**
 * What of the workspace a signed-in person's browser receives. The page only hides screens; this
 * keeps data a person may not view off the page altogether, and `restoreHidden` puts it back on save.
 *
 * Kept for everyone, because the Planner board, production and Reports work from it: units, processes,
 * people, products, machines, measurements, QA's yield limits, every activity with its production
 * results and yields, machine bookings, results and WIP handovers. Of a PO, what planning needs to plan
 * its batches (PO number, item, product, quantity, dosage form, unit, wanted dates); of a job order, its
 * batch and pack quantities, shares, packing number and batch number.
 *
 * Order rights (view, create, edit or print orders) see everything. Without them:
 * - the customer list, and each PO's customer ID, are left out;
 * - a PO's customer name is left out unless the person has a testing or release right (QA/QC lists
 *   batches by PO and customer);
 * - a PO's SO number, received date, remarks and closing (quantity, by, when, note) are left out;
 * - a job order's remarks are left out, and its testing result, release, rejection and shared-formula
 *   confirmation are left out unless the person has a testing or release right.
 * The record IDs, who created a PO or job order and when, stay: the workspace needs them to stay whole.
 */
export const ORDER_HIDDEN = ["customerId", "soNumber", "receivedDate", "notes", "closedQuantity", "closedUom", "closedAt", "closedBy", "closeNote"] as const;
export const ORDER_CUSTOMER = ["customerName"] as const;
export const JOB_HIDDEN = ["notes"] as const;
export const JOB_QUALITY = ["testedAt", "testedBy", "testResult", "releaseQuantity", "releaseUom", "releasedAt", "releasedBy", "rejectedAt", "rejectedBy", "poReleases", "formulaConfirmedBy", "formulaConfirmedAt"] as const;

type Hidden = { customers: boolean; order: string[]; job: string[] };
function hiddenFor(can: WorkspaceCapabilities): Hidden {
  const orders = can.viewOrders || can.createOrders || can.editOrders || can.printOrders;
  const quality = can.viewTesting || can.passTesting || can.printTesting || can.viewRelease || can.release || can.printRelease;
  if (orders) return { customers: false, order: [], job: [] };
  return { customers: true, order: [...ORDER_HIDDEN, ...(quality ? [] : ORDER_CUSTOMER)], job: [...JOB_HIDDEN, ...(quality ? [] : JOB_QUALITY)] };
}

const without = <T extends object>(item: T, keys: string[]) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key))) as T;

/** The workspace as this person's browser may receive it. */
export function visibleWorkspace(snapshot: WorkspaceSnapshot, can: WorkspaceCapabilities): WorkspaceSnapshot {
  const hidden = hiddenFor(can);
  if (!hidden.customers) return snapshot;
  return { ...snapshot, data: { ...snapshot.data,
    customers: [],
    orders: snapshot.data.orders.map((order) => without(order, hidden.order)),
    jobOrders: snapshot.data.jobOrders.map((job) => without(job, hidden.job)) } };
}

// A record's hidden fields as stored, whatever the browser sent in their place.
function restore<T extends { id: string }>(stored: T[], received: T[], keys: string[]) {
  const old = new Map(stored.map((item) => [item.id, item]));
  return received.map((item) => {
    const kept = old.get(item.id);
    const back = kept ? Object.entries(kept).filter(([key, value]) => keys.includes(key) && value !== undefined) : [];
    return { ...without(item, keys), ...Object.fromEntries(back) } as T;
  });
}

/**
 * A save from a browser that received `visibleWorkspace`: what it was not sent is taken from the stored
 * workspace, so the save neither deletes nor changes it. Records it adds or removes are left to the
 * change review, which needs order rights for those.
 */
export function restoreHidden(stored: WorkspaceSnapshot, received: WorkspaceSnapshot, can: WorkspaceCapabilities): WorkspaceSnapshot {
  const hidden = hiddenFor(can);
  if (!hidden.customers) return received;
  return { ...received, data: { ...received.data,
    customers: stored.data.customers,
    orders: restore(stored.data.orders, received.data.orders, hidden.order),
    jobOrders: restore(stored.data.jobOrders, received.data.jobOrders, hidden.job) } };
}
