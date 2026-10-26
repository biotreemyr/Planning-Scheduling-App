"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CalendarDirectory, UnitCalendar } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, Product, ScheduleEntry } from "@/lib/domain/types";
import { formatDate } from "@/lib/services/dates";
import type { JobOrder } from "@/lib/services/jobOrders";
import type { PurchaseOrder } from "@/lib/services/orders";
import { OPEN_BATCH_STATUSES, periodChoices, periodFor, periodValue, productionOverview, type LateActivity, type PeriodKind } from "@/lib/services/overview";
import { lineEnd } from "@/lib/services/scheduling";
import type { WorkingCalendar } from "@/lib/services/workingDays";
import { yieldTone, type YieldLimits } from "@/lib/services/yields";
import { BarChart, Donut, RowBars, SERIES, STATUS, StatTile, YieldChart } from "./OverviewCharts";
import { usePager } from "./Pager";

const KIND_KEY = "scheduler.reportsPeriod";
const SORT_KEY = "scheduler.reportsLateSort";
type Sort = { key: string; ascending: boolean };
const percent = (part: number, whole: number) => whole ? `${Math.round(part / whole * 100)}%` : "–";

/**
 * Reports → Overview: the key production figures for the unit and processes shown, for a month,
 * quarter or year, as tiles and charts, with the late activities listed under them.
 */
