"use client";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Copy, Maximize2, Minus, Square, X } from "lucide-react";
import type { PlanLine, Machine, ScheduleEntry, Product } from "@/lib/domain/types";
import { batchYield, formatYield, limitText, type BatchYield } from "@/lib/services/yields";
import { FillNote } from "./FillNote";
import { useYieldLimits } from "./YieldLimitsContext";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import { bookedMachineIds, machineLabels } from "@/lib/services/machines";
import { MachinePicker } from "./MachinePicker";
import { isNonProduction, orderNumbers, poLabel, type PurchaseOrder, type RouteStep } from "@/lib/services/orders";
import type { FlowWarning, ProductFormat } from "@/lib/services/processRules";
import { OrderBadge } from "./OrderBadge";
import type { JobOrder } from "@/lib/services/jobOrders";
import { formatDate } from "@/lib/services/dates";
import { whoText } from "./Who";
import { useFloatingWindow } from "./useFloatingWindow";
import { equivalence, factorsFor, type Factors } from "@/lib/services/equivalence";
import type { WipTransfer } from "@/lib/services/productionFlow";

export function ActivityWorkspace({ directory, allLines = [], onEditJobPlanning, line, product, onClose, children, jobOrders = [], format = "Other", warnings = [], orders = [], route = [], routeMachines = [], routeEntries = [], transfers = [], visibleCalendarIds, canAssign = false, canUpdate = false, updating = false, notice = "", onAssignMachine, onOpenLine }: {
  // Production's update for this activity: keyed in on its own row of the route while updating (inRow,
  // with the job's equivalence for the typed quantity), or on its own when there is no route.
  children?: (inRow: boolean, equivalence?: (quantity: number, uom: string) => string) => ReactNode;
  // Opens the plan form for this activity's job order, to correct its whole route.
  onEditJobPlanning?: () => void;
  jobOrders?: JobOrder[];
  // The batch's product format and any process-flow warnings for its activities.
  format?: ProductFormat; warnings?: FlowWarning[];
  // The setup and every activity, so the step yields can follow the whole batch.
  directory?: CalendarDirectory; allLines?: PlanLine[];
  orders?: PurchaseOrder[]; route?: RouteStep[]; routeMachines?: Machine[]; routeEntries?: ScheduleEntry[]; transfers?: WipTransfer[];
  canAssign?: boolean; canUpdate?: boolean; updating?: boolean; notice?: string;
  // The processes this person may see; others in the route show as not theirs rather than not planned.
  visibleCalendarIds?: string[];
  onAssignMachine?: (lineIds: string[], machineIds: string[]) => string[];
  // Opens another day of the batch; with update, its production form too.
  onOpenLine?: (id: string, update?: boolean) => void;
  line: PlanLine; product?: Product; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const order = orders.find((item) => item.id === line.productionOrderId);
  const numbers = orderNumbers(orders);
  const job = jobOrders.find((item) => item.id === line.jobOrderId);
  // A floating window like Production Planning: dragged by its title bar, minimised to it, so the
  // calendar behind stays in reach.
  const limits = useYieldLimits();
  const { minimised, setMinimised, maximised, setMaximised, barProps, open, style } = useFloatingWindow(dialog);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { dialog.current?.show(); open(1340); }, []);
  return <dialog ref={dialog} className={`activity-dialog unified-activity route-wide floating-window${minimised ? " minimised" : ""}${maximised ? " maximised" : ""}`} style={style} aria-labelledby="activity-workspace-title" onClose={onClose}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); dialog.current?.close(); } }}>
    <header className="panel-title plan-window-bar" {...barProps}><div><p className="eyebrow">Activity workspace</p><h2 id="activity-workspace-title">{product?.name}{minimised ? ` · ${job?.number ?? line.activityType ?? ""}` : ""}</h2>
      <p className="activity-order-ref">{order?.customerName ? <span>Customer: <strong>{order.customerName}</strong></span> : null}<span>{order ? <OrderBadge number={numbers.get(order.id)} poNumber={order.poNumber} trial={isNonProduction(order)} /> : null}PO number: <strong>{order ? poLabel(order, orders) : "Not linked"}</strong></span>{job ? <span>Job order: <strong>{job.number}</strong></span> : line.orderReference ? <span>{line.orderReference}</span> : null}{job ? <span>Batch no.: <strong>{job.batchNumber ?? "Not entered"}</strong></span> : null}{order ? <span>Order quantity: {order.quantity.toLocaleString()} {order.uom}</span> : null}</p>
      {job && onEditJobPlanning ? <button type="button" className="calendar-button" onClick={() => { dialog.current?.close(); onEditJobPlanning(); }}>Edit job order planning</button> : null}</div><span className="plan-window-buttons">
      <button className="icon-button" type="button" aria-label={minimised ? "Restore" : "Minimise"} title={minimised ? "Restore" : "Minimise"} onClick={() => setMinimised(!minimised)}>{minimised ? <Maximize2 size={16} /> : <Minus size={18} />}</button>
          {!minimised ? <button className="icon-button" type="button" aria-label={maximised ? "Restore size" : "Maximise"} title={maximised ? "Restore size" : "Maximise"} onClick={() => setMaximised(!maximised)}>{maximised ? <Copy size={15} /> : <Square size={14} />}</button> : null}
      <button type="button" className="icon-button" aria-label="Close activity workspace" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></span></header>
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    {route.length ? <ProductionRoute yields={job && directory ? batchYield(job, line.productionOrderId ?? job.orderId, allLines.length ? allLines : route.flatMap((step) => step.lines), orders, directory, limits) : undefined} line={line} route={route} format={format} warnings={warnings} machines={routeMachines} entries={routeEntries} transfers={transfers} visibleCalendarIds={visibleCalendarIds} factors={factorsFor(order, job, format === "Capsule" ? "capsules" : format === "Sachet" ? "sachets" : "tablets")}
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
function ProductionRoute({ line, route, format, warnings, machines, entries, transfers, visibleCalendarIds, factors, editable, canUpdate, updating, update, onAssign, onOpenLine, yields }: {
  // The batch's step yields and final yield, against QA's limits.
  yields?: BatchYield;
  line: PlanLine; route: RouteStep[]; format: ProductFormat; warnings: FlowWarning[]; machines: Machine[]; entries: ScheduleEntry[]; transfers: WipTransfer[]; visibleCalendarIds?: string[]; factors: Factors;
  editable: boolean; canUpdate: boolean; updating: boolean; update?: (inRow: boolean, equivalence?: (quantity: number, uom: string) => string) => ReactNode;
  onAssign?: (lineIds: string[], machineIds: string[]) => string[]; onOpenLine?: (id: string, update?: boolean) => void;
}) {
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const day = (value: string) => formatDate(value.slice(0, 10));
  const amount = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
  const machineNames = (ids: string[]) => machineLabels(machines, ids);
  const COLUMNS = 14;
  // Who planned or updated a day shows in a small box right beside the cell pointed at.
  const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const hover = (text?: string) => text ? {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      // Beside the cell on the right, or on its left when there is no room.
      const left = box.right + 248 > window.innerWidth ? Math.max(8, box.left - 248) : box.right + 6;
      setTip({ text, left, top: box.top + 4 });
    },
    onMouseLeave: () => setTip(null)
  } : {};
  // The second heading row sticks just below the first, whatever its height.
  const headRow = useRef<HTMLTableRowElement>(null);
  useLayoutEffect(() => {
    const row = headRow.current;
    if (!row) return;
    const set = () => row.closest("table")?.style.setProperty("--route-head", `${row.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const processOf = (calendarId?: string) => route.find((other) => other.calendar.id === calendarId)?.processName ?? "next process";
  return <section className="production-route" onScrollCapture={() => setTip(null)}>
    {tip ? <div className="who-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>{tip.text}</div> : null}<h3>Production route{line.orderReference ? ` · ${line.orderReference}` : ""}</h3>
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    <div className="route-table-scroll"><table className="route-table">
      <thead>
        <tr ref={headRow}><th scope="col" rowSpan={2} className="route-plan-mark">Plan</th><th scope="col" rowSpan={2} className="route-process">Process</th><th scope="colgroup" colSpan={4} className="route-group planned">Planned</th><th scope="colgroup" colSpan={6} className="route-group actual">Actual</th><th scope="col" rowSpan={2}><span className="admin-sr-only">Update</span></th><th scope="col" rowSpan={2} className="route-yield" title="% of theoretical: what the process made against the batch formula, with QA's limits. Step: against what the process before handed over">Yield</th></tr>
        <tr><th scope="col" className="route-col-date">Date planned</th><th scope="col" className="numeric">Qty planned</th><th scope="col" className="route-col-equivalence">Planned equivalence</th><th scope="col" className="route-col-machine">Machine planned</th>
          <th scope="col" className="route-col-date">Actual run date</th><th scope="col" className="numeric">Actual quantity</th><th scope="col" className="route-col-equivalence">Actual equivalence</th><th scope="col" className="route-col-machine">Machine used</th><th scope="col" className="route-col-remarks">Remarks</th><th scope="col" className="route-col-next">Send to next process</th></tr>
      </thead>
      <tbody>{route.flatMap((step) => {
        // A process not used for this dosage form (set in Admin) is shown as not used.
        const outside = format !== "Other" && !step.settings.forms.includes(format);
        if (!step.lines.length) return [<tr key={step.calendar.id} className="route-empty"><td className="route-plan-mark" /><th scope="row" className="route-process">{step.processName}</th><td colSpan={COLUMNS - 2} className="route-muted">{outside ? `Not used for ${format.toLowerCase()}s` : visibleCalendarIds && !visibleCalendarIds.includes(step.calendar.id) ? "Not in your processes" : "Not planned"}</td></tr>];
        const done = step.lines.every((item) => item.completedAt);
        return step.lines.flatMap((item, index) => {
          const booked = bookedMachineIds(entries, item.id);
          const options = machines.filter((machine) => machine.processIds?.includes(step.calendar.processId) && (machine.active === "Active" || booked.includes(machine.id)));
          const planned = item.plannedMachineIds ?? (item.plannedMachineId ? [item.plannedMachineId] : booked);
          const reported = item.completedAt ? item.yieldQuantity : undefined, reportedUom = item.yieldUom ?? item.uom;
          // Before the day completes: the amount run so far, saved with progress.
          const soFar = item.completedAt ? undefined : item.progressQuantity, soFarUom = item.progressUom ?? item.uom;
          const outgoing = transfers.find((transfer) => transfer.sourceLineId === item.id);
          // Where the output went; before completion, where production chose to send it.
          const [chosenKind, chosenCalendar] = (item.completedAt ? "" : item.progressDestination ?? "").split(":");
          const next = outgoing ? outgoing.wipRoom ? `WIP room, for ${processOf(outgoing.calendarId)}` : processOf(outgoing.calendarId) : item.completedAt ? "Final output"
            : chosenKind === "final" ? "Final output" : chosenKind === "wip" ? `WIP room, for ${processOf(chosenCalendar)}` : chosenKind === "next" ? processOf(chosenCalendar) : "";
          const current = item.id === line.id;
          // Who planned shows beside the Planned cells, who last updated beside the Actual ones.
          const plannedWho = hover([whoText("Planned", item.plannedBy, item.plannedAt), item.pastPlanReason ? `Planned in the past: ${item.pastPlanReason}` : ""].filter(Boolean).join("\n"));
          const updatedWho = item.startedAt || item.completedAt || item.progressQuantity !== undefined || item.progressDestination ? whoText("Updated", item.updatedBy, item.updatedAt) : "";
          // Production can click anywhere on a day's Actual cells to key them in.
          const open = (className = "") => ({ className: `${className}${canUpdate ? " route-actual-open" : ""}`.trim() || undefined, ...hover(updatedWho), ...(canUpdate ? { onClick: () => { setTip(null); onOpenLine?.(item.id, true); } } : {}) });
          const rows = [<tr key={item.id} className={[current ? "route-current" : "", item.completedAt ? "route-done" : ""].join(" ").trim() || undefined}>
            {index === 0 ? <><td rowSpan={step.lines.length} className="route-plan-mark" aria-label="Planned">✓</td>
              <th scope="row" rowSpan={step.lines.length} className="route-process">{step.processName}{done ? <span className="badge success">Done</span> : null}</th></> : null}
            <td {...plannedWho}>{day(item.plannedDate)}{item.endDate ? ` – ${day(item.endDate)}` : ""}</td>
            <td className="numeric" {...plannedWho}>{amount(item.quantity)} {item.uom ?? ""}</td>
            <td className="route-equivalence" {...plannedWho}>{equivalence(item.quantity, item.uom, factors) || <span className="route-muted">-</span>}</td>
            <td {...plannedWho}>{editable && onAssign && !item.completedAt ? <MachinePicker label={`Machines for ${step.processName} on ${day(item.plannedDate)}`} machines={options} value={booked}
                onChange={(ids) => setMessages({ ...messages, [item.id]: onAssign([item.id], ids) })} />
              : machineNames(planned) || <span className="route-muted">Not assigned</span>}
              {(messages[item.id] ?? []).map((message) => <small role="alert" key={message}>{message}</small>)}</td>
            {current && updating && update ? update(true, (quantity, uom) => equivalence(quantity, uom, factors)) : <>
              <td {...open()}>{item.completedAt ? day(item.completedAt) : item.startedAt ? <>Started {day(item.startedAt)}</> : <span className="route-muted">-</span>}</td>
              <td {...open("numeric")}>{reported !== undefined ? `${amount(reported)} ${reportedUom ?? ""}` : soFar !== undefined ? <>{amount(soFar)} {soFarUom}<small className="route-so-far">so far</small></> : <span className="route-muted">-</span>}</td>
              <td {...open("route-equivalence")}>{(reported !== undefined ? equivalence(reported, reportedUom, factors) : soFar !== undefined ? equivalence(soFar, soFarUom, factors) : "") || <span className="route-muted">-</span>}</td>
              <td {...open()}>{item.completedAt || item.startedAt ? machineNames(booked) || <span className="route-muted">-</span> : <span className="route-muted">-</span>}</td>
              <td {...open("route-remarks")}>{item.productionNotes || <span className="route-muted">-</span>}</td>
              <td {...open()}>{next || <span className="route-muted">-</span>}</td>
              <td>{canUpdate ? <button type="button" className="calendar-button" onClick={() => onOpenLine?.(item.id, true)}>{item.completedAt ? "Correct" : "Update"}</button> : null}</td>
            </>}
            {index === 0 ? <td rowSpan={step.lines.length} className="route-yield">{(() => {
              const stage = yields?.stages.find((entry) => entry.calendarId === step.calendar.id);
              if (stage?.ofTheoretical !== undefined || stage?.percent !== undefined) return <>
                {stage.ofTheoretical !== undefined ? <span className={`yield-chip yield-${stage.tone}`} title={`% of theoretical: ${stage.theoreticalWorking}${stage.limit ? ` · QA limits ${limitText(stage.limit)}` : ""}`}>{formatYield(stage.ofTheoretical)}{stage.tone === "out" ? " · outside limits" : ""}</span> : null}
                {stage.percent !== undefined ? <small className="yield-step" title={`Step yield: ${stage.working}`}>Step {formatYield(stage.percent)}{stage.powder ? " by powder" : ""}</small> : null}
                {stage.powder?.targetMg ? <FillNote powder={stage.powder} /> : null}</>;
              if (stage?.missing) return <span className="yield-chip yield-missing" title={`Yield can't be worked out: ${stage.missing}`}>– figure missing</span>;
              return <span className="route-muted">{stage?.started && !stage.done ? "In progress" : "-"}</span>;
            })()}</td> : null}
          </tr>];
          return rows;
        });
      })}</tbody>
      {yields?.final ? <tfoot><tr className="route-final-yield"><th scope="row" colSpan={COLUMNS - 1}>Final yield<small>{yields.final.working ?? (yields.final.missing ? `Can't be worked out: ${yields.final.missing}` : "")}</small></th>
        <td className="route-yield">{yields.final.percent !== undefined ? <span className={`yield-chip yield-${yields.final.tone}`} title={yields.final.limit ? `QA limits ${limitText(yields.final.limit)}` : undefined}>{formatYield(yields.final.percent)}{yields.final.tone === "out" ? " · outside limits" : ""}</span> : <span className="yield-chip yield-missing">–</span>}</td></tr></tfoot> : null}
    </table></div>
  </section>;
}
