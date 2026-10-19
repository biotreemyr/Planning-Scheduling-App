"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileSpreadsheet, FlaskConical, PackageCheck, Timer } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, Product, ScheduleEntry } from "@/lib/domain/types";
import type { ProductionActual } from "@/lib/services/actuals";
import { localDateKey } from "@/lib/services/calendarPrint";
import { formatDate, formatDateTime } from "@/lib/services/dates";
import type { JobOrder } from "@/lib/services/jobOrders";
import { machineLabel } from "@/lib/services/machines";
import { poLabel, type PurchaseOrder } from "@/lib/services/orders";
import type { WipTransfer } from "@/lib/services/productionFlow";
import {
  BATCH_STATUSES, DELIVERY_STATUSES, batchReport, batchSummary, deliveryReport, deliverySummary, flowAttention, isClosedStatus, machineLoad, planAdherence,
  type BatchRow, type DeliveryRow, type DeliveryStatus
} from "@/lib/services/reports";
import { downloadReport, type ReportCell, type ReportColumn } from "@/lib/services/reportsExcel";
import { formatYield, limitText, type YieldLimits, type YieldTone } from "@/lib/services/yields";
import { usePager } from "./Pager";

type ReportKey = "delivery" | "flow" | "batches";
const REPORTS: { key: ReportKey; label: string; hint: string }[] = [
  { key: "delivery", label: "Orders & Delivery", hint: "Each PO item: will it be delivered on time and in full?" },
  { key: "flow", label: "Production Flow", hint: "What on the floor is late, waiting or overbooked, and is the plan kept?" },
  { key: "batches", label: "Batch Yield & Release", hint: "Each batch: its yields against QA's limits, and where it is in testing and release" }
];
const REPORT_STORAGE = "scheduler.reports.view";

