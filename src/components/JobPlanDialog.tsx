"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { priorities, type Machine, type PlanLine, type Product, type ScheduleEntry } from "@/lib/domain/types";
import { batchKilograms } from "@/lib/services/measurements";
import { poLabel, type PurchaseOrder } from "@/lib/services/orders";
import { linesForJob, measureName, processQuantity, type JobOrder } from "@/lib/services/jobOrders";
import { routeDrafts } from "@/lib/services/planChanges";
import { inferFormat, routeLabel, stepOf } from "@/lib/services/processRules";

// One row per process of the job order's route. In edit mode a row may already have its activity.
// Quantity and UOM are the job order's theoretical figure for the process (blank when not keyed in).
export type PlanRow = { key: string; label: string; calendarId?: string; date: string; quantity: string; uom: string; on: boolean; lineId?: string; locked?: boolean; machineId: string };
// What planning sends back: the rows to plan (or keep), with the activity type and kilograms worked out.
// machineId "" means no machine booked for that process yet.
export type PlannedRow = { calendarId: string; lineId?: string; on: boolean; activityType: string; plannedDate: string; quantity: number; uom: string; batchSizeKg?: number; machineId: string };
export type PlanRequest = { mode: "new"; date: string; calendarId?: string; jobId?: string; nonce: number } | { mode: "edit"; jobId: string; nonce: number };
export type JobPlan = { jobId: string; rows: PlannedRow[]; batchNumber: string; priority: PlanLine["priority"]; notes: string };

const shift = (rows: PlanRow[], index: number, value: string, nextDates: string[]) =>
  rows.map((row, position) => position < index ? row : { ...row, date: position === index ? value : nextDates[position - index] ?? row.date });

/**
 * Plan a job order in one go: choose a job order not planned yet, key in its batch number and set
 * every process of its route: the date and the machine. Each process's quantity is the job order's
 * theoretical figure for it and cannot be changed here. Opened with an edit request, it shows a
 * planned job order's activities instead, to correct them; completed processes stay locked.
 */
