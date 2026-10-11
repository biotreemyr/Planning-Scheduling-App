"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PlanLine, Machine, ScheduleEntry, Product } from "@/lib/domain/types";
import { orderNumbers, poLabel, type PurchaseOrder, type RouteStep } from "@/lib/services/orders";
import type { FlowWarning, ProductFormat } from "@/lib/services/processRules";
import { OrderBadge } from "./OrderBadge";
import type { JobOrder } from "@/lib/services/jobOrders";
import { formatDate } from "@/lib/services/dates";
import { Who } from "./Who";
import { equivalence, factorsFor, type Factors } from "@/lib/services/equivalence";
import type { WipTransfer } from "@/lib/services/productionFlow";

export function ActivityWorkspace({ onEditJobPlanning, line, product, onClose, children, jobOrders = [], format = "Other", warnings = [], orders = [], route = [], routeMachines = [], routeEntries = [], transfers = [], visibleCalendarIds, canAssign = false, canUpdate = false, updating = false, notice = "", onAssignMachine, onOpenLine }: {
  // Production's update for this activity: keyed in on its own row of the route while updating (inRow,
  // with the job's equivalence for the typed quantity), or on its own when there is no route.
  children?: (inRow: boolean, equivalence?: (quantity: number, uom: string) => string) => ReactNode;
  // Opens the plan form for this activity's job order, to correct its whole route.
  onEditJobPlanning?: () => void;
  jobOrders?: JobOrder[];
  // The batch's product format and any process-flow warnings for its activities.
  format?: ProductFormat; warnings?: FlowWarning[];
  orders?: PurchaseOrder[]; route?: RouteStep[]; routeMachines?: Machine[]; routeEntries?: ScheduleEntry[]; transfers?: WipTransfer[];
  canAssign?: boolean; canUpdate?: boolean; updating?: boolean; notice?: string;
  // The processes this person may see; others in the route show as not theirs rather than not planned.
  visibleCalendarIds?: string[];
  onAssignMachine?: (lineIds: string[], machineId: string) => string[];
  // Opens another day of the batch; with update, its production form too.
  onOpenLine?: (id: string, update?: boolean) => void;
  line: PlanLine; product?: Product; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const order = orders.find((item) => item.id === line.productionOrderId);
  const numbers = orderNumbers(orders);
  const job = jobOrders.find((item) => item.id === line.jobOrderId);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="activity-dialog unified-activity route-wide" aria-labelledby="activity-workspace-title" onClose={onClose}>
    <header className="panel-title"><div><p className="eyebrow">Activity workspace</p><h2 id="activity-workspace-title">{product?.name}</h2>
      <p className="activity-order-ref">{order?.customerName ? <span>Customer: <strong>{order.customerName}</strong></span> : null}<span>{order ? <OrderBadge number={numbers.get(order.id)} poNumber={order.poNumber} /> : null}PO number: <strong>{order ? poLabel(order, orders) : "Not linked"}</strong></span>{job ? <span>Job order: <strong>{job.number}</strong></span> : line.orderReference ? <span>{line.orderReference}</span> : null}{job ? <span>Batch no.: <strong>{job.batchNumber ?? "Not entered"}</strong></span> : null}{order ? <span>Order quantity: {order.quantity.toLocaleString()} {order.uom}</span> : null}</p>
      {job && onEditJobPlanning ? <button type="button" className="calendar-button" onClick={() => { dialog.current?.close(); onEditJobPlanning(); }}>Edit job order planning</button> : null}</div><button type="button" className="icon-button" aria-label="Close activity workspace" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    {route.length ? <ProductionRoute line={line} route={route} format={format} warnings={warnings} machines={routeMachines} entries={routeEntries} transfers={transfers} visibleCalendarIds={visibleCalendarIds} factors={factorsFor(order, job, format === "Capsule" ? "capsules" : format === "Sachet" ? "sachets" : "tablets")}
      editable={canAssign} canUpdate={canUpdate} updating={updating} update={children} onAssign={onAssignMachine} onOpenLine={onOpenLine} /> : children?.(false)}
  </dialog>;
}
export function MachineConfiguration({ machines, onSave }: { machines: Machine[]; onSave: (machine: Machine) => void }) {
  return <section className="measurement-admin"><h2>Machine configuration</h2>{machines.map((machine) => <form key={machine.id} className="machine-config-row" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...machine, name: String(data.get("name")).trim(), capacity: data.get("capacity") ? Number(data.get("capacity")) : undefined, capacityUom: String(data.get("unit")).trim() }); }}>
    <label>Machine name<input name="name" defaultValue={machine.name} required /></label><label>Capacity<input name="capacity" type="number" min="0.000001" step="any" defaultValue={machine.capacity} /></label><label>Capacity unit / basis<input name="unit" placeholder="kg per batch / tablets per hour" defaultValue={machine.capacityUom} required /></label><button className="primary-button" type="submit">Save machine</button>
  </form>)}</section>;
}