export function ReportsOverview({ filterControls, lines, allLines, entries, orders, jobs, transfers, calendars, machines, directory, products, workDays, yieldLimits, unitName, today }: {
  filterControls: ReactNode;
  lines: PlanLine[]; allLines: PlanLine[]; entries: ScheduleEntry[]; orders: PurchaseOrder[]; jobs: JobOrder[]; transfers: { sourceLineId: string }[];
  calendars: UnitCalendar[]; machines: Machine[]; directory: CalendarDirectory; products: Product[];
  workDays: WorkingCalendar; yieldLimits?: YieldLimits; unitName: string; today: string;
}) {
  const [kind, setKind] = useState<PeriodKind>("month");
  const [value, setValue] = useState(periodValue("month", today));
  // Each person's choice of month, quarter or year is remembered on this computer.
  useEffect(() => {
    try { const saved = localStorage.getItem(KIND_KEY); if (saved === "quarter" || saved === "year") { setKind(saved); setValue(periodValue(saved, today)); } } catch { /* not remembered */ }
  }, [today]);
  const chooseKind = (next: PeriodKind) => { setKind(next); setValue(periodValue(next, today)); try { localStorage.setItem(KIND_KEY, next); } catch { /* not remembered */ } };
  const choices = periodChoices(kind, today, lines.flatMap((line) => [line.plannedDate, lineEnd(line)]));
  const period = periodFor(kind, choices.some((item) => item.value === value) ? value : periodValue(kind, today));
  const f = productionOverview({ lines, entries, allLines, orders, jobs, transfers, calendars, machines, directory, workDays, yieldLimits, period, today });

  const openBatches = OPEN_BATCH_STATUSES.reduce((sum, status) => sum + f.batches[status], 0);
  const busiest = f.machineUse.filter((item) => item.daysBooked);
  const averageUse = f.machineUse.length ? Math.round(f.machineUse.reduce((sum, item) => sum + item.percent, 0) / f.machineUse.length) : 0;

  return <section className="reports-overview">
    {filterControls}
    <div className="operational-filters overview-filters">
      <label>Period<select value={kind} onChange={(event) => chooseKind(event.target.value as PeriodKind)}>
        <option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option>
      </select></label>
      <label>{kind === "year" ? "Year" : kind === "quarter" ? "Quarter" : "Month"}<select value={period.value} onChange={(event) => setValue(event.target.value)}>
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select></label>
      <p className="overview-scope">{unitName} · {calendars.length} process{calendars.length === 1 ? "" : "es"} · {formatDate(period.from)} – {formatDate(period.to)}</p>
    </div>

    <div className="overview-tiles">
      <StatTile label={`Activities planned · ${period.label}`} value={f.activities.planned} note={`${f.activities.completed} completed (${percent(f.activities.completed, f.activities.planned)})`} />
      <StatTile label="Activities late" value={f.late.length} tone={f.late.length ? "critical" : "good"} note="Past their last planned day, not completed" />
      <StatTile label="POs overdue" value={f.ordersOverdue} tone={f.ordersOverdue ? "critical" : "good"} note="Past the delivery date, not completed" />
      <StatTile label="Batches open" value={openBatches} note={`${f.batches["Awaiting testing"]} awaiting testing · ${f.batches["Awaiting release"]} awaiting release`} />
      <StatTile label={`Batches released · ${period.label}`} value={f.released} />
      <StatTile label={`Stages outside yield limits · ${period.label}`} value={f.yieldTones.out} tone={f.yieldTones.out ? "critical" : "good"} note={`${f.yieldTones.near} near a limit · ${f.yieldTones.ok + f.yieldTones.near + f.yieldTones.out + f.yieldTones.none} stages finished`} />
      <StatTile label={`Machine use · ${period.label}`} value={`${averageUse}%`} note={`Average of ${f.machineUse.length} machine${f.machineUse.length === 1 ? "" : "s"} over ${f.offDays.working} working days`} />
      <StatTile label={`Overtime days · ${period.label}`} value={f.offDays.overtime} note={`${f.offDays.closed} closed · ${f.offDays.holidays} public holiday${f.offDays.holidays === 1 ? "" : "s"}`} />
    </div>

    <div className="overview-charts">
      <BarChart title={`Activities by ${kind === "month" ? "week" : "month"} · ${period.label}`} series={[
        { name: "Planned", color: SERIES[0], data: f.bySlot.map((slot) => ({ label: slot.label, value: slot.planned, title: `${formatDate(slot.from)} – ${formatDate(slot.to)}: ${slot.planned} planned` })) },
        { name: "Completed", color: SERIES[1], data: f.bySlot.map((slot) => ({ label: slot.label, value: slot.completed, title: `${formatDate(slot.from)} – ${formatDate(slot.to)}: ${slot.completed} completed` })) }
      ]} />
      <BarChart title={`Activities by process · ${period.label}`} series={[
        { name: "Planned", color: SERIES[0], data: f.byProcess.map((row) => ({ label: row.processName, value: row.planned, title: `${row.processName}: ${row.planned} planned` })) },
        { name: "Completed", color: SERIES[1], data: f.byProcess.map((row) => ({ label: row.processName, value: row.completed, title: `${row.processName}: ${row.completed} completed` })) }
      ]} />
      <YieldChart title={`Yield by process against QA's limits · ${period.label}`} rows={f.yieldByProcess.map((row) => ({ label: row.processName, stages: row.stages, average: row.average, lowest: row.lowest, highest: row.highest, limit: row.limit, tone: yieldTone(row.average, row.limit) }))} />
      <RowBars title={`Machine use · ${period.label} (days booked of ${f.offDays.working} working days)`} empty="No machines for these processes." max={100}
        data={(busiest.length ? busiest : f.machineUse).slice(0, 10).map((item) => ({ label: item.name, value: item.percent, shown: `${item.percent}%`, title: `${item.name}: booked ${item.daysBooked} of ${item.workingDays} working days (${item.percent}%)` }))} />
      <Donut title={`POs due · ${period.label}`} centre="POs" data={[
        { label: "Completed", value: f.ordersDue.Completed, color: STATUS.good },
        { label: "In production", value: f.ordersDue["In production"], color: SERIES[0] },
        { label: "Scheduled", value: f.ordersDue.Scheduled, color: SERIES[6] },
        { label: "Not scheduled", value: f.ordersDue["Not scheduled"], color: STATUS.warning }
      ]} />
      <RowBars title="Open batches by status (now)" data={OPEN_BATCH_STATUSES.map((status) => ({ label: status, value: f.batches[status],
        color: status === "Failed testing" ? STATUS.critical : status === "Under investigation" ? STATUS.warning : SERIES[0] }))} />
      <Donut title={`Days · ${period.label}`} centre="days" data={[
        { label: "Working", value: f.offDays.working - f.offDays.overtime, color: SERIES[0] },
        { label: "Overtime (off day opened)", value: f.offDays.overtime, color: SERIES[1] },
        { label: "Weekly off", value: f.offDays.weeklyOff, color: "#b9b8b2" },
        { label: "Public holiday", value: f.offDays.holidays, color: SERIES[3] },
        { label: "Closed", value: f.offDays.closed, color: SERIES[7] }
      ]} />
    </div>

    <LateList late={f.late} products={products} today={today} />
  </section>;
}

