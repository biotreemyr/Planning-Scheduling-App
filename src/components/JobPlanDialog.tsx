"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Maximize2, Minus, Plus, Square, X } from "lucide-react";
import { useFloatingWindow } from "./useFloatingWindow";
import { useDateCheck } from "./DateCheck";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { isShared, jobForOrder, jobParts, perOrderSource, shortYield } from "@/lib/services/sharedJobs";
import { MachinePicker } from "./MachinePicker";
import { bookedMachineIds } from "@/lib/services/machines";
import { priorities, type Machine, type PlanLine, type Product, type ScheduleEntry } from "@/lib/domain/types";
import { batchKilograms } from "@/lib/services/measurements";
import { poLabel, type PurchaseOrder } from "@/lib/services/orders";
import { linesForJob, measureName, processQuantity, type JobOrder } from "@/lib/services/jobOrders";
import { routeDrafts } from "@/lib/services/planChanges";
import { inferFormat } from "@/lib/services/processRules";
import { defaultSettings, type PlannedSource, type ProcessSettings } from "@/lib/services/processSetup";
import { dayStatus, isWorkingDay, nextWorkingDay, shortDay, spanDays, workingCalendar, type WorkingCalendar } from "@/lib/services/workingDays";

// One row per process of the job order's route. In edit mode a row may already have its activity.
// Quantity and UOM are the job order's theoretical figure for the process (blank when not keyed in).
// multiDay: the process runs over several days, until endDate; unticked, it takes its one day only.
export type PlanRow = { key: string; label: string; calendarId?: string; date: string; multiDay?: boolean; endDate?: string; quantity: string; uom: string; on: boolean; lineId?: string; locked?: boolean; machineIds: string[]; planned?: PlannedSource;
  // A shared batch's filling and packing rows are for one PO each.
  orderId?: string };
// What planning sends back: the rows to plan (or keep), with the activity type and kilograms worked out.
// machineIds empty means no machine booked for that process yet; a bottle line books several.
export type PlannedRow = { calendarId: string; lineId?: string; on: boolean; activityType: string; plannedDate: string; endDate?: string; quantity: number; uom: string; batchSizeKg?: number; machineIds: string[]; orderId?: string };
export type PlanRequest = { mode: "new"; date: string; calendarId?: string; jobId?: string; nonce: number } | { mode: "edit"; jobId: string; nonce: number };
// pastReason: why a date before today was chosen, kept on the activities planned in the past.
// correctionReason: why the planned date of a completed process is changed (required for that).
export type JobPlan = { jobId: string; rows: PlannedRow[]; batchNumber: string; priority: PlanLine["priority"]; notes: string; pastReason?: string; correctionReason?: string };

const dayMs = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / dayMs);
// A date moved by a number of days (calendar days, as a several-day activity keeps its length).
function addDays(date: string, days: number) { return new Date((dayNumber(date) + days) * dayMs).toISOString().slice(0, 10); }
// The last day a ticked process takes: its end date when it runs over several days.
const lastDay = (row: PlanRow) => row.multiDay && row.endDate && row.endDate > row.date ? row.endDate : row.date;
// A row given a new start date: a several-day process keeps its length, so its end date moves too.
function startOn(row: PlanRow, date: string): PlanRow {
  if (!row.multiDay || !row.endDate || !row.date || !date || row.date === date) return { ...row, date };
  return { ...row, date, endDate: addDays(row.endDate, dayNumber(date) - dayNumber(row.date)) };
}
/**
 * New plans: row `from` was just changed (date picked, or ticked). A ticked process after it keeps
 * its date when that is on or after the ticked process before it, so several processes can share a
 * day; it moves to the next working day after that process only when it would otherwise come before
 * it. A ticked process with no date yet takes the next working day after the one before it, or
 * `start` (the day the plan was opened for, or the next working day when that is off) when it is the
 * first. An unticked process has no date and takes no day. Rows before `from`, and completed (locked)
 * rows, stay. A process over several days counts from its last day, and keeps its length when it
 * moves. Working days are the unit's (`work`): its week, public holidays and days opened or closed.
 */
