"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Plus } from "lucide-react";
import type { PlanLine, Machine, ScheduleEntry, Product } from "@/lib/domain/types";
import { priorities, scheduleStatuses } from "@/lib/domain/types";
import { orderNumbers, type PurchaseOrder, type RouteStep } from "@/lib/services/orders";
import { ROUTES, routeLabel, stepOf, type FlowWarning, type ProductFormat } from "@/lib/services/processRules";
import { OrderBadge } from "./OrderBadge";

export function ActivityWorkspace({ line, product, machines, entries, canPlan, canProduce, onClose, onPlan, onProduction, children, statuses = scheduleStatuses, format = "Other", warnings = [], orders = [], route = [], routeMachines = [], routeEntries = [], canAssign = false, onAssignMachine, onOpenLine }: {
  children?: ReactNode;
  // Booking statuses this person may set; Confirmed and Cancelled need Core approve and cancel.
  statuses?: readonly ScheduleEntry["status"][];
  // The batch's product format and any process-flow warnings for its activities.
  format?: ProductFormat; warnings?: FlowWarning[];
  orders?: PurchaseOrder[]; route?: RouteStep[]; routeMachines?: Machine[]; routeEntries?: ScheduleEntry[];
  canAssign?: boolean; onAssignMachine?: (lineIds: string[], machineId: string) => string[]; onOpenLine?: (id: string) => void;
  line: PlanLine; product?: Product; machines: Machine[]; entries: ScheduleEntry[];
  canPlan: boolean; canProduce: boolean; onClose: () => void;
  onPlan: (line: PlanLine) => string; onProduction: (entry: ScheduleEntry) => string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [adding, setAdding] = useState(false);
  const [planNotice, setPlanNotice] = useState("");
  const order = orders.find((item) => item.id === line.productionOrderId);
  const numbers = orderNumbers(orders);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="activity-dialog unified-activity" aria-labelledby="activity-workspace-title" onClose={onClose}>
    <header className="panel-title"><div><p className="eyebrow">Activity workspace</p><h2 id="activity-workspace-title">{product?.name}</h2>
      <p className="activity-order-ref">{order?.customerName ? <span>Customer: <strong>{order.customerName}</strong></span> : null}<span>{order ? <OrderBadge number={numbers.get(order.id)} poNumber={order.poNumber} /> : null}PO number: <strong>{order?.poNumber ?? "Not linked"}</strong></span>{line.orderReference ? <span>{line.orderReference}</span> : null}{order ? <span>Order quantity: {order.quantity.toLocaleString()} {order.uom}</span> : null}</p></div><button type="button" className="icon-button" aria-label="Close activity workspace" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
    {route.length ? <ProductionRoute line={line} route={route} format={format} warnings={warnings} machines={routeMachines} entries={routeEntries} editable={canAssign} onAssign={onAssignMachine} onOpenLine={onOpenLine} /> : null}
    <section><h3>Part 1 - Planning</h3><form className="form-panel" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setPlanNotice(onPlan({ ...line, productionOrderId: String(data.get("order")) || undefined, plannedDate: String(data.get("date")), quantity: Number(data.get("quantity")), priority: String(data.get("priority")) as PlanLine["priority"], notes: String(data.get("notes")) })); }}>
      <fieldset disabled={!canPlan}><label>PO number<select name="order" defaultValue={line.productionOrderId ?? ""}><option value="">Not linked</option>{orders.filter((item) => item.productId === line.productId || item.id === line.productionOrderId).map((item) => <option key={item.id} value={item.id}>{numbers.get(item.id)} · {item.poNumber}{item.customerName ? ` · ${item.customerName}` : ""} · {item.quantity.toLocaleString()} {item.uom}</option>)}</select></label><label>Planned date<input name="date" type="date" defaultValue={line.plannedDate} required /></label><label>Quantity ({line.uom ?? product?.uom})<input name="quantity" type="number" min="0.000001" step="any" defaultValue={line.quantity} required /></label><label>Priority<select name="priority" defaultValue={line.priority}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label><label>Remarks<textarea name="notes" defaultValue={line.notes} /></label></fieldset>
      <p>{line.activityType}{line.batchSizeKg !== undefined ? ` · ${line.batchSizeKg} kg equivalent` : ""}</p>
      {planNotice ? <p role="status" className={planNotice.includes("Warning:") ? "flow-warning-text" : undefined}>{planNotice}</p> : null}
      {canPlan ? <button type="submit" className="primary-button">Save planning</button> : null}
    </form></section>
    <section><h3>Part 2 - Production</h3>
      {entries.length === 0 ? <p>No production details yet.</p> : null}
      {/* Keyed on the booking's times too, so a date move refreshes the form instead of leaving stale times that would move it back. */}
      {entries.map((entry) => <ProductionForm key={`${entry.id}-${entry.startAt}-${entry.endAt}-${entry.machineId}`} entry={entry} machines={machines} statuses={statuses} editable={canProduce} onSave={onProduction} />)}
      {adding ? <ProductionForm entry={{ id: `sched-${crypto.randomUUID()}`, planLineId: line.id, productId: line.productId, productionOrderId: line.productionOrderId, workCentreId: "", startAt: `${line.plannedDate}T08:00`, endAt: `${line.plannedDate}T16:00`, status: "Draft" }} machines={machines} statuses={statuses} editable onSave={(entry) => { const errors = onProduction(entry); if (!errors.length) setAdding(false); return errors; }} /> : canProduce ? <button type="button" className="calendar-button" onClick={() => setAdding(true)}><Plus size={16} /> Add production details</button> : null}
    </section>
    {children}
  </dialog>;
}
// datetime-local inputs only show "YYYY-MM-DDTHH:mm"; convert stored UTC timestamps to local time.
function localInput(value: string) {
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value.slice(0, 16);
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function ProductionForm({ entry, machines, statuses, editable, onSave }: { entry: ScheduleEntry; machines: Machine[]; statuses: readonly ScheduleEntry["status"][]; editable: boolean; onSave: (entry: ScheduleEntry) => string[] }) {
  const [machineId, setMachineId] = useState(entry.machineId ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(entry.status);
  useEffect(() => setStatus(entry.status), [entry.status]);
  const machine = machines.find((item) => item.id === machineId);
  return <form className="production-detail-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!machine) return; const result = onSave({ ...entry, machineId, workCentreId: machine.workCentreId, startAt: String(data.get("start")), endAt: String(data.get("end")), status: String(data.get("status")) as ScheduleEntry["status"], notes: String(data.get("notes")) }); setErrors(result); setSaved(!result.length); }}>
    <fieldset disabled={!editable}><label>Machine<select required value={machineId} onChange={(event) => setMachineId(event.target.value)}><option value="">Select machine</option>{machines.filter((item) => item.active === "Active" || item.id === entry.machineId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <p>Configured capacity: {machine?.capacity !== undefined ? `${machine.capacity} ${machine.capacityUom ?? ""}` : machine?.capacityNotes ?? "Not configured"}</p>
    <p>Setup time: {machine?.setupMinutes ?? 0} minutes</p>
    <label>Start<input name="start" type="datetime-local" required defaultValue={localInput(entry.startAt)} /></label><label>End<input name="end" type="datetime-local" required defaultValue={localInput(entry.endAt)} /></label><label>Status<select name="status" value={status} onChange={(event) => setStatus(event.target.value as ScheduleEntry["status"])}>{scheduleStatuses.filter((value) => statuses.includes(value) || value === entry.status).map((value) => <option key={value}>{value}</option>)}</select></label><label>Production notes<textarea name="notes" defaultValue={entry.notes} /></label></fieldset>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}{saved ? <p role="status">Production details saved.</p> : null}
    {editable ? <button className="primary-button" type="submit">Save production</button> : null}
  </form>;
}
export function MachineConfiguration({ machines, onSave }: { machines: Machine[]; onSave: (machine: Machine) => void }) {
  return <section className="measurement-admin"><h2>Machine configuration</h2>{machines.map((machine) => <form key={machine.id} className="machine-config-row" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...machine, name: String(data.get("name")).trim(), capacity: data.get("capacity") ? Number(data.get("capacity")) : undefined, capacityUom: String(data.get("unit")).trim() }); }}>
    <label>Machine name<input name="name" defaultValue={machine.name} required /></label><label>Capacity<input name="capacity" type="number" min="0.000001" step="any" defaultValue={machine.capacity} /></label><label>Capacity unit / basis<input name="unit" placeholder="kg per batch / tablets per hour" defaultValue={machine.capacityUom} required /></label><button className="primary-button" type="submit">Save machine</button>
  </form>)}</section>;
}