export function JobPlanDialog({ request, jobOrders, orders, products, calendars, processNames, lines, machines = [], entries = [], onPlan, onDone }: {
  request: PlanRequest | null; jobOrders: JobOrder[]; orders: PurchaseOrder[]; products: Product[]; calendars: UnitCalendar[];
  processNames: Record<string, string>;
  // The unit's machines, and bookings, to choose and show each process's machine.
  machines?: Machine[]; entries?: ScheduleEntry[];
  // Every activity, so a job order planned in any process counts as planned.
  lines: PlanLine[];
  onPlan: (plan: JobPlan, mode: "new" | "edit") => { error: string } | { message: string };
  onDone: (message: string, firstDate: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobId, setJobId] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [start, setStart] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [priority, setPriority] = useState<PlanLine["priority"]>("Normal");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const editing = request?.mode === "edit";
  const job = jobOrders.find((item) => item.id === jobId);
  const order = orders.find((item) => item.id === job?.orderId);
  const product = products.find((item) => item.id === order?.productId);
  const format = order ? order.format ?? inferFormat(product) : "Other";
  const nameOf = (calendarId: string) => processNames[calendarId] ?? calendars.find((item) => item.id === calendarId)?.name ?? "";
  // Only job orders not planned yet, of POs made in this unit, can be chosen, so none is planned twice by mistake.
  const unitId = calendars[0]?.unitId;
  const choices = jobOrders.filter((item) => !linesForJob(item.id, lines).length && inUnit(item, orders, unitId));
  const machinesFor = (calendarId?: string) => { const calendar = calendars.find((item) => item.id === calendarId); return calendar ? machines.filter((machine) => machine.active === "Active" && machine.unitId === calendar.unitId && machine.processIds?.includes(calendar.processId)) : []; };
  const bookedMachine = (lineId?: string) => entries.find((entry) => entry.planLineId === lineId && entry.status !== "Cancelled")?.machineId ?? "";

  // Each process carries the job order's theoretical quantity for it: dispensing the batch size,
  // compression, coating and capsulation the batch quantity, filling the packs, packing the boxes.
  function defaults(chosen: JobOrder, step: string): [string, string] {
    const value = stepOf(step) ? processQuantity(chosen, stepOf(step)!) : { quantity: chosen.quantity, uom: chosen.uom };
    return value ? [String(value.quantity), value.uom] : ["", ""];
  }
  function rowsFor(chosen: JobOrder, from: string): PlanRow[] {
    const chosenOrder = orders.find((item) => item.id === chosen.orderId);
    const chosenFormat = chosenOrder ? chosenOrder.format ?? inferFormat(products.find((item) => item.id === chosenOrder.productId)) : "Other";
    const drafts = routeDrafts(chosenFormat, calendars, nameOf, from);
    // No fixed route (format Other): one process, chosen in the row.
    const machineFor = (calendarId?: string) => { const options = machinesFor(calendarId); return options.length === 1 ? options[0].id : ""; };
    if (!drafts.length) return [{ key: "single", label: "Process", calendarId: calendars[0]?.id, date: from, quantity: String(chosen.quantity), uom: chosen.uom, on: true, machineId: machineFor(calendars[0]?.id) }];
    return drafts.map((draft) => { const [quantity, uom] = defaults(chosen, draft.step); return { key: draft.step, label: draft.label, calendarId: draft.calendarId, date: draft.date, quantity, uom, on: !!draft.calendarId, machineId: machineFor(draft.calendarId) }; });
  }
  // Edit mode: the route's rows filled from the job order's activities; other activities added after.
  function rowsFromPlan(chosen: JobOrder): PlanRow[] {
    const planned = linesForJob(chosen.id, lines).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const base = rowsFor(chosen, planned[0]?.plannedDate ?? new Date().toISOString().slice(0, 10)).filter((row) => row.key !== "single");
    const used = new Set<string>();
    // Open activities show the job order's figure (saving brings them in line); completed ones what they ran.
    const fromLine = (line: PlanLine, row?: PlanRow): PlanRow => ({ key: row?.key ?? line.id, label: row?.label ?? nameOf(line.calendarId ?? ""), calendarId: line.calendarId, date: line.plannedDate,
      quantity: line.completedAt || !row ? String(line.quantity) : row.quantity, uom: line.completedAt || !row ? line.uom ?? chosen.uom : row.uom, on: true, lineId: line.id, locked: !!line.completedAt, machineId: bookedMachine(line.id) });
    const merged = base.map((row) => {
      const line = planned.find((item) => item.calendarId === row.calendarId && !used.has(item.id));
      if (!line) return { ...row, on: false };
      used.add(line.id);
      return fromLine(line, row);
    });
    return [...merged, ...planned.filter((line) => !used.has(line.id)).map((line) => fromLine(line))];
  }

  useEffect(() => {
    if (!request) return;
    setError(""); setNotes("");
    if (request.mode === "edit") {
      const chosen = jobOrders.find((item) => item.id === request.jobId);
      if (!chosen) return;
      const planned = linesForJob(chosen.id, lines);
      setJobId(chosen.id); setRows(rowsFromPlan(chosen)); setStart(planned.map((line) => line.plannedDate).sort()[0] ?? "");
      setBatchNumber(chosen.batchNumber ?? ""); setPriority(planned[0]?.priority ?? "Normal");
    } else {
      const chosen = request.jobId ? jobOrders.find((item) => item.id === request.jobId) : undefined;
      setJobId(chosen?.id ?? ""); setRows(chosen ? rowsFor(chosen, request.date) : []); setStart(request.date); setBatchNumber(chosen?.batchNumber ?? ""); setPriority("Normal");
    }
    dialog.current?.showModal();
    // Opens once per request; later data changes must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  function choose(id: string) {
    const chosen = jobOrders.find((item) => item.id === id);
    setJobId(id); setError("");
    setRows(chosen ? rowsFor(chosen, start) : []);
    setBatchNumber(chosen?.batchNumber ?? "");
  }
  const update = (index: number, change: Partial<PlanRow>) => setRows((current) => current.map((row, position) => position === index ? { ...row, ...change } : row));
  // Kilograms for a row: weights convert directly; the product's own unit scales the job order's batch kg.
  const kilograms = (quantity: number, uom: string) => batchKilograms(quantity, uom) ?? (job?.batchSizeKg && uom === job.uom && job.quantity ? Number((job.batchSizeKg * quantity / job.quantity).toPrecision(6)) : undefined);
  const ticked = rows.filter((row) => row.on && row.calendarId);

  return <dialog ref={dialog} className={`activity-dialog${job ? " activity-dialog-wide" : ""}`} aria-labelledby="job-plan-title">
    <form className="form-panel" onSubmit={(event) => {
      event.preventDefault();
      if (!job) { setError("Choose the job order to plan."); return; }
      if (!editing && !ticked.length) { setError("Tick at least one process to plan."); return; }
      const unset = rows.find((row) => row.on && row.calendarId && !row.locked && (!(Number(row.quantity) > 0) || !row.uom));
      if (unset) { const step = stepOf(unset.key); setError(`${job.number} has no ${step ? measureName(step) : "quantity"} for ${unset.calendarId ? nameOf(unset.calendarId) : unset.label}. Key it in on the job order (Orders tab) first.`); return; }
      const bad = rows.find((row) => row.on && row.calendarId && !row.locked && !/^\d{4}-\d{2}-\d{2}$/.test(row.date));
      if (bad) { setError(`Choose a date for ${bad.calendarId ? nameOf(bad.calendarId) : bad.label}.`); return; }
      const planned: PlannedRow[] = rows.filter((row) => row.calendarId && (row.on || row.lineId)).map((row) => {
        const quantity = Number(row.quantity);
        return { calendarId: row.calendarId!, lineId: row.lineId, on: row.on, activityType: nameOf(row.calendarId!), plannedDate: row.date, quantity, uom: row.uom, batchSizeKg: kilograms(quantity, row.uom), machineId: row.machineId };
      });
      const result = onPlan({ jobId: job.id, rows: planned, batchNumber, priority, notes }, editing ? "edit" : "new");
      if ("error" in result) { setError(result.error); return; }
      dialog.current?.close();
      onDone(result.message, planned.filter((row) => row.on).map((row) => row.plannedDate).sort()[0] ?? start);
    }}>
      <div className="panel-title"><h2 id="job-plan-title">{editing ? `Edit planning · ${job?.number ?? ""}` : "Production Planning"}</h2><button className="icon-button" type="button" aria-label="Close" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {editing ? null : choices.length || job ? <label>Job order<select required value={jobId} onChange={(event) => choose(event.target.value)}>
        <option value="" disabled>Choose a job order to plan</option>
        {(job && !choices.includes(job) ? [job, ...choices] : choices).map((item) => { const itemOrder = orders.find((entry) => entry.id === item.orderId); return <option key={item.id} value={item.id}>{item.number} · {products.find((entry) => entry.id === itemOrder?.productId)?.name ?? "Unknown product"} · {item.quantity.toLocaleString()} {item.uom}{itemOrder ? ` · ${itemOrder.poNumber}` : ""}</option>; })}
      </select></label> : <p role="alert">No job order of this unit is waiting to be planned. Add job orders to a PO on the Orders tab first; to change a planned one, open one of its activities and choose “Edit job order planning”.</p>}
      {job && order ? <>
        <p className="orders-help">{product?.name ?? "Unknown product"} · PO <strong>{poLabel(order, orders)}</strong>{order.customerName ? ` · ${order.customerName}` : ""} · {job.quantity.toLocaleString()} {job.uom}{job.batchSizeKg ? ` · ${job.batchSizeKg.toLocaleString()} kg` : ""}{job.packQuantity ? ` · ${job.packQuantity.toLocaleString()} ${job.packUom}` : ""}</p>
        <label>Batch number<input maxLength={60} autoComplete="off" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder={`Batch number for ${job.number}`} /></label>
        <div className="route-plan">
          <p className="orders-help">{format === "Other" ? "No fixed route for this dosage form: choose the process." : `${format}: ${routeLabel(format)}.`} {editing ? "Correct any date or machine; untick to remove an activity, tick to add a missed process. Completed processes are locked." : "One working day each, starting from the first process's date; change any date and the later processes follow."} Theoretical quantities come from the job order; production keys in the actual quantity when it completes each process.</p>
          <div className="route-plan-scroll"><table className="route-plan-table"><thead><tr><th scope="col">Plan</th><th scope="col">Process</th><th scope="col">Date planned</th><th scope="col">Machine</th><th scope="col" className="numeric">Theoretical quantity</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.key} className={row.calendarId ? undefined : "route-missing"}>
              <td><input type="checkbox" aria-label={`Plan ${row.label}`} disabled={!row.calendarId || row.locked} checked={row.on} onChange={(event) => update(index, { on: event.target.checked })} /></td>
              <td>{row.key === "single" ? <select aria-label="Process" value={row.calendarId ?? ""} onChange={(event) => update(index, { calendarId: event.target.value })}>{calendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                : <>{row.calendarId ? nameOf(row.calendarId) : row.label}{!row.calendarId ? <small>Not set up in this unit (or filtered out)</small> : row.locked ? <small>Completed: locked</small> : row.lineId && !row.on ? <small>Will be removed</small> : null}</>}</td>
              <td>{row.calendarId ? <input type="date" aria-label={`${row.label} date`} disabled={row.locked || !row.on} value={row.date} onChange={(event) => {
                // Later processes follow on the working days after, so the route keeps its order.
                const value = event.target.value;
                const next = routeDrafts(format, calendars, nameOf, value).map((draft) => draft.date);
                setRows((current) => editing ? current.map((item, position) => position === index ? { ...item, date: value } : item) : shift(current, index, value, next));
              }} /> : "-"}</td>
              <td>{row.calendarId ? (() => {
                const options = machinesFor(row.calendarId);
                const current = row.machineId && !options.some((machine) => machine.id === row.machineId) ? machines.find((machine) => machine.id === row.machineId) : undefined;
                return <select aria-label={`${row.label} machine`} disabled={row.locked || !row.on} value={row.machineId} onChange={(event) => update(index, { machineId: event.target.value })}>
                  <option value="">{options.length ? "Choose later" : "No machine set up"}</option>
                  {[...(current ? [current] : []), ...options].map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                </select>;
              })() : null}</td>
              <td className="numeric">{row.calendarId ? row.quantity ? <output aria-label={`${row.label} theoretical quantity`}>{Number(row.quantity).toLocaleString("en-MY", { maximumFractionDigits: 3 })} {row.uom}</output>
                : <small className="order-warning">No {stepOf(row.key) ? measureName(stepOf(row.key)!) : "quantity"} on the job order</small> : null}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
        <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as PlanLine["priority"])}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        {editing ? null : <label>Remarks<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>}
      </> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={!job}><Plus size={17} />{editing ? "Save planning" : job ? `Plan ${ticked.length} process${ticked.length === 1 ? "" : "es"}` : "Plan"}</button>
    </form>
  </dialog>;
}

// A job order belongs on this unit's board when its PO is made here (or says no unit, from before units were chosen).
export function inUnit(job: JobOrder, orders: PurchaseOrder[], unitId?: string) {
  const order = orders.find((item) => item.id === job.orderId);
  return !!order && (!order.unitId || !unitId || order.unitId === unitId);
}