/**
 * Every process of the unit in order, one row per planned day: what was planned (date, quantity, its
 * equivalence, machine) beside what production reported (run date, quantity, equivalence, machine
 * used, remarks, where the output went), each with who did it. Update turns that day's Actual cells
 * into production's inputs, right on its row.
 */
function ProductionRoute({ line, route, format, warnings, machines, entries, transfers, visibleCalendarIds, factors, editable, canUpdate, updating, update, onAssign, onOpenLine }: {
  line: PlanLine; route: RouteStep[]; format: ProductFormat; warnings: FlowWarning[]; machines: Machine[]; entries: ScheduleEntry[]; transfers: WipTransfer[]; visibleCalendarIds?: string[]; factors: Factors;
  editable: boolean; canUpdate: boolean; updating: boolean; update?: (inRow: boolean, equivalence?: (quantity: number, uom: string) => string) => ReactNode;
  onAssign?: (lineIds: string[], machineId: string) => string[]; onOpenLine?: (id: string, update?: boolean) => void;
}) {
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const day = (value: string) => formatDate(value.slice(0, 10));
  const amount = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
  const machineName = (id?: string) => machines.find((machine) => machine.id === id)?.name ?? "";
  const COLUMNS = 13;
  return <section className="production-route"><h3>Production route{line.orderReference ? ` · ${line.orderReference}` : ""}</h3>
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    <div className="route-table-scroll"><table className="route-table">
      <thead>
        <tr><th scope="col" rowSpan={2} className="route-plan-mark">Plan</th><th scope="col" rowSpan={2}>Process</th><th scope="colgroup" colSpan={4} className="route-group planned">Planned</th><th scope="colgroup" colSpan={6} className="route-group actual">Actual</th><th scope="col" rowSpan={2}><span className="admin-sr-only">Update</span></th></tr>
        <tr><th scope="col">Date planned</th><th scope="col" className="numeric">Qty planned</th><th scope="col">Planned equivalence</th><th scope="col">Machine planned</th>
          <th scope="col">Actual run date</th><th scope="col" className="numeric">Actual quantity</th><th scope="col">Actual equivalence</th><th scope="col">Machine used</th><th scope="col">Remarks</th><th scope="col">Send to next process</th></tr>
      </thead>
      <tbody>{route.flatMap((step) => {
        // A process not used for this dosage form (set in Admin) is shown as not used.
        const outside = format !== "Other" && !step.settings.forms.includes(format);
        if (!step.lines.length) return [<tr key={step.calendar.id} className="route-empty"><td className="route-plan-mark" /><th scope="row">{step.processName}</th><td colSpan={COLUMNS - 2} className="route-muted">{outside ? `Not used for ${format.toLowerCase()}s` : visibleCalendarIds && !visibleCalendarIds.includes(step.calendar.id) ? "Not in your processes" : "Not planned"}</td></tr>];
        const done = step.lines.every((item) => item.completedAt);
        return step.lines.flatMap((item, index) => {
          const booked = entries.find((entry) => entry.planLineId === item.id && entry.status !== "Cancelled")?.machineId;
          const options = machines.filter((machine) => machine.processIds?.includes(step.calendar.processId) && (machine.active === "Active" || machine.id === booked));
          const planned = item.plannedMachineId ?? booked;
          const reported = item.completedAt ? item.yieldQuantity : undefined, reportedUom = item.yieldUom ?? item.uom;
          const outgoing = transfers.find((transfer) => transfer.sourceLineId === item.id);
          const next = outgoing ? outgoing.wipRoom ? "WIP room" : route.find((other) => other.calendar.id === outgoing.calendarId)?.processName ?? "Next process" : item.completedAt ? "Final output" : "";
          const current = item.id === line.id;
          // Production can click anywhere on a day's Actual cells to key them in.
          const open = (className = "") => canUpdate ? { className: `${className} route-actual-open`.trim(), title: item.completedAt ? "Correct this day" : "Update this day", onClick: () => onOpenLine?.(item.id, true) } : { className: className || undefined };
          const rows = [<tr key={item.id} className={[current ? "route-current" : "", item.completedAt ? "route-done" : ""].join(" ").trim() || undefined}>
            {index === 0 ? <><td rowSpan={step.lines.length} className="route-plan-mark" aria-label="Planned">✓</td>
              <th scope="row" rowSpan={step.lines.length}>{step.processName}{done ? <span className="badge success">Done</span> : null}</th></> : null}
            <td><button type="button" className="route-day" aria-current={current || undefined} title="Open this day" onClick={() => onOpenLine?.(item.id)}>{day(item.plannedDate)}{item.endDate ? ` – ${day(item.endDate)}` : ""}</button><Who verb="Planned" who={item.plannedBy} at={item.plannedAt} /></td>
            <td className="numeric">{amount(item.quantity)} {item.uom ?? ""}</td>
            <td className="route-equivalence">{equivalence(item.quantity, item.uom, factors) || <span className="route-muted">-</span>}</td>
            <td>{editable && onAssign && !item.completedAt ? <select aria-label={`Machine for ${step.processName} on ${day(item.plannedDate)}`} value={booked ?? ""} onChange={(event) => setMessages({ ...messages, [item.id]: onAssign([item.id], event.target.value) })}>
                <option value="">Not assigned</option>{options.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select>
              : machineName(planned) || <span className="route-muted">Not assigned</span>}
              {(messages[item.id] ?? []).map((message) => <small role="alert" key={message}>{message}</small>)}</td>
            {current && updating && update ? update(true, (quantity, uom) => equivalence(quantity, uom, factors)) : <>
              <td {...open()}>{item.completedAt ? day(item.completedAt) : item.startedAt ? <>Started {day(item.startedAt)}</> : <span className="route-muted">-</span>}<Who verb="Updated" who={item.updatedBy} at={item.updatedAt} /></td>
              <td {...open("numeric")}>{reported !== undefined ? `${amount(reported)} ${reportedUom ?? ""}` : <span className="route-muted">-</span>}</td>
              <td {...open("route-equivalence")}>{reported !== undefined ? equivalence(reported, reportedUom, factors) || <span className="route-muted">-</span> : <span className="route-muted">-</span>}</td>
              <td {...open()}>{item.completedAt || item.startedAt ? machineName(booked) || <span className="route-muted">-</span> : <span className="route-muted">-</span>}</td>
              <td {...open("route-remarks")}>{item.productionNotes || <span className="route-muted">-</span>}</td>
              <td {...open()}>{next || <span className="route-muted">-</span>}</td>
              <td>{canUpdate ? <button type="button" className="calendar-button" onClick={() => onOpenLine?.(item.id, true)}>{item.completedAt ? "Correct" : "Update"}</button> : null}</td>
            </>}
          </tr>];
          return rows;
        });
      })}</tbody>
    </table></div>
  </section>;
}
