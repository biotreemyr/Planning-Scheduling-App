/**
 * Readable transaction history: each saved version of the workspace compared with the one before,
 * described as the changes people made (POs, job orders, planning, production, transfers), each
 * carrying the PO, job order and batch number it concerns so a batch can be traced end to end.
 * Snapshots are read loosely: versions saved before a field existed still describe correctly.
 */
import { formatDate } from "./dates";
type Row = Record<string, unknown> & { id?: string };
type Snapshot = { products?: Row[]; directory?: { calendars?: Row[]; processes?: Row[]; units?: Row[] }; data?: Record<string, Row[] | undefined> } & Record<string, unknown>;

export type HistoryKind = "PO" | "Customer" | "Job order" | "Planning" | "Production" | "Transfer" | "Machine booking" | "Setup";
export type HistoryChange = { kind: HistoryKind; text: string; po?: string; job?: string; batch?: string; product?: string };
export type HistoryEntry = { revision: number; at: string; by: string; changes: HistoryChange[] };

const list = (snapshot: Snapshot, key: string) => (snapshot.data?.[key] ?? []) as Row[];
const str = (value: unknown) => typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
const num = (value: unknown) => typeof value === "number" ? value.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : str(value);
const day = (value: unknown) => { const text = str(value); return /^\d{4}-\d{2}-\d{2}/.test(text) ? formatDate(text.slice(0, 10)) : text; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function byId(rows: Row[]) { return new Map(rows.filter((row) => row.id).map((row) => [row.id!, row])); }
function diff(before: Row[], after: Row[]) {
  const old = byId(before), next = byId(after);
  return {
    added: after.filter((row) => row.id && !old.has(row.id)),
    removed: before.filter((row) => row.id && !next.has(row.id)),
    changed: after.filter((row) => row.id && old.has(row.id) && !same(old.get(row.id), row)).map((row) => ({ before: old.get(row.id!)!, after: row }))
  };
}

export function describeChanges(before: Snapshot, after: Snapshot): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const products = [...(after.products ?? []), ...(before.products ?? [])];
  const productName = (id: unknown) => str(products.find((item) => item.id === id)?.name) || "Unknown product";
  const orders = [...list(after, "orders"), ...list(before, "orders")];
  const jobs = [...list(after, "jobOrders"), ...list(before, "jobOrders")];
  const calendars = [...(after.directory?.calendars ?? []), ...(before.directory?.calendars ?? [])];
  const processes = [...(after.directory?.processes ?? []), ...(before.directory?.processes ?? [])];
  const processName = (calendarId: unknown) => { const calendar = calendars.find((item) => item.id === calendarId); return str(processes.find((item) => item.id === calendar?.processId)?.name) || str(calendar?.name); };
  const po = (orderId: unknown) => { const order = orders.find((item) => item.id === orderId); return order ? `${str(order.poNumber)}${order.item && Number(order.item) > 1 ? ` item ${order.item}` : ""}` : undefined; };
  // References carried by an activity: its PO, job order and batch number.
  const refs = (line: Row) => { const job = jobs.find((item) => item.id === line.jobOrderId); return { po: po(line.productionOrderId), job: job ? str(job.number) : str(line.orderReference) || undefined, batch: job?.batchNumber ? str(job.batchNumber) : undefined, product: productName(line.productId) }; };
  const what = (line: Row) => `${str(line.activityType) || processName(line.calendarId)} · ${productName(line.productId)}`;

  const customers = diff(list(before, "customers"), list(after, "customers"));
  for (const row of customers.added) changes.push({ kind: "Customer", text: `Customer ${str(row.code)} added: ${str(row.name)}` });
  for (const { before: old, after: row } of customers.changed) changes.push({ kind: "Customer", text: `Customer ${str(row.code)} changed${old.name !== row.name ? `: ${str(old.name)} → ${str(row.name)}` : ""}` });

  const orderDiff = diff(list(before, "orders"), list(after, "orders"));
  for (const row of orderDiff.added) changes.push({ kind: "PO", po: po(row.id), product: productName(row.productId), text: `PO ${po(row.id)} added: ${productName(row.productId)}, ${num(row.quantity)} ${str(row.uom)}${row.customerName ? ` for ${str(row.customerName)}` : ""}` });
  for (const row of orderDiff.removed) changes.push({ kind: "PO", po: str(row.poNumber), product: productName(row.productId), text: `PO ${str(row.poNumber)} removed (${productName(row.productId)})` });
  for (const { before: old, after: row } of orderDiff.changed) {
    const parts = [
      old.poNumber !== row.poNumber ? `PO number ${str(old.poNumber)} → ${str(row.poNumber)}` : "",
      old.customerName !== row.customerName ? `customer ${str(old.customerName) || "-"} → ${str(row.customerName)}` : "",
      old.quantity !== row.quantity ? `quantity ${num(old.quantity)} → ${num(row.quantity)} ${str(row.uom)}` : "",
      old.format !== row.format ? `dosage form ${str(old.format) || "-"} → ${str(row.format)}` : "",
      old.receivedDate !== row.receivedDate ? `PO received ${str(old.receivedDate) || "-"} → ${str(row.receivedDate) || "-"}` : "",
      (old.soNumber ?? "") !== (row.soNumber ?? "") ? `SO number ${str(old.soNumber) || "-"} → ${str(row.soNumber) || "-"}` : "",
      old.unitWeightMg !== row.unitWeightMg ? `unit weight ${num(old.unitWeightMg) || "-"} → ${num(row.unitWeightMg) || "-"} mg` : "",
      old.unitsPerPack !== row.unitsPerPack ? `units per pack ${num(old.unitsPerPack) || "-"} → ${num(row.unitsPerPack) || "-"}` : "",
      old.deliveryDate !== row.deliveryDate ? `expected delivery ${str(old.deliveryDate) || "-"} → ${str(row.deliveryDate) || "-"}` : ""
    ].filter(Boolean);
    // Closing a PO is its own entry: how much went to it, against what was ordered, and why.
    if (!old.closedAt && row.closedAt) {
      changes.push({ kind: "PO", po: po(row.id), product: productName(row.productId), text: `PO ${po(row.id)} closed at ${num(row.closedQuantity)} ${str(row.closedUom ?? row.uom)} (ordered ${num(row.quantity)} ${str(row.uom)})${row.closeNote ? `: ${str(row.closeNote)}` : ""}` });
      if (!parts.length) continue;
    }
    changes.push({ kind: "PO", po: po(row.id), product: productName(row.productId), text: `PO ${po(row.id)} edited${parts.length ? `: ${parts.join("; ")}` : ""}` });
  }

  const jobDiff = diff(list(before, "jobOrders"), list(after, "jobOrders"));
  const jobRefs = (row: Row) => ({ po: po(row.orderId), job: str(row.number), batch: row.batchNumber ? str(row.batchNumber) : undefined, product: productName(orders.find((item) => item.id === row.orderId)?.productId) });
  for (const row of jobDiff.added) changes.push({ kind: "Job order", ...jobRefs(row), text: `Job order ${str(row.number)} added to PO ${po(row.orderId) ?? "-"}: ${num(row.quantity)} ${str(row.uom)}${row.batchSizeKg ? `, batch qty ${num(row.batchSizeKg)} kg` : ""}${row.packQuantity ? `, ${num(row.packQuantity)} ${str(row.packUom)}` : ""}` });
  for (const row of jobDiff.removed) changes.push({ kind: "Job order", ...jobRefs(row), text: `Job order ${str(row.number)} removed` });
  for (const { before: old, after: row } of jobDiff.changed) {
    if (old.batchNumber !== row.batchNumber) changes.push({ kind: "Job order", ...jobRefs(row), text: row.batchNumber ? `Batch number for ${str(row.number)} set to ${str(row.batchNumber)}${old.batchNumber ? ` (was ${str(old.batchNumber)})` : ""}` : `Batch number ${str(old.batchNumber)} cleared from ${str(row.number)}` });
    const parts = [
      old.number !== row.number ? `number ${str(old.number)} → ${str(row.number)}` : "",
      old.quantity !== row.quantity || old.uom !== row.uom ? `quantity ${num(old.quantity)} ${str(old.uom)} → ${num(row.quantity)} ${str(row.uom)}` : "",
      old.batchSizeKg !== row.batchSizeKg ? `batch quantity ${num(old.batchSizeKg) || "-"} → ${num(row.batchSizeKg) || "-"} kg` : "",
      old.packQuantity !== row.packQuantity || old.packUom !== row.packUom || old.packSize !== row.packSize ? `packs ${num(row.packQuantity) || "-"} ${str(row.packUom)}${row.packSize ? ` (${num(row.packSize)} per pack)` : ""}` : ""
    ].filter(Boolean);
    if (parts.length) changes.push({ kind: "Job order", ...jobRefs(row), text: `Job order ${str(row.number)} edited: ${parts.join("; ")}` });
    // A batch shared by several POs: who joined or left it, QA's formula confirmation, release to each PO.
    type Share = { orderId: string; quantity: number };
    const sharesOf = (value: Row) => (Array.isArray(value.shares) ? value.shares : []) as Share[];
    for (const share of sharesOf(row).filter((item) => !sharesOf(old).some((was) => was.orderId === item.orderId)))
      changes.push({ kind: "Job order", ...jobRefs(row), text: `Batch ${str(row.number)} also made for PO ${po(share.orderId) ?? "-"}: ${num(share.quantity)} ${str(row.uom)}` });
    for (const share of sharesOf(old).filter((item) => !sharesOf(row).some((now) => now.orderId === item.orderId)))
      changes.push({ kind: "Job order", ...jobRefs(row), text: `PO ${po(share.orderId) ?? "-"} taken off batch ${str(row.number)}` });
    if (!old.formulaConfirmedAt && row.formulaConfirmedAt)
      changes.push({ kind: "Job order", ...jobRefs(row), text: `QA confirmed the POs sharing ${str(row.number)} are the same formula` });
    type Release = { orderId: string; quantity: number; uom: string; otherUses?: { quantity: number; note: string }[] };
    const releasesOf = (value: Row) => (Array.isArray(value.poReleases) ? value.poReleases : []) as Release[];
    for (const release of releasesOf(row).filter((item) => !releasesOf(old).some((was) => was.orderId === item.orderId)))
      changes.push({ kind: "Job order", ...jobRefs(row), text: `${str(row.number)} released to PO ${po(release.orderId) ?? "-"}: ${num(release.quantity)} ${str(release.uom)}${release.otherUses?.length ? `; also ${release.otherUses.map((use) => `${num(use.quantity)} ${str(use.note)}`).join(", ")}` : ""}` });
  }

  const lineDiff = diff(list(before, "lines"), list(after, "lines"));
  for (const row of lineDiff.added) changes.push({ kind: "Planning", ...refs(row), text: `Planned ${what(row)} on ${day(row.plannedDate)}: ${num(row.quantity)} ${str(row.uom)}` });
  for (const row of lineDiff.removed) changes.push({ kind: "Planning", ...refs(row), text: `Removed ${what(row)} planned on ${day(row.plannedDate)}` });
  for (const { before: old, after: row } of lineDiff.changed) {
    const reference = refs(row);
    if (!old.startedAt && row.startedAt) changes.push({ kind: "Production", ...reference, text: `${what(row)} started on ${day(row.startedAt)}` });
    if (!old.completedAt && row.completedAt) changes.push({ kind: "Production", ...reference, text: `${what(row)} completed on ${day(row.completedAt)}: ${num(row.yieldQuantity)} ${str(row.yieldUom) || str(row.uom)} (planned ${num(row.quantity)} ${str(row.uom)})` });
    // A completed update corrected afterwards.
    if (old.completedAt && row.completedAt) {
      const fixed = [
        day(old.completedAt) !== day(row.completedAt) ? `completed ${day(old.completedAt)} → ${day(row.completedAt)}` : "",
        old.yieldQuantity !== row.yieldQuantity || (old.yieldUom ?? old.uom) !== (row.yieldUom ?? row.uom) ? `actual ${num(old.yieldQuantity)} ${str(old.yieldUom) || str(old.uom)} → ${num(row.yieldQuantity)} ${str(row.yieldUom) || str(row.uom)}` : "",
        old.startedAt !== row.startedAt ? `started ${old.startedAt ? day(old.startedAt) : "-"} → ${row.startedAt ? day(row.startedAt) : "-"}` : ""
      ].filter(Boolean);
      if (fixed.length) changes.push({ kind: "Production", ...reference, text: `${what(row)} production update corrected: ${fixed.join("; ")}` });
    }
    if (row.progressQuantity !== undefined && !row.completedAt && (old.progressQuantity !== row.progressQuantity || old.progressUom !== row.progressUom)) changes.push({ kind: "Production", ...reference, text: `${what(row)}: ${num(row.progressQuantity)} ${str(row.progressUom) || str(row.uom)} run so far` });
    if (row.productionNotes && old.productionNotes !== row.productionNotes) changes.push({ kind: "Production", ...reference, text: `Note on ${what(row)}: ${str(row.productionNotes)}` });
    const parts = [
      old.plannedDate !== row.plannedDate ? `moved ${day(old.plannedDate)} → ${day(row.plannedDate)}` : "",
      old.quantity !== row.quantity || old.uom !== row.uom ? `quantity ${num(old.quantity)} ${str(old.uom)} → ${num(row.quantity)} ${str(row.uom)}` : "",
      old.priority !== row.priority ? `priority ${str(old.priority)} → ${str(row.priority)}` : "",
      old.jobOrderId !== row.jobOrderId ? `linked to job order ${reference.job ?? "-"}` : "",
      old.notes !== row.notes ? "remarks changed" : ""
    ].filter(Boolean);
    if (parts.length) changes.push({ kind: "Planning", ...reference, text: `${what(row)}: ${parts.join("; ")}` });
  }

  const transferDiff = diff(list(before, "transfers"), list(after, "transfers"));
  const lines = [...list(after, "lines"), ...list(before, "lines")];
  for (const row of transferDiff.added) {
    const source = lines.find((item) => item.id === row.sourceLineId);
    changes.push({ kind: "Transfer", ...(source ? refs(source) : { product: productName(row.productId) }), text: `${num(row.quantity)} ${str(row.uom)} from ${processName(row.sourceCalendarId)} ${row.wipRoom ? "to the WIP room for" : "transferred to"} ${processName(row.calendarId)}${row.notes ? ` (${str(row.notes)})` : ""}` });
  }
  for (const { before: old, after: row } of transferDiff.changed) {
    const source = lines.find((item) => item.id === row.sourceLineId);
    if (!old.receivedAt && row.receivedAt) changes.push({ kind: "Transfer", ...(source ? refs(source) : { product: productName(row.productId) }), text: `${processName(row.calendarId)} received ${num(row.quantity)} ${str(row.uom)} from ${processName(row.sourceCalendarId)}` });
    if (old.calendarId !== row.calendarId || !!old.wipRoom !== !!row.wipRoom || old.quantity !== row.quantity || old.uom !== row.uom) changes.push({ kind: "Transfer", ...(source ? refs(source) : { product: productName(row.productId) }), text: `Handover from ${processName(row.sourceCalendarId)} corrected: ${num(row.quantity)} ${str(row.uom)} ${row.wipRoom ? "to the WIP room for" : "to"} ${processName(row.calendarId)}` });
  }
  for (const row of transferDiff.removed) {
    const source = lines.find((item) => item.id === row.sourceLineId);
    changes.push({ kind: "Transfer", ...(source ? refs(source) : { product: productName(row.productId) }), text: `Handover of ${num(row.quantity)} ${str(row.uom)} from ${processName(row.sourceCalendarId)} to ${processName(row.calendarId)} withdrawn` });
  }

  const entryDiff = diff(list(before, "entries"), list(after, "entries"));
  const bookings = entryDiff.added.length + entryDiff.changed.length + entryDiff.removed.length;
  if (bookings) changes.push({ kind: "Machine booking", text: `Machine bookings: ${[entryDiff.added.length ? `${entryDiff.added.length} added` : "", entryDiff.changed.length ? `${entryDiff.changed.length} changed` : "", entryDiff.removed.length ? `${entryDiff.removed.length} removed` : ""].filter(Boolean).join(", ")}` });

  const setup = (["directory", "products", "workCentres", "machines", "measurements"] as const).filter((key) => !same(before[key], after[key]));
  if (setup.length) changes.push({ kind: "Setup", text: `Setup changed: ${setup.map((key) => ({ directory: "units, processes and people", products: "products", workCentres: "work centres", machines: "machines", measurements: "units of measure" })[key]).join(", ")}` });
  // QA's yield limits: each range that changed, by process name, e.g. "Capsulation 97.0–101.0% (was none)".
  type Range = { min?: number; max?: number };
  const limitsOf = (value: Snapshot) => ((value as unknown as { yieldLimits?: { byProcess?: Record<string, Range>; final?: Range } }).yieldLimits ?? {});
  const rangeText = (range?: Range) => !range || (range.min === undefined && range.max === undefined) ? "none" : `${range.min !== undefined ? range.min.toFixed(1) : "…"}–${range.max !== undefined ? range.max.toFixed(1) : "…"}%`;
  const oldLimits = limitsOf(before), newLimits = limitsOf(after);
  const processNames = new Map(((after as unknown as { directory?: { processes?: { id: string; name: string }[] } }).directory?.processes ?? []).map((item) => [item.id, item.name]));
  const limitChanges = [...new Set([...Object.keys(oldLimits.byProcess ?? {}), ...Object.keys(newLimits.byProcess ?? {})])]
    .filter((key) => rangeText(oldLimits.byProcess?.[key]) !== rangeText(newLimits.byProcess?.[key]))
    .map((key) => `${processNames.get(key) ?? "A process"} ${rangeText(newLimits.byProcess?.[key])} (was ${rangeText(oldLimits.byProcess?.[key])})`);
  if (rangeText(oldLimits.final) !== rangeText(newLimits.final)) limitChanges.push(`final yield ${rangeText(newLimits.final)} (was ${rangeText(oldLimits.final)})`);
  if (limitChanges.length) changes.push({ kind: "Setup", text: `Yield limits set: ${limitChanges.join("; ")}` });
  return changes;
}

// Versions oldest first: entry N describes going from version N-1 to version N.
export function buildHistory(versions: { revision: number; snapshot: unknown }[], audit: Map<number, { at: string; by: string }>, savedAt: Map<number, string>): HistoryEntry[] {
  const sorted = [...versions].sort((a, b) => a.revision - b.revision);
  const entries: HistoryEntry[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const { revision, snapshot } = sorted[index];
    const changes = describeChanges(sorted[index - 1].snapshot as Snapshot, snapshot as Snapshot);
    if (!changes.length) continue;
    const who = audit.get(revision);
    entries.push({ revision, at: who?.at ?? savedAt.get(revision - 1) ?? "", by: who?.by ?? "Not recorded", changes });
  }
  return entries.reverse();
}