// Every process of the unit in order, with the batch's days in each and the machine it runs on.
function ProductionRoute({ line, route, format, warnings, machines, entries, editable, onAssign, onOpenLine }: {
  line: PlanLine; route: RouteStep[]; format: ProductFormat; warnings: FlowWarning[]; machines: Machine[]; entries: ScheduleEntry[]; editable: boolean;
  onAssign?: (lineIds: string[], machineId: string) => string[]; onOpenLine?: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const day = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const required = format === "Other" ? null : ROUTES[format];
  return <section className="production-route"><h3>Production route{line.orderReference ? ` · ${line.orderReference}` : ""}</h3>
    <p className="route-format">{format === "Other" ? "Format: Other (no fixed route)" : <>Format: <strong>{format}</strong> · {routeLabel(format)}</>}</p>
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    <table>
      <thead><tr><th scope="col">Process</th><th scope="col">Days</th><th scope="col">Quantity</th><th scope="col">Machine</th></tr></thead>
      <tbody>{route.map((step) => {
        const ids = step.lines.map((item) => item.id);
        const booked = [...new Set(entries.filter((entry) => ids.includes(entry.planLineId ?? "") && entry.status !== "Cancelled").map((entry) => entry.machineId).filter((id): id is string => !!id))];
        const options = machines.filter((machine) => machine.processIds?.includes(step.calendar.processId) && (machine.active === "Active" || booked.includes(machine.id)));
        const open = step.lines.filter((item) => !item.completedAt);
        const done = step.lines.length > 0 && !open.length;
        const current = step.lines.some((item) => item.id === line.id);
        const stepKey = stepOf(step.processName);
        const outside = !!required && (!stepKey || !required.includes(stepKey));
        return <tr key={step.calendar.id} className={[current ? "route-current" : "", step.lines.length ? "" : "route-empty"].join(" ").trim() || undefined}>
          <th scope="row">{step.processName}{done ? <span className="badge success">Done</span> : null}</th>
          <td>{step.lines.length ? step.lines.map((item) => <button key={item.id} type="button" className="route-day" aria-current={item.id === line.id || undefined} title={item.completedAt ? "Completed" : "Open this day"} onClick={() => onOpenLine?.(item.id)}>{day(item.plannedDate)}</button>) : <span className="route-muted">{outside ? `Not used for ${format.toLowerCase()}s` : "Not planned"}</span>}</td>
          <td>{step.lines.length ? `${step.lines.reduce((total, item) => total + item.quantity, 0).toLocaleString()} ${step.lines[0].uom ?? ""}` : "-"}</td>
          <td>{step.lines.length ? <>
            <select aria-label={`Machine for ${step.processName}`} disabled={!editable || !open.length || !onAssign} value={booked.length === 1 ? booked[0] : booked.length > 1 ? "mixed" : ""}
              onChange={(event) => { if (event.target.value !== "mixed") setMessages({ ...messages, [step.calendar.id]: onAssign!(open.map((item) => item.id), event.target.value) }); }}>
              <option value="">Not assigned</option>
              {booked.length > 1 ? <option value="mixed" disabled>Several machines</option> : null}
              {options.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
            </select>
            {!options.length ? <small className="route-muted">No machines set up for this process</small> : null}
            {(messages[step.calendar.id] ?? []).map((message) => <small role="alert" key={message}>{message}</small>)}
          </> : "-"}</td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
