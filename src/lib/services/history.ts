/**
 * Readable transaction history: each saved version of the workspace compared with the one before,
 * described as the changes people made (POs, job orders, planning, production, transfers), each
 * carrying the PO, job order and batch number it concerns so a batch can be traced end to end.
 * Snapshots are read loosely: versions saved before a field existed still describe correctly.
 */
type Row = Record<string, unknown> & { id?: string };
type Snapshot = { products?: Row[]; directory?: { calendars?: Row[]; processes?: Row[]; units?: Row[] }; data?: Record<string, Row[] | undefined> } & Record<string, unknown>;

export type HistoryKind = "PO" | "Customer" | "Job order" | "Planning" | "Production" | "Transfer" | "Machine booking" | "Setup";
export type HistoryChange = { kind: HistoryKind; text: string; po?: string; job?: string; batch?: string; product?: string };
export type HistoryEntry = { revision: number; at: string; by: string; changes: HistoryChange[] };

const list = (snapshot: Snapshot, key: string) => (snapshot.data?.[key] ?? []) as Row[];
const str = (value: unknown) => typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
const num = (value: unknown) => typeof value === "number" ? value.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : str(value);
const day = (value: unknown) => { const text = str(value); return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10).split("-").reverse().join("-") : text; };
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
      old.format !== row.format ? `format ${str(old.format) || "-"} → ${str(row.format)}` : "",
      !same(old.expectedDates, row.expectedDates) ? "expected completion dates updated" : ""
    ].filter(Boolean);
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
  }

  const lineDiff = diff(list(before, "lines"), list(after, "lines"));
  for (const row of lineDiff.added) changes.push({ kind: "Planning", ...refs(row), text: `Planned ${what(row)} on ${day(row.plannedDate)}: ${num(row.quantity)} ${str(row.uom)}` });
  for (const row of lineDiff.removed) changes.push({ kind: "Planning", ...refs(row), text: `Removed ${what(row)} planned on ${day(row.plannedDate)}` });
  for (const { before: old, after: row } of lineDiff.changed) {
    const reference = refs(row);
    if (!old.startedAt && row.startedAt) changes.push({ kind: "Production", ...reference, text: `${what(row)} started on ${day(row.startedAt)}` });
    if (!old.completedAt && row.completedAt) changes.push({ kind: "Production", ...reference, text: `${what(row)} completed on ${day(row.completedAt)}: ${num(row.yieldQuantity)} ${str(row.yieldUom) || str(row.uom)} (planned ${num(row.quantity)} ${str(row.uom)})` });
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
  }

  const entryDiff = diff(list(before, "entries"), list(after, "entries"));
  const bookings = entryDiff.added.length + entryDiff.changed.length + entryDiff.removed.length;
  if (bookings) changes.push({ kind: "Machine booking", text: `Machine bookings: ${[entryDiff.added.length ? `${entryDiff.added.length} added` : "", entryDiff.changed.length ? `${entryDiff.changed.length} changed` : "", entryDiff.removed.length ? `${entryDiff.removed.length} removed` : ""].filter(Boolean).join(", ")}` });

  const setup = (["directory", "products", "workCentres", "machines", "measurements"] as const).filter((key) => !same(before[key], after[key]));
  if (setup.length) changes.push({ kind: "Setup", text: `Setup changed: ${setup.map((key) => ({ directory: "units, processes and people", products: "products", workCentres: "work centres", machines: "machines", measurements: "units of measure" })[key]).join(", ")}` });
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
