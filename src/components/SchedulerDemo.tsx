"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Factory,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  XCircle
} from "lucide-react";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { StatusBadge } from "@/components/StatusBadge";
import PlanningCalendar from "@/components/PlanningCalendar";
import { ActivityWorkspace } from "@/components/ActivityWorkspace";
import { CalendarAdmin } from "@/components/CalendarAdmin";
import { CatalogAdmin } from "@/components/CatalogAdmin";
import { validateDirectoryChange } from "@/lib/services/adminConfiguration";
import { EndProduction, WipInbox } from "@/components/ProductionFlow";
import { accessibleCalendars, selectedUnitCalendars, scopeCalendarRecords, type CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { WorkspaceEnvelope } from "@/lib/domain/workspace";
import { useWorkspacePersistence } from "@/components/WorkspacePersistence";
import { validateCompletion, type CompletionInput, type WipTransfer } from "@/lib/services/productionFlow";
import { localDateKey } from "@/lib/services/calendarPrint";
import { ProductionActuals, type ActualInput } from "@/components/ProductionActuals";
import { validateActual, type ProductionActual } from "@/lib/services/actuals";
import { batchKilograms } from "@/lib/services/measurements";
import { MeasurementProvider, MeasurementAdmin, useSettings } from "@/components/MeasurementSettings";
import type {
  Employee,
  Machine,
  PlanLine,
  Product,
  ScheduleEntry,
  ScheduleEntryStatus,
  WorkCentre
} from "@/lib/domain/types";
import { priorities, scheduleStatuses } from "@/lib/domain/types";
import { seedData } from "@/lib/seed";
import { findMachineConflicts, hasConflict } from "@/lib/services/conflicts";
import { getScheduleReport } from "@/lib/services/reports";
import { syncPlanLineStatuses, validateScheduleEntry } from "@/lib/services/scheduling";

type Tab = "planner" | "master" | "reports";

const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "planner", label: "Planner Board", icon: CalendarDays },
  { id: "master", label: "Admin", icon: LayoutGrid },
  { id: "reports", label: "Reports", icon: ClipboardList }
];

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function toDisplayDate(value: string) {
  return value.split("-").reverse().join("-");
}