const LATE_COLUMNS: { key: string; label: string; numeric?: boolean; sort: (item: LateActivity, product: string) => string | number }[] = [
  { key: "date", label: "Planned", sort: (item) => lineEnd(item.line) },
  { key: "process", label: "Process", sort: (item) => item.processName },
  { key: "job", label: "Job order / batch", sort: (item) => item.jobNumber ?? item.line.orderReference ?? "" },
  { key: "product", label: "Product", sort: (_item, product) => product },
  { key: "late", label: "Days late", numeric: true, sort: (item) => item.daysLate }
];

// The late activities, newest first; each person's sort is remembered on this computer.
function LateList({ late, products, today }: { late: LateActivity[]; products: Product[]; today: string }) {
  const [sort, setSort] = useState<Sort>({ key: "date", ascending: false });
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(SORT_KEY) ?? "null"); if (saved && typeof saved.key === "string") setSort({ key: saved.key, ascending: !!saved.ascending }); } catch { /* default */ }
  }, []);
  const chooseSort = (next: Sort) => { setSort(next); try { localStorage.setItem(SORT_KEY, JSON.stringify(next)); } catch { /* not remembered */ } };
  const productName = (item: LateActivity) => products.find((product) => product.id === item.line.productId)?.name ?? "";
  const column = LATE_COLUMNS.find((item) => item.key === sort.key) ?? LATE_COLUMNS[0];
  const sorted = [...late].sort((a, b) => {
    const x = column.sort(a, productName(a)), y = column.sort(b, productName(b));
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return result * (sort.ascending ? 1 : -1);
  });
  const { rows, pager } = usePager(sorted, `${sort.key}|${sort.ascending}|${today}`, [25, 50, 100]);
  return <section className="workspace-panel overview-late">
    <div className="panel-title"><div><h2>Late activities ({late.length})</h2></div></div>
    {late.length ? <>
      <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Late activities">
        <table className="orders-table late-table">
          <thead><tr>
            <th scope="col" data-col="number">#</th>
            {LATE_COLUMNS.map((item) => {
              const active = sort.key === item.key;
              const Icon = !active ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return <th scope="col" key={item.key} data-col={item.key} className={item.numeric ? "numeric" : undefined} aria-sort={active ? sort.ascending ? "ascending" : "descending" : "none"}>
                <button type="button" className="table-sort" title={item.key === "date" ? active && !sort.ascending ? "Newest first, click for oldest first" : "Oldest first, click for newest first" : `Sort by ${item.label.toLowerCase()}`}
                  onClick={() => chooseSort({ key: item.key, ascending: active ? !sort.ascending : item.key !== "date" })}>{item.label}<Icon size={13} /></button>
              </th>;
            })}
            <th scope="col" data-col="remarks">Remarks</th>
          </tr></thead>
          <tbody>{rows.map((item) => {
            const index = sorted.indexOf(item);
            const end = lineEnd(item.line);
            return <tr key={item.line.id}>
              <td data-col="number" className="row-number">{index + 1}</td>
              <td data-col="date">{end === item.line.plannedDate ? formatDate(end) : <>{formatDate(item.line.plannedDate)} –<br />{formatDate(end)}</>}</td>
              <td data-col="process">{item.processName || "-"}{item.line.activityType ? <small>{item.line.activityType}</small> : null}</td>
              <td data-col="job">{item.jobNumber ?? item.line.orderReference ?? "-"}{item.batchNumber ? <small>Batch no. {item.batchNumber}</small> : null}</td>
              <td data-col="product">{productName(item) || "-"}</td>
              <td data-col="late" className="numeric">{item.daysLate}</td>
              <td data-col="remarks">{[item.line.startedAt ? `Started ${formatDate(item.line.startedAt)}` : "Not started", item.line.productionNotes?.trim()].filter(Boolean).join(" · ")}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {pager}
    </> : <p className="empty-state">No late activities for these processes.</p>}
  </section>;
}