const amount = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
const productLabel = (product?: Product) => product ? `${product.sku} · ${product.name}` : "Unknown product";
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${amount(Math.abs(value))}`;
const thisMonth = () => localDateKey(new Date()).slice(0, 7);
const monthEnd = (month: string) => { const [year, mon] = month.split("-").map(Number); return localDateKey(new Date(year, mon, 0)); };

function useRemembered<T extends string>(key: string, initial: T, valid: (value: string | null) => value is T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => { try { const saved = localStorage.getItem(key); if (valid(saved)) setValue(saved); } catch { /* starts on the default */ } }, [key, valid]);
  return [value, (next: T) => { setValue(next); try { localStorage.setItem(key, next); } catch { /* not remembered */ } }] as const;
}
const isReport = (value: string | null): value is ReportKey => REPORTS.some((item) => item.key === value);

function Tabs<T extends string>({ label, items, value, onChange }: { label: string; items: { key: T; label: string; hint?: string; count?: number }[]; value: T; onChange: (key: T) => void }) {
  return <div className="view-switch order-views" role="tablist" aria-label={label}>
    {items.map((item) => <button key={item.key} type="button" role="tab" aria-selected={value === item.key} title={item.hint} onClick={() => onChange(item.key)}>
      {item.label}{item.count !== undefined ? <span className="badge neutral">{item.count}</span> : null}</button>)}
  </div>;
}
function Metric({ icon, value, label, hint }: { icon: ReactNode; value: ReactNode; label: string; hint?: string }) {
  return <div className="metric" title={hint}>{icon}<span>{value}</span><p>{label}</p></div>;
}
function ExcelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="calendar-button" disabled={disabled} onClick={onClick}><FileSpreadsheet size={16} />Download Excel</button>;
}
const toneClass = (tone: YieldTone) => tone === "none" ? "yield-chip" : `yield-chip yield-${tone}`;

export type ReportsAccess = { delivery: boolean; batches: boolean; printDelivery: boolean; printFlow: boolean; printBatches: boolean };

export function ReportsPanel(props: {
  access: ReportsAccess; unitName: string;
  // Orders and job orders in the reports' unit and stream choice; every activity (for yields and progress).
  orders: PurchaseOrder[]; allOrders: PurchaseOrder[]; jobOrders: JobOrder[]; allLines: PlanLine[];
  // The activities, bookings and handovers of the processes shown, and the machines they use.
  lines: PlanLine[]; entries: ScheduleEntry[]; transfers: WipTransfer[]; machines: Machine[];
  actuals: ProductionActual[]; directory: CalendarDirectory; products: Product[]; yieldLimits: YieldLimits;
  filters: ReactNode; actualsSection: ReactNode; wipInbox: ReactNode;
  onOpenActivity: (lineId: string) => void;
}) {
  const reports = REPORTS.filter((item) => item.key === "flow" || props.access[item.key]);
  const [stored, setReport] = useRemembered<ReportKey>(REPORT_STORAGE, "delivery", isReport);
  const report = reports.some((item) => item.key === stored) ? stored : reports[0].key;
  return <section className="reports-layout reports-panel">
    <div className="reports-head">
      <Tabs label="Reports" items={reports} value={report} onChange={setReport} />
      {props.filters}
    </div>
    {report === "delivery" ? <DeliveryReport {...props} /> : report === "flow" ? <FlowReport {...props} /> : <BatchReport {...props} />}
  </section>;
}

// ---- Orders & Delivery ----

type DeliveryView = "open" | "closed" | "all" | Exclude<DeliveryStatus, "Closed on time" | "Closed late" | "Closed">;
const DELIVERY_BADGE: Record<DeliveryStatus, string> = { "Not planned": "neutral", "On track": "success", "At risk": "warning", Overdue: "danger", "Closed on time": "success", "Closed late": "warning", Closed: "neutral" };
const DELIVERY_RANK: DeliveryStatus[] = ["Overdue", "At risk", "Not planned", "On track", "Closed late", "Closed on time", "Closed"];
const isDeliveryView = (value: string | null): value is DeliveryView => ["open", "closed", "all", "Not planned", "On track", "At risk", "Overdue"].includes(value ?? "");

function DeliveryReport({ orders, allOrders, jobOrders, allLines, directory, products, access, unitName }: Parameters<typeof ReportsPanel>[0]) {
  const today = localDateKey(new Date());
  const [view, setView] = useRemembered<DeliveryView>("scheduler.reports.delivery", "open", isDeliveryView);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const all = deliveryReport(orders, jobOrders, allLines, directory, products, today);
  const text = search.trim().toLowerCase();
  const filtered = all.filter((row) => (!month || row.order.deliveryDate?.slice(0, 7) === month)
    && (!text || [row.order.poNumber, row.order.customerName, row.order.soNumber, row.product?.sku, row.product?.name].some((value) => value?.toLowerCase().includes(text))));
  const inView = (row: DeliveryRow, key: DeliveryView) => key === "all" || (key === "open" ? !isClosedStatus(row.status) : key === "closed" ? isClosedStatus(row.status) : row.status === key);
  const views: DeliveryView[] = ["open", "Overdue", "At risk", "Not planned", "On track", "closed", "all"];
  const label = (key: DeliveryView) => key === "open" ? "Open" : key === "closed" ? "Closed" : key === "all" ? "All" : key;
  const hint = (key: DeliveryView) => key === "open" ? "Every PO item not yet closed" : key === "closed" ? "Closed PO items, on time or late" : key === "all" ? "Every PO item" : DELIVERY_STATUSES.find((item) => item.key === key)?.hint;
  const rows = filtered.filter((row) => inView(row, view)).sort((a, b) => DELIVERY_RANK.indexOf(a.status) - DELIVERY_RANK.indexOf(b.status)
    || (isClosedStatus(a.status) ? (b.closedOn ?? "").localeCompare(a.closedOn ?? "") : (a.order.deliveryDate ?? "9999").localeCompare(b.order.deliveryDate ?? "9999")));
  const summary = deliverySummary(filtered);
  const { rows: page, pager } = usePager(rows, `${view}|${search}|${month}`, [50, 100]);
  const released = (row: DeliveryRow) => row.released.map((item) => `${amount(item.quantity)} ${item.uom}`).join(", ");
  const lateText = (row: DeliveryRow) => row.daysLate === undefined ? "" : row.daysLate > 0 ? `${row.daysLate} day${row.daysLate === 1 ? "" : "s"} late` : row.daysLate < 0 ? `${-row.daysLate} day${row.daysLate === -1 ? "" : "s"} early` : "On the day";
  function excel() {
    const columns: ReportColumn[] = [{ header: "Customer", width: 28 }, { header: "PO number", width: 20 }, { header: "SO number", width: 14 }, { header: "Product code", width: 16 }, { header: "Product", width: 36 },
      { header: "Order qty", width: 12, kind: "number" }, { header: "UOM", width: 10 }, { header: "Job orders", width: 10, kind: "number" }, { header: "Finished", width: 12, kind: "number" }, { header: "Released to PO", width: 18 },
      { header: "Planned finish", width: 14, kind: "date" }, { header: "Delivery date", width: 14, kind: "date" }, { header: "Days late (+) / early (−)", width: 14, kind: "number" },
      { header: "Closed on", width: 14, kind: "date" }, { header: "Closed qty", width: 12, kind: "number" }, { header: "Over / under", width: 12, kind: "number" }, { header: "Status", width: 16 }];
    const data: ReportCell[][] = rows.map((row) => [row.order.customerName, poLabel(row.order, allOrders), row.order.soNumber, row.product?.sku, row.product?.name, row.order.quantity, row.order.uom, row.jobCount,
      row.finished || undefined, released(row), row.plannedFinish, row.order.deliveryDate, row.daysLate, row.closedOn, row.order.closedQuantity, row.overUnder, row.status]);
    const caption = [`${unitName}`, label(view), month ? `delivery in ${formatDate(`${month}-01`).slice(3)}` : "all delivery dates", ...(text ? [`search "${search.trim()}"`] : [])].join(" · ");
    void downloadReport(columns, data, { title: "Orders & Delivery", caption, sheet: "Orders & Delivery", at: formatDateTime(new Date()), file: `orders-delivery-${today}.xlsx` });
  }
  return <>
    <div className="metric-row">
      <Metric icon={<ClipboardList size={18} />} value={summary.open} label="Open PO items" />
      <Metric icon={<AlertTriangle size={18} />} value={summary.overdue} label="Overdue" hint="The delivery date has passed and the PO is not closed" />
      <Metric icon={<CalendarClock size={18} />} value={summary.atRisk} label="At risk" hint="Planned to finish after the delivery date" />
      <Metric icon={<CheckCircle2 size={18} />} value={summary.onTimePercent === undefined ? "–" : `${summary.onTimePercent}%`} label="Closed by the delivery date" hint="Of the closed PO items with a delivery date. Stands in for on-time delivery until dispatch dates are recorded." />
    </div>
    <div className="workspace-panel orders-list">
      <div className="orders-toolbar">
        <h2>Orders & Delivery</h2>
        <label>Search<input type="search" value={search} placeholder="PO, customer, product" onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Delivery month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        {access.printDelivery ? <ExcelButton disabled={!rows.length} onClick={excel} /> : null}
        <span className="result-count" aria-live="polite">{rows.length} of {all.length} PO items</span>
      </div>
      <Tabs label="Show PO items" value={view} onChange={setView} items={views.map((key) => ({ key, label: label(key), hint: hint(key), count: filtered.filter((row) => inView(row, key)).length }))} />
      <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Orders & Delivery">
        <table className="orders-table report-table">
          <thead><tr><th>Customer</th><th>PO</th><th>Product</th><th className="numeric">Order qty</th><th className="numeric">Job orders</th><th className="numeric">Finished</th><th>Released to PO</th><th>Planned finish</th><th>Delivery</th><th>Status</th></tr></thead>
          <tbody>{page.map((row) => <tr key={row.order.id}>
            <td>{row.order.customerName ?? <span className="route-muted">-</span>}</td>
            <td>{poLabel(row.order, allOrders)}{row.order.soNumber ? <small>{row.order.soNumber}</small> : null}</td>
            <td className="report-product">{productLabel(row.product)}</td>
            <td className="numeric">{amount(row.order.quantity)} {row.order.uom}</td>
            <td className="numeric">{row.jobCount || <span className="route-muted">0</span>}</td>
            <td className="numeric">{row.finished ? amount(row.finished) : <span className="route-muted">-</span>}</td>
            <td>{released(row) || <span className="route-muted">-</span>}</td>
            <td>{row.plannedFinish ? formatDate(row.plannedFinish) : <span className="route-muted">Not planned</span>}</td>
            <td>{row.order.deliveryDate ? formatDate(row.order.deliveryDate) : <span className="route-muted">Not set</span>}{lateText(row) ? <small>{lateText(row)}</small> : null}</td>
            <td><span className={`badge ${DELIVERY_BADGE[row.status]}`}>{row.status}</span>
              {row.closedOn ? <small>{formatDate(row.closedOn)} · {amount(row.order.closedQuantity ?? 0)} {row.order.closedUom ?? row.order.uom}{row.overUnder ? ` (${signed(row.overUnder)})` : ""}</small> : null}</td>
          </tr>)}</tbody>
        </table>
        {!rows.length ? <p className="route-muted report-empty">No PO items here.</p> : null}
      </div>
      {pager}
      <p className="report-note">Planned finish is the last day any of the PO's activities is planned. Closed by the delivery date stands in for on-time delivery until dispatch dates are recorded.</p>
    </div>
  </>;
}

// ---- Production Flow ----

type FlowView = "attention" | "adherence" | "load" | "actuals";
const isFlowView = (value: string | null): value is FlowView => ["attention", "adherence", "load", "actuals"].includes(value ?? "");

function FlowReport({ lines, entries, transfers, machines, products, directory, actuals, allOrders, jobOrders, access, unitName, actualsSection, wipInbox, onOpenActivity }: Parameters<typeof ReportsPanel>[0]) {
  const today = localDateKey(new Date());
  const [view, setView] = useRemembered<FlowView>("scheduler.reports.flow", "attention", isFlowView);
  const [month, setMonth] = useState(thisMonth);
  const flow = flowAttention(lines, entries, transfers, machines, products, directory, today);
  const adherence = planAdherence(lines, actuals, directory, `${month}-01`, monthEnd(month));
  const load = machineLoad(entries, machines, today);
  const attention = flow.late.length + flow.conflicts.length + flow.unbooked.length + flow.wip.length;
  const product = (id: string) => products.find((item) => item.id === id);
  const batch = (line: PlanLine) => jobOrders.find((job) => job.id === line.jobOrderId)?.number ?? line.orderReference ?? "";
  const po = (line: PlanLine) => { const order = allOrders.find((item) => item.id === line.productionOrderId); return order ? poLabel(order, allOrders) : ""; };
  const at = formatDateTime(new Date());
  function excel() {
    if (view === "attention") {
      const columns: ReportColumn[] = [{ header: "Needs attention", width: 22 }, { header: "Process", width: 18 }, { header: "Product", width: 36 }, { header: "Job order / batch", width: 18 }, { header: "PO", width: 18 },
        { header: "Planned", width: 14, kind: "date" }, { header: "Last day", width: 14, kind: "date" }, { header: "Days", width: 8, kind: "number" }, { header: "Detail", width: 50 }];
      const data: ReportCell[][] = [
        ...flow.late.map((item) => ["Late", item.processName, productLabel(product(item.line.productId)), batch(item.line), po(item.line), item.line.plannedDate, item.end, item.daysLate, item.started ? "Started, not completed" : "Not started"]),
        ...flow.conflicts.map((item) => ["Machine double-booked", "", "", "", "", undefined, undefined, undefined, item.message]),
        ...flow.unbooked.map((line) => ["No machine booked", directory.calendars.find((item) => item.id === line.calendarId)?.name ?? "", productLabel(product(line.productId)), batch(line), po(line), line.plannedDate, line.endDate, undefined, ""]),
        ...flow.wip.map((item) => ["WIP waiting", `${item.fromName} → ${item.toName}`, productLabel(product(item.transfer.productId)), item.transfer.orderReference, "", item.sentOn, undefined, item.daysWaiting, `${amount(item.transfer.quantity)} ${item.transfer.uom}`])
      ];
      void downloadReport(columns, data, { title: "Production Flow · Needs attention", caption: `${unitName} · as at ${formatDate(today)}`, sheet: "Needs attention", at, file: `production-flow-attention-${today}.xlsx` });
    } else if (view === "adherence") {
      const columns: ReportColumn[] = [{ header: "Process", width: 22 }, { header: "Completed", width: 12, kind: "number" }, { header: "On time", width: 12, kind: "number" }, { header: "Late", width: 12, kind: "number" }, { header: "% on time", width: 12, kind: "number" }];
      const data: ReportCell[][] = [...adherence.byProcess.map((row) => [row.processName, row.completed, row.onTime, row.late, row.percent]), ["All processes", adherence.completed, adherence.onTime, adherence.late, adherence.percent]];
      void downloadReport(columns, data, { title: "Production Flow · Plan adherence", caption: `${unitName} · completed ${formatDate(`${month}-01`)} – ${formatDate(monthEnd(month))}`, sheet: "Plan adherence", at, file: `production-flow-adherence-${month}.xlsx` });
    } else {
      const columns: ReportColumn[] = [{ header: "Machine", width: 44 }, ...load.weeks.flatMap((week) => [{ header: `Week of ${formatDate(week)} hours`, width: 14, kind: "number" as const }, { header: "Days", width: 8, kind: "number" as const }]), { header: "Total hours", width: 12, kind: "number" }];
      const data: ReportCell[][] = load.rows.map((row) => [machineLabel(row.machine), ...row.weeks.flatMap((cell) => [cell.hours, cell.days]), row.total]);
      void downloadReport(columns, data, { title: "Production Flow · Machine load", caption: `${unitName} · hours booked, four weeks from ${formatDate(load.weeks[0])}`, sheet: "Machine load", at, file: `production-flow-machine-load-${today}.xlsx` });
    }
  }
  return <>
    <div className="metric-row">
      <Metric icon={<AlertTriangle size={18} />} value={flow.late.length} label="Late activities" hint="Open activities whose last planned day has passed" />
      <Metric icon={<CalendarClock size={18} />} value={flow.conflicts.length} label="Machine double-bookings" />
      <Metric icon={<ClipboardList size={18} />} value={flow.unbooked.length} label="No machine booked" hint="Open activities, not yet late, with no machine booking" />
      <Metric icon={<Timer size={18} />} value={flow.wip.length} label={flow.wip.length ? `WIP waiting · longest ${flow.wip[0].daysWaiting} d` : "WIP waiting"} hint="Handovers not yet received by the next process" />
    </div>
    <div className="workspace-panel orders-list">
      <div className="orders-toolbar">
        <h2>Production Flow</h2>
        {view === "adherence" ? <label>Completed in<input type="month" value={month} required onChange={(event) => setMonth(event.target.value || thisMonth())} /></label> : null}
        {access.printFlow && view !== "actuals" ? <ExcelButton onClick={excel} /> : null}
      </div>
      <Tabs label="Production flow" value={view} onChange={setView} items={[
        { key: "attention", label: "Needs attention", hint: "Late activities, machine double-bookings, activities with no machine, WIP waiting", count: attention },
        { key: "adherence", label: "Plan adherence", hint: "Activities completed on or before their last planned day, by process" },
        { key: "load", label: "Machine load", hint: "Hours booked on each machine over the next four weeks" },
        { key: "actuals", label: "Actual production & deviations", hint: "Actual against planned for each activity, with deviations" }
      ]} />
      {view === "attention" ? <div className="report-sections">
        <ReportSection title="Late activities" count={flow.late.length} empty="Nothing is late.">
          <thead><tr><th>Process</th><th>Product</th><th>Job order / batch</th><th>PO</th><th>Planned</th><th className="numeric">Days late</th><th /></tr></thead>
          <tbody>{flow.late.map((item) => <tr key={item.line.id}>
            <td>{item.processName}</td><td>{productLabel(product(item.line.productId))}</td><td>{batch(item.line) || <span className="route-muted">-</span>}</td><td>{po(item.line) || <span className="route-muted">-</span>}</td>
            <td>{formatDate(item.line.plannedDate)}{item.end !== item.line.plannedDate ? ` – ${formatDate(item.end)}` : ""}<small>{item.started ? "Started, not completed" : "Not started"}</small></td>
            <td className="numeric"><span className="badge danger">{item.daysLate} d</span></td>
            <td><button type="button" className="link-button" onClick={() => onOpenActivity(item.line.id)}>Open</button></td>
          </tr>)}</tbody>
        </ReportSection>
        <ReportSection title="Machine double-bookings" count={flow.conflicts.length} empty="No machine is double-booked.">
          <thead><tr><th>Machine</th><th>Detail</th></tr></thead>
          <tbody>{flow.conflicts.map((item) => <tr key={item.id}><td>{machineLabel(machines.find((machine) => machine.id === item.machineId)) || "Machine"}</td><td>{item.message}</td></tr>)}</tbody>
        </ReportSection>
        <ReportSection title="No machine booked" count={flow.unbooked.length} empty="Every open activity has its machine booked.">
          <thead><tr><th>Process</th><th>Product</th><th>Job order / batch</th><th>PO</th><th>Planned</th><th /></tr></thead>
          <tbody>{flow.unbooked.map((line) => <tr key={line.id}>
            <td>{directory.calendars.find((item) => item.id === line.calendarId)?.name}</td><td>{productLabel(product(line.productId))}</td><td>{batch(line) || <span className="route-muted">-</span>}</td><td>{po(line) || <span className="route-muted">-</span>}</td>
            <td>{formatDate(line.plannedDate)}</td><td><button type="button" className="link-button" onClick={() => onOpenActivity(line.id)}>Open</button></td>
          </tr>)}</tbody>
        </ReportSection>
        <ReportSection title="WIP waiting to be received" count={flow.wip.length} empty="Every handover has been received.">
          <thead><tr><th>From → to</th><th>Product</th><th>Batch</th><th className="numeric">Quantity</th><th>Sent</th><th className="numeric">Waiting</th></tr></thead>
          <tbody>{flow.wip.map((item) => <tr key={item.transfer.id}>
            <td>{item.fromName} → {item.toName}</td><td>{productLabel(product(item.transfer.productId))}</td><td>{item.transfer.orderReference || <span className="route-muted">-</span>}</td>
            <td className="numeric">{amount(item.transfer.quantity)} {item.transfer.uom}</td><td>{formatDate(item.sentOn)}<small>by {item.transfer.createdBy}</small></td>
            <td className="numeric"><span className={`badge ${item.daysWaiting > 2 ? "warning" : "neutral"}`}>{item.daysWaiting} d</span></td>
          </tr>)}</tbody>
        </ReportSection>
        <details className="wip-reports"><summary>Receive or plan incoming WIP</summary>{wipInbox}</details>
      </div> : null}
      {view === "adherence" ? <>
        <div className="orders-table-scroll"><table className="orders-table report-table">
          <thead><tr><th>Process</th><th className="numeric">Completed</th><th className="numeric">On time</th><th className="numeric">Late</th><th className="numeric">% on time</th></tr></thead>
          <tbody>{adherence.byProcess.map((row) => <tr key={row.calendarId}><td>{row.processName}</td><td className="numeric">{row.completed}</td><td className="numeric">{row.onTime}</td><td className="numeric">{row.late}</td><td className="numeric">{row.percent}%</td></tr>)}
            <tr className="report-total"><th>All processes</th><td className="numeric">{adherence.completed}</td><td className="numeric">{adherence.onTime}</td><td className="numeric">{adherence.late}</td><td className="numeric">{adherence.percent === undefined ? "–" : `${adherence.percent}%`}</td></tr></tbody>
        </table></div>
        <p className="report-note">On time: completed on or before the activity's last planned day. The production date keyed in with the result is used; without one, the day it was keyed in.</p>
      </> : null}
      {view === "load" ? <>
        <div className="orders-table-scroll"><table className="orders-table report-table">
          <thead><tr><th>Machine</th>{load.weeks.map((week) => <th key={week} className="numeric">Week of {formatDate(week)}</th>)}<th className="numeric">Total</th></tr></thead>
          <tbody>{load.rows.map((row) => <tr key={row.machine.id}><td>{machineLabel(row.machine)}</td>
            {row.weeks.map((cell, index) => <td key={index} className="numeric">{cell.hours ? <>{amount(cell.hours)} h<small>{cell.days} day{cell.days === 1 ? "" : "s"}</small></> : <span className="route-muted">-</span>}</td>)}
            <td className="numeric"><strong>{row.total ? `${amount(row.total)} h` : "-"}</strong></td></tr>)}</tbody>
        </table></div>
        <p className="report-note">Hours booked, not a utilisation %: available hours per machine are not set in the app yet.</p>
      </> : null}
      {view === "actuals" ? actualsSection : null}
    </div>
  </>;
}

function ReportSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return <section className="report-section">
    <h3>{title} <span className={`badge ${count ? "warning" : "neutral"}`}>{count}</span></h3>
    {count ? <div className="orders-table-scroll"><table className="orders-table report-table">{children}</table></div> : <p className="route-muted">{empty}</p>}
  </section>;
}

// ---- Batch Yield & Release ----

type BatchView = "all" | "quarantine" | BatchRow["status"];
const STATUS_BADGE: Record<BatchRow["status"], string> = { "In production": "info", "Awaiting testing": "warning", "Under investigation": "warning", "Failed testing": "danger", "Awaiting release": "warning", Released: "success", Rejected: "danger" };
const isBatchView = (value: string | null): value is BatchView => value === "all" || value === "quarantine" || BATCH_STATUSES.some((item) => item.key === value);

function BatchReport({ jobOrders, allOrders, allLines, transfers, actuals, directory, products, yieldLimits, access, unitName }: Parameters<typeof ReportsPanel>[0]) {
  const today = localDateKey(new Date());
  const [view, setView] = useRemembered<BatchView>("scheduler.reports.batches", "all", isBatchView);
  const [search, setSearch] = useState("");
  const all = batchReport(jobOrders, allOrders, allLines, transfers, actuals, directory, products, yieldLimits, today)
    .sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt) || b.job.number.localeCompare(a.job.number, undefined, { numeric: true }));
  const text = search.trim().toLowerCase();
  const filtered = all.filter((row) => !text || [row.job.number, row.job.batchNumber, row.order?.poNumber, row.order?.customerName, row.product?.sku, row.product?.name].some((value) => value?.toLowerCase().includes(text)));
  const inView = (row: BatchRow, key: BatchView) => key === "all" || (key === "quarantine" ? row.daysWaiting !== undefined : row.status === key);
  const rows = filtered.filter((row) => inView(row, view));
  const summary = batchSummary(filtered);
  const { rows: page, pager } = usePager(rows, `${view}|${search}`, [50, 100]);
  const stagesText = (row: BatchRow) => row.stages.filter((stage) => stage.ofTheoretical !== undefined).map((stage) => `${stage.processName} ${formatYield(stage.ofTheoretical)}`).join(" · ");
  const label = (row: BatchRow) => row.job.batchNumber ? `${row.job.number} · ${row.job.batchNumber}` : row.job.number;
  function excel() {
    const columns: ReportColumn[] = [{ header: "Job order", width: 14 }, { header: "Batch no.", width: 14 }, { header: "PO", width: 18 }, { header: "Customer", width: 26 }, { header: "Product", width: 36 },
      { header: "Yield by process (% of theoretical)", width: 60 }, { header: "Final yield %", width: 12, kind: "percent" }, { header: "Outside QA limits", width: 12 }, { header: "Deviations", width: 10, kind: "number" },
      { header: "Finished", width: 13, kind: "date" }, { header: "Tested", width: 13, kind: "date" }, { header: "Result", width: 18 }, { header: "Released", width: 13, kind: "date" }, { header: "Rejected", width: 13, kind: "date" },
      { header: "Days to release", width: 12, kind: "number" }, { header: "Days waiting", width: 12, kind: "number" }, { header: "Released qty", width: 12, kind: "number" }, { header: "UOM", width: 10 }, { header: "Other uses", width: 12, kind: "number" }, { header: "Status", width: 18 }];
    const data: ReportCell[][] = rows.map((row) => [row.job.number, row.job.batchNumber, row.order ? poLabel(row.order, allOrders) : "", row.order?.customerName, productLabel(row.product), stagesText(row),
      row.final?.percent === undefined ? undefined : Math.round(row.final.percent * 10) / 10, row.outOfLimits ? "Yes" : "", row.deviations || undefined, row.finishedOn, row.testedOn, row.result, row.releasedOn, row.rejectedOn,
      row.daysToRelease, row.daysWaiting, row.released?.quantity, row.released?.uom, row.otherUses || undefined, row.status]);
    const caption = [unitName, view === "all" ? "All batches" : view === "quarantine" ? "Waiting on QC or QA" : view, ...(text ? [`search "${search.trim()}"`] : [])].join(" · ");
    void downloadReport(columns, data, { title: "Batch Yield & Release", caption, sheet: "Batch Yield & Release", at: formatDateTime(new Date()), file: `batch-yield-release-${today}.xlsx` });
  }
  return <>
    <div className="metric-row">
      <Metric icon={<FlaskConical size={18} />} value={summary.averageFinal === undefined ? "–" : `${summary.averageFinal.toFixed(1)}%`} label="Average final yield" hint="Of the batches with a final yield worked out" />
      <Metric icon={<AlertTriangle size={18} />} value={summary.outOfLimits} label="Outside QA limits" hint="A process or the final yield outside QA's limits" />
      <Metric icon={<PackageCheck size={18} />} value={summary.quarantine} label="Waiting on QC or QA" hint="Finished, not yet released or rejected: not yet saleable" />
      <Metric icon={<Timer size={18} />} value={summary.averageDaysToRelease === undefined ? "–" : `${summary.averageDaysToRelease} d`} label="Average days finished to released" />
    </div>
    <div className="workspace-panel orders-list">
      <div className="orders-toolbar">
        <h2>Batch Yield & Release</h2>
        <label>Search<input type="search" value={search} placeholder="Job order, batch, PO, product" onChange={(event) => setSearch(event.target.value)} /></label>
        {access.printBatches ? <ExcelButton disabled={!rows.length} onClick={excel} /> : null}
        <span className="result-count" aria-live="polite">{rows.length} of {all.length} batches</span>
      </div>
      <Tabs label="Show batches" value={view} onChange={setView} items={[
        { key: "all", label: "All", hint: "Every batch", count: filtered.length },
        { key: "quarantine", label: "Waiting on QC or QA", hint: "Finished, not yet released or rejected", count: filtered.filter((row) => inView(row, "quarantine")).length },
        ...BATCH_STATUSES.map((item) => ({ key: item.key as BatchView, label: item.key, hint: item.hint, count: filtered.filter((row) => row.status === item.key).length }))
      ]} />
      <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Batch Yield & Release">
        <table className="orders-table report-table">
          <thead><tr><th>Job order · batch</th><th>PO</th><th>Product</th><th>Yield by process</th><th>Final yield</th><th>Finished</th><th>Tested</th><th>Released</th><th className="numeric">Released qty</th><th>Status</th></tr></thead>
          <tbody>{page.map((row) => <tr key={`${row.job.id}-${row.order?.id}`}>
            <td>{label(row)}{row.deviations ? <small><span className="badge warning">{row.deviations} deviation{row.deviations === 1 ? "" : "s"}</span></small> : null}</td>
            <td>{row.order ? poLabel(row.order, allOrders) : <span className="route-muted">-</span>}{row.order?.customerName ? <small>{row.order.customerName}</small> : null}</td>
            <td className="report-product">{productLabel(row.product)}</td>
            <td className="report-yield-cell"><div className="report-yields">{row.stages.length ? row.stages.map((stage) => <span key={stage.calendarId} className={toneClass(stage.tone)} title={[`${stage.processName}: ${formatYield(stage.ofTheoretical)} of theoretical`, stage.percent !== undefined ? `step yield ${formatYield(stage.percent)}` : "", stage.limit ? `QA limits ${limitText(stage.limit)}` : "", stage.missing ?? ""].filter(Boolean).join(" · ")}>
              {stage.processName} {stage.done ? formatYield(stage.ofTheoretical) : "…"}</span>) : <span className="route-muted">Not planned</span>}</div></td>
            <td>{row.final?.percent !== undefined ? <span className={toneClass(row.final.tone)} title={row.final.limit ? `QA limits ${limitText(row.final.limit)}` : "No QA limit set"}>{formatYield(row.final.percent)}</span> : <span className="route-muted">-</span>}</td>
            <td>{row.finishedOn ? formatDate(row.finishedOn) : <span className="route-muted">-</span>}</td>
            <td>{row.testedOn ? <>{formatDate(row.testedOn)}<small>{row.result}</small></> : <span className="route-muted">-</span>}</td>
            <td>{row.releasedOn ? <>{formatDate(row.releasedOn)}<small>{row.daysToRelease} d after finishing</small></> : row.rejectedOn ? <>{formatDate(row.rejectedOn)}<small>Rejected</small></> : row.daysWaiting !== undefined ? <span className={`badge ${row.daysWaiting > 7 ? "warning" : "neutral"}`}>Waiting {row.daysWaiting} d</span> : <span className="route-muted">-</span>}</td>
            <td className="numeric">{row.released ? `${amount(row.released.quantity)} ${row.released.uom}` : <span className="route-muted">-</span>}{row.otherUses ? <small>+{amount(row.otherUses)} other uses</small> : null}</td>
            <td><span className={`badge ${STATUS_BADGE[row.status]}`}>{row.status}</span></td>
          </tr>)}</tbody>
        </table>
        {!rows.length ? <p className="route-muted report-empty">No batches here.</p> : null}
      </div>
      {pager}
      <p className="report-note">Yield by process is the % of theoretical (what the process made against the batch formula), coloured against QA's limits; hover for the step yield. Without QA limits a yield shows grey.</p>
    </div>
  </>;
}