export function reflow(rows: PlanRow[], from: number, start = "", work: WorkingCalendar = workingCalendar(undefined)) {
  const before = [...rows.slice(0, from)].reverse().find((row) => row.on && row.calendarId && row.date);
  let last = before ? lastDay(before) : undefined;
  return rows.map((row, position) => {
    if (position < from) return row;
    if (!row.on || !row.calendarId) return row.locked ? row : { ...row, date: "" };
    const keeps = row.locked || (position === from && row.date) || (row.date && (!last || row.date >= last));
    const moved = keeps ? row : startOn(row, last ? nextWorkingDay(work, last) : start && !isWorkingDay(work, start) ? nextWorkingDay(work, start) : start);
    last = moved.date ? lastDay(moved) : last;
    return moved;
  });
}

/**
 * Plan a job order in one go: choose a job order not planned yet, key in its batch number and set
 * every process of its route: the date and the machine. Each process's quantity is the job order's
 * theoretical figure for it and cannot be changed here. Opened with an edit request, it shows a
 * planned job order's activities instead, to correct them; completed processes stay locked.
 */
export function JobPlanDialog({ workDays = workingCalendar(undefined), onOpenDay, request, jobOrders, orders, products, calendars, processNames, processSettings = {}, lines, machines = [], entries = [], onPlan, onDone }: {
  request: PlanRequest | null; jobOrders: JobOrder[]; orders: PurchaseOrder[]; products: Product[]; calendars: UnitCalendar[];
  processNames: Record<string, string>;
  // Each process's settings from Admin (route membership and the job order figure it plans with).
  processSettings?: Record<string, ProcessSettings>;
  // The unit's machines, and bookings, to choose and show each process's machine.
  machines?: Machine[]; entries?: ScheduleEntry[];
  // Every activity, so a job order planned in any process counts as planned.
  lines: PlanLine[];
  onPlan: (plan: JobPlan, mode: "new" | "edit") => { error: string } | { message: string };
  onDone: (message: string, firstDate: string) => void;
  // The unit's working days, and opening an off day for overtime (when this person may).
  workDays?: WorkingCalendar;
  onOpenDay?: (date: string, reason: string) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [jobId, setJobId] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [start, setStart] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [priority, setPriority] = useState<PlanLine["priority"]>("Normal");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  // An off day being opened for overtime from here: the day, and the reason being typed.
  const [opening, setOpening] = useState<{ date: string; reason: string } | null>(null);
  const checkDates = useDateCheck();
  // A floating window: dragged by its title bar, minimised to it, left where it was put.
  const { minimised, setMinimised, maximised, setMaximised, barProps, open, style } = useFloatingWindow(dialog);
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
  const bookedMachine = (lineId?: string) => bookedMachineIds(entries, lineId);

  // Each process carries the job order's theoretical quantity for it: dispensing the batch size,
  // compression, coating and capsulation the batch quantity, filling the packs, packing the boxes.
  const settingsOf = (calendarId: string) => processSettings[calendarId] ?? defaultSettings(nameOf(calendarId));
  function defaults(chosen: JobOrder, planned?: PlannedSource): [string, string] {
    const value = planned ? processQuantity(chosen, planned) : { quantity: chosen.quantity, uom: chosen.uom };
    return value ? [String(value.quantity), value.uom] : ["", ""];
  }
  function rowsFor(chosen: JobOrder, from: string): PlanRow[] {
    const chosenOrder = orders.find((item) => item.id === chosen.orderId);
    const chosenFormat = chosenOrder ? chosenOrder.format ?? inferFormat(products.find((item) => item.id === chosenOrder.productId)) : "Other";
    const drafts = routeDrafts(chosenFormat, calendars, nameOf, from, settingsOf);
    // No fixed route (format Other): one process, chosen in the row.
    const machineFor = (calendarId?: string) => { const options = machinesFor(calendarId); return options.length === 1 ? [options[0].id] : []; };
    if (!drafts.length) return [{ key: "single", label: "Process", calendarId: calendars[0]?.id, date: from, quantity: String(chosen.quantity), uom: chosen.uom, on: true, machineIds: machineFor(calendars[0]?.id) }];
    // A batch shared with other POs is made once; its filling and packing are done for each PO.
    return drafts.flatMap((draft) => {
      const parts = isShared(chosen) && draft.planned && perOrderSource(draft.planned) ? jobParts(chosen) : [undefined];
      return parts.map((part) => {
        const [quantity, uom] = defaults(part ? jobForOrder(chosen, part.orderId) : chosen, draft.planned);
        const po = part ? orders.find((item) => item.id === part.orderId)?.poNumber ?? "PO" : "";
        return { key: part ? `${draft.key}:${part.orderId}` : draft.key, label: part ? `${draft.label} · ${po}` : draft.label, calendarId: draft.calendarId, date: draft.date, quantity, uom, on: false, machineIds: machineFor(draft.calendarId), planned: draft.planned, ...(part ? { orderId: part.orderId } : {}) };
      });
    });
  }
  // Edit mode: the route's rows filled from the job order's activities; other activities added after.
  function rowsFromPlan(chosen: JobOrder): PlanRow[] {
    const planned = linesForJob(chosen.id, lines).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const base = rowsFor(chosen, planned[0]?.plannedDate ?? new Date().toISOString().slice(0, 10)).filter((row) => row.key !== "single");
    const used = new Set<string>();
    // Open activities show the job order's figure (saving brings them in line); completed ones what they ran.
    const fromLine = (line: PlanLine, row?: PlanRow): PlanRow => ({ key: row?.key ?? line.id, label: row?.label ?? nameOf(line.calendarId ?? ""), calendarId: line.calendarId, date: line.plannedDate, multiDay: !!line.endDate, endDate: line.endDate ?? "",
      quantity: line.completedAt || !row ? String(line.quantity) : row.quantity, uom: line.completedAt || !row ? line.uom ?? chosen.uom : row.uom, on: true, lineId: line.id, locked: !!line.completedAt, machineIds: bookedMachine(line.id),
      ...(row?.orderId ? { orderId: row.orderId } : isShared(chosen) && line.productionOrderId !== chosen.orderId ? { orderId: line.productionOrderId } : {}) });
    const merged = base.map((row) => {
      const line = planned.find((item) => item.calendarId === row.calendarId && !used.has(item.id) && (!row.orderId || item.productionOrderId === row.orderId));
      if (!line) return { ...row, on: false };
      used.add(line.id);
      return fromLine(line, row);
    });
    return [...merged, ...planned.filter((line) => !used.has(line.id)).map((line) => fromLine(line))];
  }

  useEffect(() => {
    if (!request) return;
    // A day clicked on the calendar while a plan is being keyed in brings the window back, keeping it.
    if (request.mode !== "edit" && !request.jobId && dialog.current?.open && jobId) { setMinimised(false); return; }
    setError(""); setNotes(""); setMinimised(false); setOpening(null);
    if (request.mode === "edit") {
      const chosen = jobOrders.find((item) => item.id === request.jobId);
      if (!chosen) return;
      const planned = linesForJob(chosen.id, lines);
      setJobId(chosen.id); setRows(rowsFromPlan(chosen)); setStart(planned.map((line) => line.plannedDate).sort()[0] ?? "");
      setBatchNumber(chosen.batchNumber ?? ""); setPriority(planned[0]?.priority ?? "Normal");
    } else {
      const chosen = request.jobId ? jobOrders.find((item) => item.id === request.jobId) : undefined;
      setJobId(chosen?.id ?? ""); setRows(chosen ? reflow(rowsFor(chosen, request.date), 0, request.date, workDays) : []); setStart(request.date); setBatchNumber(chosen?.batchNumber ?? ""); setPriority("Normal");
    }
    if (!dialog.current?.open) dialog.current?.show();
    open(1120);
    // Opens once per request; later data changes must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  function choose(id: string) {
    const chosen = jobOrders.find((item) => item.id === id);
    setJobId(id); setError("");
    setRows(chosen ? reflow(rowsFor(chosen, start), 0, start, workDays) : []);
    setBatchNumber(chosen?.batchNumber ?? "");
  }
  const update = (index: number, change: Partial<PlanRow>) => setRows((current) => current.map((row, position) => position === index ? { ...row, ...change } : row));
  // Kilograms for a row: weights convert directly; the product's own unit scales the job order's batch kg.
  const kilograms = (quantity: number, uom: string) => batchKilograms(quantity, uom) ?? (job?.batchSizeKg && uom === job.uom && job.quantity ? Number((job.batchSizeKg * quantity / job.quantity).toPrecision(6)) : undefined);
  const ticked = rows.filter((row) => row.on && row.calendarId);
  // A shared batch that made less than planned: the PO due first keeps its share, the next takes what is left.
  const short = job ? shortYield(job, lines, orders, (calendarId) => settingsOf(calendarId ?? "").planned) : undefined;

  return <dialog ref={dialog} className={`activity-dialog plan-window${job ? " activity-dialog-wide" : ""}${minimised ? " minimised" : ""}${maximised ? " maximised" : ""}`} aria-labelledby="job-plan-title"
    style={style} onKeyDown={(event) => { if (event.key === "Escape" && !minimised) { event.stopPropagation(); setMinimised(true); } }}>
    <form className="form-panel" onSubmit={(event) => {
      event.preventDefault();
      if (!job) { setError("Choose the job order to plan."); return; }
      if (!editing && !ticked.length) { setError("Tick at least one process to plan."); return; }
      const unset = rows.find((row) => row.on && row.calendarId && !row.locked && (!(Number(row.quantity) > 0) || !row.uom));
      if (unset) { setError(`${job.number} has no ${unset.planned ? measureName(unset.planned) : "quantity"} for ${unset.calendarId ? nameOf(unset.calendarId) : unset.label}. Key it in on the job order (Orders tab) first.`); return; }
      const bad = rows.find((row) => row.on && row.calendarId && !/^\d{4}-\d{2}-\d{2}$/.test(row.date));
      if (bad) { setError(`Choose a date for ${bad.calendarId ? nameOf(bad.calendarId) : bad.label}.`); return; }
      const noEnd = rows.find((row) => row.on && row.calendarId && row.multiDay && !(/^\d{4}-\d{2}-\d{2}$/.test(row.endDate ?? "") && row.endDate! > row.date));
      const offStart = rows.find((row) => row.on && row.calendarId && !row.locked && row.date && !isWorkingDay(workDays, row.date));
      if (offStart) { const status = dayStatus(workDays, offStart.date); setError(`${nameOf(offStart.calendarId!)} starts on ${shortDay(offStart.date)}, ${status.kind === "holiday" ? `a public holiday (${status.label})` : status.kind === "closed" ? "a closed day" : "an off day"}. Choose a working day${onOpenDay ? ", or open the day for overtime below" : ""}.`); return; }
      if (noEnd) { setError(`Choose an end date after the start date for ${noEnd.calendarId ? nameOf(noEnd.calendarId) : noEnd.label}, or untick “More than 1 day”.`); return; }
      // Each ticked process's date, against what it was planned for when editing.
      checkDates(rows.filter((row) => row.on && row.calendarId).map((row) => ({ label: `${nameOf(row.calendarId!)} date`, value: row.date, rule: "plan" as const, was: lines.find((line) => line.id === row.lineId)?.plannedDate })), (reason) => {
      const planned: PlannedRow[] = rows.filter((row) => row.calendarId && (row.on || row.lineId)).map((row) => {
        const quantity = Number(row.quantity);
        return { calendarId: row.calendarId!, lineId: row.lineId, on: row.on, activityType: nameOf(row.calendarId!), plannedDate: row.date, ...(row.multiDay ? { endDate: row.endDate } : {}), quantity, uom: row.uom, batchSizeKg: kilograms(quantity, row.uom), machineIds: row.machineIds, ...(row.orderId ? { orderId: row.orderId } : {}) };
      });
      const submit = (correctionReason?: string) => {
        const result = onPlan({ jobId: job.id, rows: planned, batchNumber, priority, notes, ...(reason ? { pastReason: reason } : {}), ...(correctionReason ? { correctionReason } : {}) }, editing ? "edit" : "new");
        if ("error" in result) { setError(result.error); return; }
        dialog.current?.close();
        onDone(result.message, planned.filter((row) => row.on).map((row) => row.plannedDate).sort()[0] ?? start);
      };
      // Moving a completed process's planned date is a correction to a record, so it needs its reason.
      const correctedRows = rows.filter((row) => row.locked && row.lineId && lines.find((line) => line.id === row.lineId)?.plannedDate !== row.date);
      if (correctedRows.length) checkDates(correctedRows.map((row) => ({ label: `${nameOf(row.calendarId!)} planned date (completed)`, value: row.date, rule: "plan" as const, was: lines.find((line) => line.id === row.lineId)?.plannedDate })), submit, { reason: "correction" });
      else submit();
      });
    }}>
      <div className="panel-title plan-window-bar" {...barProps}>
        <h2 id="job-plan-title">{editing ? `Edit planning · ${job?.number ?? ""}` : "Production Planning"}{minimised && job && !editing ? ` · ${job.number}` : ""}</h2>
        <span className="plan-window-buttons">
          <button className="icon-button" type="button" aria-label={minimised ? "Restore" : "Minimise"} title={minimised ? "Restore" : "Minimise"} onClick={() => setMinimised(!minimised)}>{minimised ? <Maximize2 size={16} /> : <Minus size={18} />}</button>
          {!minimised ? <button className="icon-button" type="button" aria-label={maximised ? "Restore size" : "Maximise"} title={maximised ? "Restore size" : "Maximise"} onClick={() => setMaximised(!maximised)}>{maximised ? <Copy size={15} /> : <Square size={14} />}</button> : null}
          <button className="icon-button" type="button" aria-label="Close" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button>
        </span>
      </div>
      {editing ? null : choices.length || job ? <label>Job order<select required value={jobId} onChange={(event) => choose(event.target.value)}>
        <option value="" disabled>Choose a job order to plan</option>
        {(job && !choices.includes(job) ? [job, ...choices] : choices).map((item) => { const itemOrder = orders.find((entry) => entry.id === item.orderId); return <option key={item.id} value={item.id}>{item.number} · {products.find((entry) => entry.id === itemOrder?.productId)?.name ?? "Unknown product"} · {item.quantity.toLocaleString()} {item.uom}{itemOrder ? ` · ${itemOrder.poNumber}` : ""}</option>; })}
      </select></label> : <p role="alert">No job order of this unit is waiting to be planned. Add job orders to a PO on the Orders tab first; to change a planned one, open one of its activities and choose “Edit job order planning”.</p>}
      {job && order ? <>
        <p className="orders-help">{product?.name ?? "Unknown product"} · PO <strong>{poLabel(order, orders)}</strong>{order.customerName ? ` · ${order.customerName}` : ""} · {job.quantity.toLocaleString()} {job.uom}{job.batchSizeKg ? ` · ${job.batchSizeKg.toLocaleString()} kg` : ""}{job.packQuantity ? ` · ${job.packQuantity.toLocaleString()} ${job.packUom}` : ""}</p>
        <label>Batch number<input maxLength={60} autoComplete="off" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder={`Batch number for ${job.number}`} /></label>
        <div className="route-plan">
          <p className="orders-help">{format === "Other" ? "No fixed route for this dosage form: choose the process." : `${format}: ${rows.filter((row) => row.calendarId && row.key !== "single").map((row) => row.label).join(" → ")}.`} {editing ? "Correct any date or machine; untick to remove an activity, tick to add a missed process. A completed process keeps its machine and quantity, but its date can be corrected. A date before today asks for the reason." : "Tick each process to plan it now; an unticked process gets no date and stays off the calendar, to plan later. Each newly ticked process gets the next working day. Several processes can share a day: change a date and only the later processes that would then come before it move."} Tick “More than 1 day” for a process that runs over several days, then choose its end date. Off days (weekly off days, public holidays, closed days) are skipped. Theoretical quantities come from the job order; production keys in the actual quantity when it completes each process.</p>
          <div className="route-plan-scroll"><table className="route-plan-table"><thead><tr><th scope="col">Plan</th><th scope="col">Process</th><th scope="col">Date planned</th><th scope="col">Machine</th><th scope="col" className="numeric">Theoretical quantity</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.key} className={row.calendarId ? undefined : "route-missing"}>
              <td><input type="checkbox" aria-label={`Plan ${row.label}`} disabled={!row.calendarId || row.locked} checked={row.on} onChange={(event) => { const on = event.target.checked; setRows((current) => { const changed = current.map((item, position) => position === index ? { ...item, on } : item); return editing ? changed : reflow(changed, index, start, workDays); }); }} /></td>
              <td>{row.key === "single" ? <select aria-label="Process" value={row.calendarId ?? ""} onChange={(event) => update(index, { calendarId: event.target.value })}>{calendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                : <>{row.calendarId ? nameOf(row.calendarId) : row.label}{row.orderId ? <small className="plan-row-po">for {orders.find((item) => item.id === row.orderId)?.poNumber ?? "PO"}</small> : null}
                  {row.orderId && short ? (() => { const share = short.shares.find((item) => item.orderId === row.orderId); const part = job ? jobParts(job).find((item) => item.orderId === row.orderId) : undefined;
                    return share && share.available < share.planned ? <small className="order-warning">Short yield: {share.available.toLocaleString()} of {share.planned.toLocaleString()} {job?.uom} for this PO{part?.packSize ? ` · about ${Math.floor(share.available / part.packSize).toLocaleString()} packs` : ""}</small> : null; })() : null}{!row.calendarId ? <small>Not set up in this unit (or filtered out)</small> : row.locked ? <small>Completed: date only</small> : row.lineId && !row.on ? <small>Will be removed</small> : null}</>}</td>
              <td>{row.calendarId ? <input type="date" aria-label={`${row.label} date`} disabled={!row.on} value={row.on || row.locked ? row.date : ""} title={row.on ? undefined : "Not planned"} onChange={(event) => {
                // Later processes move only if they would now come before this one, so the route keeps its order.
                const value = event.target.value;
                setRows((current) => { const changed = current.map((item, position) => position === index ? startOn(item, value) : item); return editing ? changed : reflow(changed, index, start, workDays); });
              }} /> : "-"}
                {row.calendarId && row.on ? <label className="plan-multi-day"><input type="checkbox" checked={!!row.multiDay} disabled={row.locked} onChange={(event) => {
                  // Ticked, the end date shows, starting on the next day; unticked, the process takes one day again.
                  const multiDay = event.target.checked;
                  setRows((current) => { const changed = current.map((item, position) => position === index ? { ...item, multiDay, endDate: multiDay ? item.endDate && item.endDate > item.date ? item.endDate : item.date ? nextWorkingDay(workDays, item.date) : "" : "" } : item); return editing ? changed : reflow(changed, index, start, workDays); });
                }} />More than 1 day</label> : null}
                {row.calendarId && row.on && row.multiDay ? <label className="plan-end-date">End date<input type="date" aria-label={`${row.label} end date`} min={row.date ? addDays(row.date, 1) : undefined} disabled={row.locked} value={row.endDate ?? ""} onChange={(event) => {
                  const value = event.target.value;
                  setRows((current) => { const changed = current.map((item, position) => position === index ? { ...item, endDate: value } : item); return editing ? changed : reflow(changed, index, start, workDays); });
                }} /></label> : null}
                {row.calendarId && row.on && row.date ? (() => {
                  // What the dates come to in working days, and the off days skipped.
                  const status = dayStatus(workDays, row.date);
                  if (!row.multiDay || !row.endDate || row.endDate <= row.date) return !status.working ? <small className="order-warning">{shortDay(row.date)}: {status.label}</small> : status.kind === "overtime" ? <small>Overtime day</small> : null;
                  const span = spanDays(workDays, row.date, row.endDate);
                  return <small className={span.off.length ? "plan-off-days" : undefined}>{span.working} working day{span.working === 1 ? "" : "s"}{span.off.length ? ` · ${span.off.length} off, skipped` : ""}</small>;
                })() : null}</td>
              <td>{row.calendarId ? (() => {
                const options = machinesFor(row.calendarId);
                // A machine already booked stays listed even if it is no longer active.
                const kept = machines.filter((machine) => row.machineIds.includes(machine.id) && !options.includes(machine));
                return <MachinePicker label={`${row.label} machines`} machines={[...kept, ...options]} value={row.machineIds} empty="Choose later"
                  disabled={row.locked || !row.on} onChange={(ids) => update(index, { machineIds: ids })} />;
              })() : null}</td>
              <td className="numeric">{row.calendarId ? row.quantity ? <output aria-label={`${row.label} theoretical quantity`}>{Number(row.quantity).toLocaleString("en-MY", { maximumFractionDigits: 3 })} {row.uom}</output>
                : <small className="order-warning">No {row.planned ? measureName(row.planned) : "quantity"} on the job order</small> : null}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
        {(() => {
          // Every off day the ticked processes start on or run over: skipped, or opened for overtime here.
          const offDays = new Map<string, string[]>();
          for (const row of rows) {
            if (!row.on || !row.calendarId || !row.date) continue;
            const end = row.multiDay && row.endDate && row.endDate > row.date ? row.endDate : row.date;
            for (const day of spanDays(workDays, row.date, end).off) offDays.set(day.date, [...offDays.get(day.date) ?? [], nameOf(row.calendarId)]);
          }
          if (!offDays.size) return null;
          return <div className="plan-off-notes" role="group" aria-label="Off days in this plan">
            <p className="orders-help"><strong>Off days in this plan.</strong> {onOpenDay ? "No production on these days. If the team comes in for overtime, open the day." : "No production on these days. A planner, production manager or Admin can open one for overtime."}</p>
            <ul>{[...offDays].sort(([a], [b]) => a.localeCompare(b)).map(([day, processes]) => { const status = dayStatus(workDays, day);
              return <li key={day}><span>{shortDay(day)} · {status.label} · {processes.join(", ")}</span>
                {onOpenDay && status.kind !== "closed" ? opening?.date === day ? <span className="plan-open-day">
                  <input aria-label={`Reason for working on ${shortDay(day)}`} maxLength={300} autoFocus placeholder="Reason, e.g. overtime for this batch" value={opening.reason} onChange={(event) => setOpening({ date: day, reason: event.target.value })} />
                  <button type="button" className="calendar-button" disabled={!opening.reason.trim()} onClick={() => { const problem = onOpenDay(day, opening.reason); if (problem) setError(problem); else { setOpening(null); setError(""); } }}>Open day</button>
                  <button type="button" className="link-button" onClick={() => setOpening(null)}>Cancel</button>
                </span> : <button type="button" className="calendar-button" onClick={() => setOpening({ date: day, reason: "" })}>Work this day</button> : null}</li>; })}</ul>
          </div>;
        })()}
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
