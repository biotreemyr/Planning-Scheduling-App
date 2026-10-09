"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PlanLine, Machine, ScheduleEntry, Product } from "@/lib/domain/types";
import { orderNumbers, poLabel, type PurchaseOrder, type RouteStep } from "@/lib/services/orders";
import type { FlowWarning, ProductFormat } from "@/lib/services/processRules";
import { OrderBadge } from "./OrderBadge";
import type { JobOrder } from "@/lib/services/jobOrders";

export function ActivityWorkspace({ onEditJobPlanning, line, product, onClose, children, jobOrders = [], format = "Other", warnings = [], orders = [], route = [], routeMachines = [], routeEntries = [], canAssign = false, onAssignMachine, onOpenLine }: {
  children?: ReactNode;
  // Opens the plan form for this activity's job order, to correct its whole route.
  onEditJobPlanning?: () => void;
  jobOrders?: JobOrder[];
  // The batch's product format and any process-flow warnings for its activities.
  format?: ProductFormat; warnings?: FlowWarning[];
  orders?: PurchaseOrder[]; route?: RouteStep[]; routeMachines?: Machine[]; routeEntries?: ScheduleEntry[];
  canAssign?: boolean; onAssignMachine?: (lineIds: string[], machineId: string) => string[]; onOpenLine?: (id: string) => void;
  line: PlanLine; product?: Product; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const order = orders.find((item) => item.id === line.productionOrderId);
  const numbers = orderNumbers(orders);
  const job = jobOrders.find((item) => item.id === line.jobOrderId);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="activity-dialog unified-activity" aria-labelledby="activity-workspace-title" onClose={onClose}>
    <header className="panel-title"><div><p className="eyebrow">Activity workspace</p><h2 id="activity-workspace-title">{product?.name}</h2>
      <p className="activity-order-ref">{order?.customerName ? <span>Customer: <strong>{order.customerName}</strong></span> : null}<span>{order ? <OrderBadge number={numbers.get(order.id)} poNumber={order.poNumber} /> : null}PO number: <strong>{order ? poLabel(order, orders) : "Not linked"}</strong></span>{job ? <span>Job order: <strong>{job.number}</strong></span> : line.orderReference ? <span>{line.orderReference}</span> : null}{job ? <span>Batch no.: <strong>{job.batchNumber ?? "Not entered"}</strong></span> : null}{order ? <span>Order quantity: {order.quantity.toLocaleString()} {order.uom}</span> : null}</p>
      {job && onEditJobPlanning ? <button type="button" className="calendar-button" onClick={() => { dialog.current?.close(); onEditJobPlanning(); }}>Edit job order planning</button> : null}</div><button type="button" className="icon-button" aria-label="Close activity workspace" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
    {route.length ? <ProductionRoute line={line} route={route} format={format} warnings={warnings} machines={routeMachines} entries={routeEntries} editable={canAssign} onAssign={onAssignMachine} onOpenLine={onOpenLine} /> : null}
    {children}
  </dialog>;
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
  return <section className="production-route"><h3>Production route{line.orderReference ? ` · ${line.orderReference}` : ""}</h3>
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
        // A process not used for this dosage form (set in Admin) is shown as not used.
        const outside = format !== "Other" && !step.settings.forms.includes(format);
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