function toTimeRange(entry: ScheduleEntry) {
  const format = new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${format.format(new Date(entry.startAt))} - ${format.format(new Date(entry.endAt))}`;
}

function labelFor<T extends { id: string; name: string }>(items: T[], id?: string) {
  return items.find((item) => item.id === id)?.name ?? "Unassigned";
}

function AppHeader({
  activeTab,
  onTabChange,
  conflictCount
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  conflictCount: number;
}) {
  return (
    <aside className="app-header">
      <div className="workstation-brand">
        <strong>Bio Tree<span> / OS</span></strong>
        <p>Production workspace</p>
      </div>
      <nav className="tab-list" aria-label="Scheduler sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={activeTab === tab.id ? "tab active" : "tab"}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              type="button"
            >
              <Icon size={17} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <button type="button" onClick={() => onTabChange("reports")} className={conflictCount > 0 ? "alert-pill visible" : "alert-pill"}>
        <AlertTriangle size={16} />
        <span>{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span>
      </button>
      <div className="sidebar-footer">Bio Tree Biotechnology<p>Planning & production</p></div>
    </aside>
  );
}

function PlannerBoard({
  processNames,
  calendars,
  filterControls,
  calendarTitle,
  entries,
  machines,
  planLines,
  products,
  onAddLine,
  onMoveLine,
  canPlan,
  onSelect
}: {
  processNames: Record<string, string>;
  calendars: UnitCalendar[];
  filterControls: ReactNode;
  calendarTitle: string;
  entries: ScheduleEntry[];
  machines: Machine[];
  planLines: PlanLine[];
  products: Product[];
  onAddLine: (line: PlanLine) => void;
  onMoveLine: (id: string, date: string) => void;
  canPlan: boolean;
  onSelect: (id: string) => void;
}) {
  const [planningView, setPlanningView] = useState<"calendar" | "list">("calendar");
  const [initialDate] = useState(() => localDateKey(new Date()));
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const visibleLines = planLines.filter((line) =>
    (!priorityFilter || line.priority === priorityFilter) && (!statusFilter || line.status === statusFilter) &&
    `${labelFor(products, line.productId)} ${line.orderReference ?? ""} ${line.notes ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <section className="screen-grid planner-grid">
      <div className="workspace-panel wide">
        <div className="panel-title">
          <div>
            <h2>Production plan</h2>
          </div>
          <div className="view-switch" aria-label="Planning view">
            <button type="button" aria-pressed={planningView === "calendar"} onClick={() => setPlanningView("calendar")}>Calendar</button>
            <button type="button" aria-pressed={planningView === "list"} onClick={() => setPlanningView("list")}>List</button>
          </div>
        </div>
        {filterControls}
        <div className="operational-filters">
          <label className="planning-search">Search plans<input type="search" placeholder="Product, order or remarks" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{["Unscheduled", "Partially Scheduled", "Fully Scheduled"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <span className="result-count" aria-live="polite">{visibleLines.length} of {planLines.length} lines</span>
        </div>
        {visibleLines.length === 0 ? <p role="status" className="empty-state">No plan lines match these filters.</p> : null}
        <PlanningCalendar processNames={processNames} planningView={planningView} calendars={calendars} calendarTitle={calendarTitle} allPrintLines={planLines} entries={entries} machines={machines} canPlan={canPlan} onSelect={onSelect} planLines={visibleLines} products={products} initialDate={initialDate} onMove={onMoveLine} onCreate={(activity) => {
          onAddLine({ ...activity, id: newId("line"), planId: "production-plan", status: "Unscheduled" });
          setQuery(""); setPriorityFilter(""); setStatusFilter("");
        }} />
      </div>
    </section>
  );
}

function ScheduleBoard({
  planLines,
  products,
  workCentres,
  machines,
  entries,
  onAddEntry,
  onChangeStatus,
  onDuplicate,
  onCancel
}: {
  planLines: PlanLine[];
  products: Product[];
  workCentres: WorkCentre[];
  machines: Machine[];
  entries: ScheduleEntry[];
  onAddEntry: (entry: ScheduleEntry) => string[];
  onChangeStatus: (entryId: string, status: ScheduleEntryStatus) => void;
  onDuplicate: (entryId: string) => void;
  onCancel: (entryId: string) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState({
    planLineId: planLines[0]?.id ?? "",
    workCentreId: workCentres[0]?.id ?? "",
    machineId: machines[0]?.id ?? "",
    startAt: "2026-09-16T08:00",
    endAt: "2026-09-16T12:00",
    status: "Draft" as ScheduleEntryStatus,
    notes: ""
  });

  const selectedLine = planLines.find((line) => line.id === form.planLineId);
  const filteredMachines = machines.filter((machine) => machine.workCentreId === form.workCentreId);
  const conflicts = findMachineConflicts(entries, machines, products);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLine) {
      return;
    }

    const submitErrors = onAddEntry({
      id: newId("sched"),
      planLineId: selectedLine.id,
      productionOrderId: selectedLine.productionOrderId,
      productId: selectedLine.productId,
      workCentreId: form.workCentreId,
      machineId: form.machineId || undefined,
      startAt: form.startAt,
      endAt: form.endAt,
      status: form.status,
      notes: form.notes.trim() || undefined,
      changedBy: seedData.productionPlan.ownerName
    });

    setErrors(submitErrors);

    if (submitErrors.length === 0) {
      setForm((current) => ({ ...current, notes: "" }));
    }
  }

  return (
    <section className="screen-grid schedule-grid">
      <div className="workspace-panel wide">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Detailed Scheduling</p>
            <h2>Work Centre Timeline</h2>
          </div>
          <SlidersHorizontal size={19} />
        </div>
        <div className="schedule-list">
          {entries
            .slice()
            .sort((a, b) => a.startAt.localeCompare(b.startAt))
            .map((entry) => {
              const conflicted = hasConflict(entry.id, conflicts);
              return (
                <article className={conflicted ? "schedule-entry conflict" : "schedule-entry"} key={entry.id}>
                  <div className="entry-time">
                    <span>{toTimeRange(entry)}</span>
                    {conflicted ? <StatusBadge value="Conflict" /> : null}
                  </div>
                  <div className="entry-main">
                    <h3>{labelFor(products, entry.productId)}</h3>
                    <p>
                      {labelFor(workCentres, entry.workCentreId)} · {labelFor(machines, entry.machineId)}
                    </p>
                  </div>
                  <div className="entry-actions">
                    <select
                      value={entry.status}
                      onChange={(event) => onChangeStatus(entry.id, event.target.value as ScheduleEntryStatus)}
                      aria-label="Schedule status"
                    >
                      {scheduleStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                    <button aria-label="Duplicate entry" className="icon-button" onClick={() => onDuplicate(entry.id)} type="button">
                      <Copy size={16} />
                    </button>
                    <button aria-label="Cancel entry" className="icon-button danger" onClick={() => onCancel(entry.id)} type="button">
                      <XCircle size={16} />
                    </button>
                  </div>
                  {entry.notes ? <p className="record-note">{entry.notes}</p> : null}
                </article>
              );
            })}
        </div>
      </div>
      <form className="workspace-panel form-panel" onSubmit={submit}>
        <div className="panel-title compact">
          <h2>Create Schedule Entry</h2>
          <Plus size={18} />
        </div>
        {errors.length > 0 ? (
          <div className="inline-errors">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        <label>
          Plan Line
          <select value={form.planLineId} onChange={(event) => setForm({ ...form, planLineId: event.target.value })}>
            {planLines.map((line) => (
              <option key={line.id} value={line.id}>
                {toDisplayDate(line.plannedDate)} · {labelFor(products, line.productId)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Work Centre
          <select
            value={form.workCentreId}
            onChange={(event) => {
              const machine = machines.find((item) => item.workCentreId === event.target.value);
              setForm({ ...form, workCentreId: event.target.value, machineId: machine?.id ?? "" });
            }}
          >
            {workCentres.map((workCentre) => (
              <option key={workCentre.id} value={workCentre.id}>
                {workCentre.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Machine
          <select value={form.machineId} onChange={(event) => setForm({ ...form, machineId: event.target.value })}>
            <option value="">No machine</option>
            {filteredMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start
          <input
            type="datetime-local"
            value={form.startAt}
            onChange={(event) => setForm({ ...form, startAt: event.target.value })}
          />
        </label>
        <label>
          End
          <input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as ScheduleEntryStatus })}
          >
            {scheduleStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={17} />
          Create Entry
        </button>
      </form>
    </section>
  );
}

function MasterDataPanel({
  products,
  workCentres,
  onAddProduct,
  onAddWorkCentre
}: {
  products: Product[];
  workCentres: WorkCentre[];
  onAddProduct: (product: Product) => void;
  onAddWorkCentre: (workCentre: WorkCentre) => void;
}) {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState({ sku: "", name: "", uom: "kg" });
  const [productMessage, setProductMessage] = useState("");
  const [workCentre, setWorkCentre] = useState({ code: "", name: "" });
  const normalizedQuery = query.toLowerCase();
  const [activeFilter, setActiveFilter] = useState("");
  const [sort, setSort] = useState<{ key: "sku" | "name" | "uom" | "active"; ascending: boolean }>({ key: "sku", ascending: true });
  const visibleProducts = products.filter((item) => (!activeFilter || item.active === activeFilter) && `${item.sku} ${item.name}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * (sort.ascending ? 1 : -1));

  return (
    <section className="master-layout">
      <div className="workspace-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Master Data</p>
            <h2>Products</h2>
          </div>
          <div className="search-control">
            <Search size={16} />
            <input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" />
          </div>
        </div>
        <div className="operational-filters"><label>Product status<select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></label><span className="result-count">{visibleProducts.length} products</span></div>
        <table>
          <thead>
            <tr>
              {([{ key: "sku", label: "Product code" }, { key: "name", label: "Product name" }, { key: "uom", label: "UOM" }, { key: "active", label: "Status" }] as const).map((column) => <th key={column.key} aria-sort={sort.key === column.key ? sort.ascending ? "ascending" : "descending" : "none"}><button className="table-sort" type="button" onClick={() => setSort({ key: column.key, ascending: sort.key === column.key ? !sort.ascending : true })}>{column.label}<ArrowUpDown size={14} /></button></th>)}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.length === 0 ? <tr><td colSpan={4}>No products match these filters.</td></tr> : null}
            {visibleProducts.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.uom}</td>
                <td>
                  <StatusBadge value={item.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="workspace-panel compact-stack">
        <form
          className="mini-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!product.sku.trim() || !product.name.trim() || !product.uom.trim()) return;
            if (products.some((item) => item.sku.toLowerCase() === product.sku.trim().toLowerCase())) { setProductMessage("Product code already exists."); return; }
            onAddProduct({
              id: newId("prod"),
              sku: product.sku.trim(),
              name: product.name.trim(),
              uom: product.uom.trim(),
              productType: "Finished Good",
              active: "Active"
            });
            setProduct({ sku: "", name: "", uom: "kg" });
            setProductMessage("Product added.");
          }}
        >
          <h3>Add Product</h3>
          <label>Product code<input required value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} /></label>
          <label>Product name<input required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
          <label>UOM<input required value={product.uom} onChange={(event) => setProduct({ ...product, uom: event.target.value })} /></label>
          {productMessage ? <p role="status">{productMessage}</p> : null}
          <button type="submit">
            <Plus size={16} />
            Add
          </button>
        </form>
        <form
          className="mini-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workCentre.code || !workCentre.name) return;
            onAddWorkCentre({ id: newId("wc"), code: workCentre.code, name: workCentre.name, active: "Active" });
            setWorkCentre({ code: "", name: "" });
          }}
        >
          <h3>Add Work Centre</h3>
          <input value={workCentre.code} onChange={(event) => setWorkCentre({ ...workCentre, code: event.target.value })} placeholder="Code" />
          <input value={workCentre.name} onChange={(event) => setWorkCentre({ ...workCentre, name: event.target.value })} placeholder="Name" />
          <button type="submit">
            <Plus size={16} />
            Add
          </button>
        </form>
      </div>
    </section>
  );
}

function ReportsPanel({
  planLines,
  entries,
  products,
  workCentres,
  machines
}: {
  planLines: PlanLine[];
  entries: ScheduleEntry[];
  products: Product[];
  workCentres: WorkCentre[];
  machines: Machine[];
}) {
  const report = getScheduleReport(planLines, entries, workCentres, machines, products);

  return (
    <section className="reports-layout">
      <div className="metric-row">
        <div className="metric">
          <ClipboardList size={18} />
          <span>{report.unscheduledLines.length}</span>
          <p>Open plan lines</p>
        </div>
        <div className="metric">
          <AlertTriangle size={18} />
          <span>{report.conflicts.length}</span>
          <p>Machine conflicts</p>
        </div>
        <div className="metric">
          <CheckCircle2 size={18} />
          <span>{report.completed}</span>
          <p>Completed entries</p>
        </div>
        <div className="metric">
          <Users size={18} />
          <span>{report.totalEntries}</span>
          <p>Schedule entries</p>
        </div>
      </div>
      <div className="workspace-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">This Week</p>
            <h2>Work Centre Load</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Work Centre</th>
              <th>Entries</th>
              <th>Scheduled Hours</th>
            </tr>
          </thead>
          <tbody>
            {report.workCentreLoad.map((row) => (
              <tr key={row.workCentreId}>
                <td>{row.workCentreName}</td>
                <td>{row.entryCount}</td>
                <td>{row.confirmedHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="workspace-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Attention</p>
            <h2>Unscheduled And Conflict Queue</h2>
          </div>
        </div>
        <div className="records two-column">
          {report.unscheduledLines.map((line) => (
            <article className="record-row" key={line.id}>
              <h3>{labelFor(products, line.productId)}</h3>
              <p>{toDisplayDate(line.plannedDate)} · {line.quantity.toLocaleString()} {line.uom ?? products.find((product) => product.id === line.productId)?.uom} planned{line.activityType ? ` · ${line.activityType}` : ""}{line.batchSizeKg !== undefined ? ` · ${line.batchSizeKg} kg equivalent` : ""}</p>
              <StatusBadge value={line.status} />
            </article>
          ))}
          {report.conflicts.map((conflict) => (
            <article className="record-row conflict-record" key={conflict.id}>
              <h3>{labelFor(machines, conflict.machineId)}</h3>
              <p>{conflict.message}</p>
              <StatusBadge value="Conflict" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SchedulerDemo({ initial, writeToken }: { initial: WorkspaceEnvelope; writeToken: string }) {
  return <MeasurementProvider initial={initial.snapshot.measurements}><TeamWorkspace initial={initial} writeToken={writeToken} /></MeasurementProvider>;
}

function TeamWorkspace({ initial, writeToken }: { initial: WorkspaceEnvelope; writeToken: string }) {
  const [directory, setDirectory] = useState<CalendarDirectory>(initial.snapshot.directory);
  const [memberId, setMemberId] = useState(initial.snapshot.directory.people.find((person) => person.role === "admin")!.id);
  const member = directory.people.find((item) => item.id === memberId)!;
  const [unitSelection, setUnitSelection] = useState("");
  const availableUnits = directory.units.filter((item) => member.role === "admin" || member.unitIds.includes(item.id));
  const unit = availableUnits.find((item) => item.id === unitSelection) ?? availableUnits[0];
  const allowedCalendars = accessibleCalendars(member, directory);
  const calendar = allowedCalendars.find((item) => item.unitId === unit?.id);
  const calendarId = calendar?.id ?? "";
  const [processSelection, setProcessSelection] = useState<string[] | null>(null);
  const unitCalendars = allowedCalendars.filter((item) => item.unitId === unit?.id);
  const visibleCalendars = selectedUnitCalendars(member, directory, unit?.id ?? "", processSelection);
  const canPlan = member.role === "planner" && !!calendar;
  const canProduce = member.role === "production" && !!calendar;
  const canManage = member.role === "admin";
  const [activeTab, setActiveTab] = useState<Tab>("master");
  const [adminSection, setAdminSection] = useState("Configuration");
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(initial.snapshot.products);
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>(initial.snapshot.workCentres);
  const [machines, setMachines] = useState<Machine[]>(initial.snapshot.machines);
  const [data, setData] = useState<{ lines: PlanLine[]; entries: ScheduleEntry[]; actuals: ProductionActual[]; transfers: WipTransfer[] }>(initial.snapshot.data);
  const { uoms, activities } = useSettings();
  const persistenceStatus = useWorkspacePersistence(initial, { schemaVersion: 1, directory, products, workCentres, machines, measurements: { uoms, activities }, data }, writeToken);
  const scope = <T extends { calendarId?: string },>(records: T[]) => visibleCalendars.flatMap((item) => scopeCalendarRecords(records, member, item, directory));
  const entries = scope(data.entries);
  const planLines = syncPlanLineStatuses(scope(data.lines), entries);
  const selectedLine = planLines.find((line) => line.id === selectedActivity);
  const activityCalendar = allowedCalendars.find((item) => item.id === selectedLine?.calendarId);
  const calendarMachines = machines.filter((machine) => machine.unitId === calendar?.unitId && visibleCalendars.some((item) => machine.processIds?.includes(item.processId)));
  const activityMachines = calendarMachines.filter((machine) => machine.processIds?.includes(activityCalendar?.processId ?? ""));
  const conflicts = findMachineConflicts(entries, machines, products);
  const calendarTitle = unit?.name ?? "No unit assigned";
  const processNames = Object.fromEntries(visibleCalendars.map((item) => [item.id, directory.processes.find((process) => process.id === item.processId)?.name ?? "Unassigned process"]));

  function saveActual(input: ActualInput) {
    const line = planLines.find((item) => item.id === input.planLineId);
    if (!canProduce || !line) return ["Production access to this calendar is required."];
    if (line.completedAt) return ["Final yield is locked after production completion."];
    const errors = validateActual(input);
    if (errors.length) return errors;
    const existing = data.actuals.find((item) => item.planLineId === line.id);
    const actual: ProductionActual = { ...input, calendarId: line.calendarId, teamId: "", plannedQuantity: existing?.plannedQuantity ?? line.quantity, uom: existing?.uom ?? line.uom ?? products.find((product) => product.id === line.productId)?.uom ?? "", updatedBy: member.name, updatedAt: new Date().toISOString() };
    setData((current) => ({ ...current, actuals: [...current.actuals.filter((item) => item.planLineId !== line.id), actual] }));
    return [];
  }
  function saveProduction(entry: ScheduleEntry) {
    const line = planLines.find((item) => item.id === entry.planLineId);
    if (!canProduce || !line || line.completedAt) return ["Production access to an open activity is required."];
    const existing = data.entries.find((item) => item.id === entry.id);
    if (existing && (existing.calendarId !== line.calendarId || existing.planLineId !== line.id)) return ["Activity not available."];
    const processId = allowedCalendars.find((item) => item.id === line.calendarId)?.processId;
    const machine = calendarMachines.find((item) => item.id === entry.machineId && item.active === "Active" && item.processIds?.includes(processId ?? ""));
    if (!machine) return ["Select an active machine assigned to this unit and process."];
    const candidate = { ...entry, calendarId: line.calendarId, productId: line.productId, workCentreId: machine.workCentreId, changedBy: member.name };
    const errors = validateScheduleEntry(candidate);
    if (findMachineConflicts([...data.entries.filter((item) => item.id !== entry.id), candidate], machines, products).some((conflict) => conflict.entryIds.includes(entry.id))) errors.push("This machine is reserved during the selected time, including setup.");
    if (!errors.length) setData((current) => ({ ...current, entries: [...current.entries.filter((item) => item.id !== entry.id), candidate] }));
    return errors;
  }
  function completeProduction(input: CompletionInput) {
    if (!selectedLine) return ["Activity not available."];
    const errors = validateCompletion(selectedLine, input, member, directory);
    if (errors.length) return errors;
    const completedAt = new Date().toISOString();
    const line = selectedLine;
    const uom = line.uom ?? products.find((product) => product.id === line.productId)?.uom ?? "";
    const transfer: WipTransfer | undefined = input.destinationId ? {
      id: newId("wip"), sourceLineId: line.id, sourceCalendarId: line.calendarId!, calendarId: input.destinationId,
      productId: line.productId, quantity: input.quantity, uom, orderReference: line.orderReference,
      notes: input.notes, createdAt: completedAt, createdBy: member.name
    } : undefined;
    setData((current) => {
      if (current.lines.find((item) => item.id === line.id)?.completedAt) return current;
      const existingActual = current.actuals.find((item) => item.planLineId === line.id);
      const actual: ProductionActual = { ...existingActual, planLineId: line.id, calendarId: line.calendarId, teamId: "", actualQuantity: input.quantity, plannedQuantity: line.quantity, uom, productionDate: localDateKey(new Date(completedAt)), hasDeviation: existingActual?.hasDeviation ?? false, deviation: existingActual?.deviation ?? "", correctiveAction: existingActual?.correctiveAction ?? "", updatedAt: completedAt, updatedBy: member.name };
      return {
        ...current,
        lines: current.lines.map((item) => item.id === line.id ? { ...item, completedAt, yieldQuantity: input.quantity } : item),
        entries: current.entries.map((item) => item.planLineId === line.id && item.status !== "Cancelled" ? { ...item, status: "Completed" as const, changedBy: member.name } : item),
        actuals: [...current.actuals.filter((item) => item.planLineId !== line.id), actual],
        transfers: transfer ? [...current.transfers, transfer] : current.transfers
      };
    });
    return [];
  }
  function saveDirectory(next: CalendarDirectory) {
    if (!canManage) return ["Administrator access is required."];
    const usedCalendarIds = [...data.lines.map((item) => item.calendarId), ...data.entries.map((item) => item.calendarId), ...data.actuals.map((item) => item.calendarId), ...data.transfers.flatMap((item) => [item.calendarId, item.sourceCalendarId])].filter((id): id is string => !!id);
    const errors = validateDirectoryChange(directory, next, machines, usedCalendarIds, memberId);
    if (errors.length) return errors;
    setDirectory(next);
    setSelectedActivity(null);
    return [];
  }
  function saveMachine(machine: Machine) {
    if (!canManage) return ["Administrator access is required."];
    if (!machine.name.trim() || !machine.code.trim() || !directory.units.some((item) => item.id === machine.unitId) || !machine.processIds?.length) return ["Enter a name, code, unit and at least one process."];
    if (machine.processIds.some((processId) => !directory.calendars.some((calendar) => calendar.unitId === machine.unitId && calendar.processId === processId))) return ["Select processes configured under this unit."];
    if (!Number.isInteger(machine.setupMinutes) || machine.setupMinutes! < 0 || (machine.capacity !== undefined && (!Number.isFinite(machine.capacity) || machine.capacity <= 0 || !machine.capacityUom?.trim()))) return ["Enter a non-negative setup time and a positive capacity with its unit/basis."];
    if (machines.some((item) => item.id !== machine.id && item.code.toLowerCase() === machine.code.toLowerCase())) return ["Machine code is already in use."];
    const old = machines.find((item) => item.id === machine.id);
    if (old && data.entries.some((entry) => entry.machineId === machine.id && (old.unitId !== machine.unitId || !machine.processIds?.includes(directory.calendars.find((item) => item.id === entry.calendarId)?.processId ?? "")))) return ["A booked machine must retain its unit and booked processes."];
    setMachines((current) => current.some((item) => item.id === machine.id) ? current.map((item) => item.id === machine.id ? machine : item) : [...current, machine]);
    return [];
  }
  function deleteMachine(id: string) {
    if (!canManage) return ["Administrator access is required."];
    if (data.entries.some((entry) => entry.machineId === id)) return ["This machine has production bookings. Mark it inactive instead of deleting it."];
    setMachines((current) => current.filter((machine) => machine.id !== id));
    return [];
  }
  function receiveWip(id: string) {
    if (!canProduce || !scope(data.transfers).some((item) => item.id === id)) return;
    setData((current) => ({ ...current, transfers: current.transfers.map((item) => item.id === id && !item.receivedAt ? { ...item, receivedAt: new Date().toISOString(), receivedBy: member.name } : item) }));
  }
  function planWip(id: string, date: string) {
    if (!canPlan || !scope(data.transfers).some((item) => item.id === id)) return;
    if (validateActual({ actualQuantity: 0, productionDate: date, hasDeviation: false, deviation: "" }).length) return;
    setData((current) => {
      const transfer = current.transfers.find((item) => item.id === id);
      if (!transfer?.receivedAt || transfer.plannedLineId) return current;
      const lineId = newId("line");
      const line: PlanLine = { id: lineId, planId: "production-plan", calendarId: transfer.calendarId, productId: transfer.productId, quantity: transfer.quantity, uom: transfer.uom, plannedDate: date, priority: "Normal", status: "Unscheduled", incomingWipId: id, notes: transfer.notes, orderReference: transfer.orderReference, activityType: directory.processes.find((item) => item.id === directory.calendars.find((entry) => entry.id === transfer.calendarId)?.processId)?.name };
      return { ...current, lines: [...current.lines, line], transfers: current.transfers.map((item) => item.id === id ? { ...item, plannedLineId: lineId } : item) };
    });
  }
  const filterControls = <div className="calendar-filters">
    <label>Unit<select value={unit?.id ?? ""} disabled={!unit} onChange={(event) => { setUnitSelection(event.target.value); setProcessSelection(null); setSelectedActivity(null); }}>{!unit ? <option value="">No unit assigned</option> : availableUnits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <fieldset className="process-ticks"><legend>Processes</legend>
      <label><input type="checkbox" checked={unitCalendars.length > 0 && visibleCalendars.length === unitCalendars.length} onChange={(event) => { setProcessSelection(event.target.checked ? null : []); setSelectedActivity(null); }} />All</label>
      {unitCalendars.map((item) => <label key={item.id}><input type="checkbox" checked={visibleCalendars.some((entry) => entry.id === item.id)} onChange={(event) => { const ids = visibleCalendars.map((entry) => entry.id); setProcessSelection(event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id)); setSelectedActivity(null); }} />{item.name}</label>)}
    </fieldset>
  </div>;
  return <main className="workstation">
    <AppHeader activeTab={activeTab} conflictCount={conflicts.length} onTabChange={setActiveTab} />
    <div className="workstation-content">
      <header className="workstation-topbar"><span>Bio Tree / Production</span><label className="user-selector">User<select value={memberId} onChange={(event) => { setMemberId(event.target.value); setProcessSelection(null); setSelectedActivity(null); }}>{directory.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></header>
      {persistenceStatus}
      {activeTab !== "planner" ? <div className="workspace-heading"><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div> : null}
      {!unit && activeTab !== "master" ? <section><p>{canManage ? "Add a unit to create its calendar." : "No unit assigned. Contact your administrator."}</p>{canManage ? <button type="button" className="primary-button" onClick={() => { setActiveTab("master"); setAdminSection("Configuration"); }}>Manage units</button> : null}</section> : null}
      {unit && !unitCalendars.length && activeTab === "planner" ? <p role="status">{directory.calendars.some((item) => item.unitId === unit.id) ? "No process access assigned for this unit. Configure access in Admin." : "No processes configured for this unit yet."}</p> : null}
      {unit && activeTab === "planner" ? <PlannerBoard processNames={processNames} key={`${unit.id}-${memberId}`} calendars={visibleCalendars} filterControls={filterControls} calendarTitle={calendarTitle} entries={entries} machines={calendarMachines} canPlan={canPlan && visibleCalendars.length > 0} onSelect={setSelectedActivity} planLines={planLines} products={products}
        onMoveLine={(id, date) => { if (canPlan && planLines.some((line) => line.id === id)) setData((current) => ({ ...current, lines: current.lines.map((line) => line.id === id && !line.completedAt ? { ...line, plannedDate: date } : line) })); }}
        onAddLine={(line) => { if (canPlan && visibleCalendars.some((item) => item.id === line.calendarId) && products.some((item) => item.id === line.productId && item.active === "Active") && Number.isFinite(line.quantity) && line.quantity > 0) setData((current) => ({ ...current, lines: [...current.lines, line] })); }} /> : null}
      {activeTab === "planner" && selectedLine ? <ActivityWorkspace key={`${selectedLine.id}-${memberId}`} line={selectedLine} product={products.find((item) => item.id === selectedLine.productId)} machines={activityMachines} entries={entries.filter((item) => item.planLineId === selectedLine.id)} canPlan={canPlan && !selectedLine.completedAt} canProduce={canProduce && !selectedLine.completedAt} onClose={() => setSelectedActivity(null)} onProduction={saveProduction}
        onPlan={(line) => { if (canPlan && !selectedLine.completedAt && Number.isFinite(line.quantity) && line.quantity > 0) setData((current) => ({ ...current, lines: current.lines.map((item) => item.id === selectedLine.id ? { ...item, quantity: line.quantity, plannedDate: line.plannedDate, priority: line.priority, notes: line.notes, batchSizeKg: batchKilograms(line.quantity, item.uom ?? products.find((product) => product.id === item.productId)?.uom ?? "", item.unitWeightMg) } : item) })); }}>
        <EndProduction line={selectedLine} outgoing={data.transfers.find((item) => item.sourceLineId === selectedLine.id)} uom={selectedLine.uom ?? products.find((product) => product.id === selectedLine.productId)?.uom ?? ""} directory={directory} editable={canProduce} onComplete={completeProduction} />
      </ActivityWorkspace> : null}
      {activeTab === "master" ? canManage ? <>
        <div className="view-switch admin-main-tabs" aria-label="Admin area">{["Configuration", "Products", "Measurements"].map((item) => <button key={item} type="button" aria-pressed={adminSection === item} onClick={() => setAdminSection(item)}>{item}</button>)}</div>
        {adminSection === "Configuration" ? <CalendarAdmin directory={directory} onSave={saveDirectory} machines={machines} workCentres={workCentres} onMachine={saveMachine} onDeleteMachine={deleteMachine} onOpenCalendar={(unitId) => { setUnitSelection(unitId); setProcessSelection(null); setSelectedActivity(null); setActiveTab("planner"); }} /> : null}
        {adminSection === "Measurements" ? <MeasurementAdmin usedUoms={[...products.map((item) => item.uom), ...data.lines.map((item) => item.uom ?? ""), ...data.transfers.map((item) => item.uom), ...machines.map((item) => item.capacityUom ?? "")]} usedActivities={data.lines.map((item) => item.activityType ?? "")} /> : null}
        {adminSection === "Products" ? <CatalogAdmin products={products} workCentres={workCentres} onProduct={(item) => {
          if (products.some((old) => old.id === item.id && old.uom !== item.uom) && (data.lines.some((line) => line.productId === item.id) || data.entries.some((entry) => entry.productId === item.id))) return ["This product has planning or production records. Keep its existing UOM."];
          setProducts((current) => current.some((old) => old.id === item.id) ? current.map((old) => old.id === item.id ? item : old) : [...current, item]); return [];
        }} onCentre={(item) => { setWorkCentres((current) => current.some((old) => old.id === item.id) ? current.map((old) => old.id === item.id ? item : old) : [...current, item]); return []; }} onDelete={(kind, id) => {
          if (kind === "products") {
            if (data.lines.some((line) => line.productId === id) || data.entries.some((entry) => entry.productId === id) || data.transfers.some((transfer) => transfer.productId === id)) return ["This product is in use. Mark it inactive instead of deleting it."];
            setProducts((current) => current.filter((item) => item.id !== id));
          } else {
            if (machines.some((machine) => machine.workCentreId === id) || data.entries.some((entry) => entry.workCentreId === id)) return ["This work centre has machines or production records. Reassign them first or mark it inactive."];
            setWorkCentres((current) => current.filter((item) => item.id !== id));
          }
          return [];
        }} /> : null}
      </> : <section className="admin-access"><h2>Administrator access required</h2><p>The current user is a {member.role}.</p><button type="button" className="primary-button" onClick={() => { const admin = directory.people.find((person) => person.role === "admin"); if (admin) { setMemberId(admin.id); setProcessSelection(null); } }}>Open administrator preview</button></section> : null}
      {activeTab === "reports" && calendar ? <>
        {filterControls}
        <ProductionActuals key={`${calendarId}-${memberId}-${visibleCalendars.map((item) => item.id).join("-")}`} lines={planLines} products={products} actuals={scope(data.actuals)} editable={canProduce} onSave={saveActual} />
        <details className="wip-reports"><summary>Incoming WIP ({scope(data.transfers).filter((item) => !item.receivedAt).length})</summary><WipInbox transfers={scope(data.transfers)} products={products} directory={directory} canReceive={canProduce} canPlan={canPlan} onReceive={receiveWip} onPlan={planWip} /></details>
        <ReportsPanel planLines={planLines} entries={entries} products={products} workCentres={workCentres} machines={calendarMachines} />
      </> : null}
    </div>
  </main>;
}
