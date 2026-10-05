"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  Factory,
  FileText,
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
import { accessibleCalendars, selectedUnitCalendars, scopeCalendarRecords, type CalendarDirectory, type CalendarPerson } from "@/lib/domain/calendarAccess";
import type { WorkspaceEnvelope, WorkspaceSnapshot } from "@/lib/domain/workspace";
import { SampleDataAdmin } from "@/components/SampleDataAdmin";
import { useWorkspacePersistence } from "@/components/WorkspacePersistence";
import { capabilitiesForDemoRole, capabilitiesFromPermissions } from "@/lib/auth/capabilities";
import { OrdersPanel } from "@/components/OrdersPanel";
import { batchRoute, validateOrder, type PurchaseOrder } from "@/lib/services/orders";
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
import { createBatchLines, moveActivity, type NewBatch } from "@/lib/services/planChanges";
import { checkProcessFlow, inferFormat, warningsByLine, type FlowWarning } from "@/lib/services/processRules";

type Tab = "planner" | "orders" | "master" | "reports";
type PlanningView = "calendar" | "list";

const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "planner", label: "Planner Board", icon: CalendarDays },
  { id: "orders", label: "Orders", icon: FileText },
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
  conflictCount,
  showReports
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  conflictCount: number;
  showReports: boolean;
}) {
  return (
    <aside className="app-header">
      <div className="workstation-brand">
        <strong>Bio Tree<span> / OS</span></strong>
        <p>Production workspace</p>
      </div>
      <nav className="tab-list" aria-label="Scheduler sections">
        {tabs.filter((tab) => showReports || tab.id !== "reports").map((tab) => {
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
      <button type="button" onClick={() => onTabChange(showReports ? "reports" : "planner")} className={conflictCount > 0 ? "alert-pill visible" : "alert-pill"}>
        <AlertTriangle size={16} />
        <span>{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span>
      </button>
      <div className="sidebar-footer">Bio Tree Biotechnology<p>Planning & production</p></div>
    </aside>
  );
}

// Process-flow warnings for what is on screen; each links to the activity it concerns.
function FlowBanner({ warnings, onOpen }: { warnings: FlowWarning[]; onOpen: (id: string) => void }) {
  if (!warnings.length) return null;
  return <details className="flow-banner">
    <summary><AlertTriangle size={16} />{warnings.length} process-flow warning{warnings.length === 1 ? "" : "s"} in this view</summary>
    <ul>{warnings.map((warning) => <li key={warning.message}><span>{warning.message}</span><button type="button" className="calendar-button" onClick={() => onOpen(warning.lineIds[0])}>Open</button></li>)}</ul>
  </details>;
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
  orders,
  flow,
  onAddLine,
  onMoveLine,
  canPlan,
  canCreate,
  demo,
  onSelect,
  planningView,
  onPlanningView
}: {
  processNames: Record<string, string>;
  calendars: UnitCalendar[];
  filterControls: ReactNode;
  calendarTitle: string;
  entries: ScheduleEntry[];
  machines: Machine[];
  planLines: PlanLine[];
  products: Product[];
  orders: PurchaseOrder[];
  flow: FlowWarning[];
  onAddLine: (line: PlanLine) => void;
  onMoveLine: (id: string, date: string) => string;
  canPlan: boolean;
  canCreate: boolean;
  demo: boolean;
  onSelect: (id: string) => void;
  planningView: PlanningView;
  onPlanningView: (view: PlanningView) => void;
}) {
  const setPlanningView = onPlanningView;
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
        <FlowBanner warnings={flow.filter((warning) => warning.lineIds.some((id) => planLines.some((line) => line.id === id)))} onOpen={onSelect} />
        {visibleLines.length === 0 && planLines.length > 0 ? <p role="status" className="empty-state">No plan lines match these filters.</p> : null}
        <PlanningCalendar processNames={processNames} planningView={planningView} calendars={calendars} calendarTitle={calendarTitle} allPrintLines={planLines} entries={entries} machines={machines} canPlan={canPlan} canCreate={canCreate} demo={demo} onSelect={onSelect} planLines={visibleLines} products={products} orders={orders} warnings={warningsByLine(flow)} initialDate={initialDate} onMove={onMoveLine} onCreate={(activity) => {
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

// A person verified by Bio Tree Core. Their permissions come from Core; the server rechecks every save.
export type CoreIdentity = { id: string; name: string; permissions: string[] };

export default function SchedulerDemo({ initial, writeToken, identity }: { initial: WorkspaceEnvelope; writeToken: string; identity?: CoreIdentity }) {
  return <MeasurementProvider initial={initial.snapshot.measurements}><TeamWorkspace initial={initial} writeToken={writeToken} identity={identity} /></MeasurementProvider>;
}

function TeamWorkspace({ initial, writeToken, identity }: { initial: WorkspaceEnvelope; writeToken: string; identity?: CoreIdentity }) {
  const [directory, setDirectory] = useState<CalendarDirectory>(initial.snapshot.directory);
  const [memberId, setMemberId] = useState(initial.snapshot.directory.people.find((person) => person.role === "admin")!.id);
  // In Core mode the signed-in user replaces the demo person picker. Core has no unit model
  // yet, so they see every unit; what they may change comes only from their Core permissions.
  const coreMember: CalendarPerson | null = identity ? { id: `core-${identity.id}`, name: identity.name, role: "admin", unitIds: directory.units.map((item) => item.id), teamIds: [], calendarIds: directory.calendars.map((item) => item.id), processIds: directory.processes.map((item) => item.id) } : null;
  const member = coreMember ?? directory.people.find((item) => item.id === memberId)!;
  const caps = identity ? capabilitiesFromPermissions(identity.permissions) : capabilitiesForDemoRole(member.role);
  const statuses = scheduleStatuses.filter((status) => (status !== "Confirmed" || caps.approve) && (status !== "Cancelled" || caps.cancel));
  const [unitSelection, setUnitSelection] = useState("");
  const availableUnits = directory.units.filter((item) => member.role === "admin" || member.unitIds.includes(item.id));
  const allowedCalendars = accessibleCalendars(member, directory);
  const unit = availableUnits.find((item) => item.id === unitSelection) ?? availableUnits.find((item) => allowedCalendars.some((calendar) => calendar.unitId === item.id)) ?? availableUnits[0];
  const calendar = allowedCalendars.find((item) => item.unitId === unit?.id);
  const calendarId = calendar?.id ?? "";
  const [processSelection, setProcessSelection] = useState<string[] | null>(null);
  const unitCalendars = allowedCalendars.filter((item) => item.unitId === unit?.id);
  const visibleCalendars = selectedUnitCalendars(member, directory, unit?.id ?? "", processSelection);
  // Administrators can plan too, matching Core's Scheduler Admin role, which holds every scheduler permission.
  const canPlan = caps.editPlan && !!calendar;
  const canCreate = caps.createPlan && !!calendar;
  const canProduce = caps.produce && !!calendar;
  const canManage = caps.manage;
  const canAssign = caps.editPlan || caps.produce;
  // Signed-in Core users start on the plan; the local demo starts on Admin to set up units.
  const [activeTab, setActiveTab] = useState<Tab>(identity ? "planner" : "master");
  const [planningView, setPlanningView] = useState<PlanningView>("calendar");
  const [adminSection, setAdminSection] = useState("Configuration");
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(initial.snapshot.products);
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>(initial.snapshot.workCentres);
  const [machines, setMachines] = useState<Machine[]>(initial.snapshot.machines);
  const [data, setData] = useState<{ lines: PlanLine[]; entries: ScheduleEntry[]; actuals: ProductionActual[]; transfers: WipTransfer[]; orders: PurchaseOrder[] }>(initial.snapshot.data);
  const { uoms, activities } = useSettings();
  const snapshot = { schemaVersion: 1, directory, products, workCentres, machines, measurements: { uoms, activities }, data } as WorkspaceSnapshot;
  const persistenceStatus = useWorkspacePersistence(initial, snapshot, writeToken);
  const scope = <T extends { calendarId?: string },>(records: T[]) => visibleCalendars.flatMap((item) => scopeCalendarRecords(records, member, item, directory));
  const entries = scope(data.entries);
  const planLines = syncPlanLineStatuses(scope(data.lines), entries);
  // The activity panel can step along a batch's route into processes that are filtered out of view.
  const allowedLines = syncPlanLineStatuses(allowedCalendars.flatMap((item) => scopeCalendarRecords(data.lines, member, item, directory)), data.entries);
  const selectedLine = allowedLines.find((line) => line.id === selectedActivity);
  const activityCalendar = allowedCalendars.find((item) => item.id === selectedLine?.calendarId);
  const canEditOrders = caps.createPlan || caps.manage;
  // One set of process-flow warnings feeds the calendar, list, activity panel and orders.
  const flow = checkProcessFlow(data.lines, data.entries, data.orders, products, directory);
  const flowByLine = warningsByLine(flow);
  const route = selectedLine ? batchRoute(selectedLine, allowedLines, directory) : [];
  const routeLineIds = new Set(route.flatMap((step) => step.lines.map((item) => item.id)));
  const selectedOrder = data.orders.find((order) => order.id === selectedLine?.productionOrderId);
  const selectedFormat = selectedOrder?.format ?? inferFormat(products.find((item) => item.id === selectedLine?.productId));
  const calendarMachines = machines.filter((machine) => machine.unitId === calendar?.unitId && visibleCalendars.some((item) => machine.processIds?.includes(item.processId)));
  const unitMachines = machines.filter((machine) => machine.unitId === activityCalendar?.unitId);
  const activityMachines = unitMachines.filter((machine) => machine.processIds?.includes(activityCalendar?.processId ?? ""));
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
    const errors = validateCompletion(selectedLine, input, identity ? { ...member, role: "production" } : member, directory, !identity);
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
    const errors = validateDirectoryChange(directory, next, machines, usedCalendarIds, identity ? "" : memberId);
    if (errors.length) return errors;
    setDirectory(next);
    setSelectedActivity(null);
    return [];
  }
  // Every date change (drag in calendar or list, or the activity's date field) goes through here,
  // so bookings, orders and reports follow. Process-flow problems are warned about, not blocked.
  function moveLine(id: string, date: string) {
    if (!canPlan || !allowedLines.some((item) => item.id === id)) return "You cannot move this activity.";
    const result = moveActivity(data.lines, data.entries, id, date, member.name);
    if ("error" in result) return result.error;
    if (result.lines === data.lines) return "";
    setData((current) => ({ ...current, lines: result.lines, entries: result.entries }));
    const when = new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const moved = new Set(result.movedEntryIds);
    const clash = findMachineConflicts(result.entries, machines, products).find((conflict) => conflict.entryIds.some((entryId) => moved.has(entryId)));
    const flowWarning = checkProcessFlow(result.lines, result.entries, data.orders, products, directory).find((warning) => warning.lineIds.includes(id) && !flow.some((old) => old.message === warning.message));
    const base = clash ? `Moved to ${when}. ${machines.find((item) => item.id === clash.machineId)?.name ?? "A machine"} is now double-booked that day; change the machine in the activity or check Reports.`
      : moved.size ? `Moved to ${when}. Its machine booking${moved.size === 1 ? "" : "s"} moved with it.` : `Moved to ${when}. No machine booked yet.`;
    return flowWarning ? `${base} Warning: ${flowWarning.message}` : base;
  }
  // The activity panel's planning form: quantity, priority, notes and PO in one update, and a
  // date change through moveActivity so its bookings follow, exactly like dragging.
  function savePlanning(line: PlanLine) {
    const current = allowedLines.find((item) => item.id === line.id);
    if (!canPlan || !current || current.completedAt) return "This activity cannot be changed.";
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return "Quantity must be greater than zero.";
    if (line.productionOrderId && !data.orders.some((order) => order.id === line.productionOrderId)) return "Choose an existing PO.";
    const edited = data.lines.map((item) => item.id === line.id ? { ...(({ productionOrderId: _, ...rest }) => rest)(item), ...(line.productionOrderId ? { productionOrderId: line.productionOrderId } : {}), quantity: line.quantity, priority: line.priority, notes: line.notes, batchSizeKg: batchKilograms(line.quantity, item.uom ?? products.find((product) => product.id === item.productId)?.uom ?? "", item.unitWeightMg) } : item);
    const moved = moveActivity(edited, data.entries, line.id, line.plannedDate, member.name);
    if ("error" in moved) return moved.error;
    setData((state) => ({ ...state, lines: moved.lines, entries: moved.entries }));
    const warning = checkProcessFlow(moved.lines, moved.entries, data.orders, products, directory).find((item) => item.lineIds.includes(line.id));
    const bookings = moved.movedEntryIds.length ? ` Its machine booking${moved.movedEntryIds.length === 1 ? "" : "s"} moved with it.` : "";
    return `Planning saved.${bookings}${warning ? ` Warning: ${warning.message}` : ""}`;
  }
  // The order grid's "+ Add batch": one activity per step of the order's route.
  function addBatch(orderId: string, batch: NewBatch) {
    if (!caps.createPlan) return ["Planning access is required to add batches."];
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return ["This order no longer exists."];
    const product = products.find((item) => item.id === order.productId);
    const result = createBatchLines(batch, { order, format: order.format ?? inferFormat(product), lines: data.lines, directory, uom: order.uom, newId: () => newId("line") });
    if ("error" in result) return [result.error];
    if (result.lines.some((line) => !allowedCalendars.some((calendar) => calendar.id === line.calendarId))) return ["You do not have access to every process of this batch."];
    setData((current) => ({ ...current, lines: [...current.lines, ...result.lines] }));
    return [];
  }
  function saveOrder(order: PurchaseOrder) {
    if (!canEditOrders) return ["Planner or administrator access is required."];
    const errors = validateOrder(order, data.orders, products);
    if (errors.length) return errors;
    setData((current) => ({ ...current, orders: current.orders.some((item) => item.id === order.id) ? current.orders.map((item) => item.id === order.id ? { ...order, poNumber: order.poNumber.trim(), customerName: order.customerName?.trim() } : item) : [...current.orders, { ...order, poNumber: order.poNumber.trim(), customerName: order.customerName?.trim() }] }));
    return [];
  }
  // Several line items of one PO are added together, each checked against the ones before it.
  function addOrders(items: PurchaseOrder[]) {
    if (!canEditOrders) return ["Planner or administrator access is required."];
    const accepted: PurchaseOrder[] = [];
    const errors = items.flatMap((order, index) => {
      const problems = validateOrder(order, [...data.orders, ...accepted], products);
      if (!problems.length) accepted.push({ ...order, poNumber: order.poNumber.trim(), customerName: order.customerName?.trim() });
      return items.length > 1 ? problems.map((problem) => `Item ${index + 1}: ${problem}`) : problems;
    });
    if (errors.length) return errors;
    setData((current) => ({ ...current, orders: [...current.orders, ...accepted] }));
    return [];
  }
  function deleteOrder(id: string) {
    if (!canEditOrders) return ["Planner or administrator access is required."];
    if (data.lines.some((line) => line.productionOrderId === id)) return ["Activities are linked to this PO. Unlink them on the Planner Board first."];
    setData((current) => ({ ...current, orders: current.orders.filter((item) => item.id !== id) }));
    return [];
  }
  // Set the machine for a batch step. Unbooked days get a draft booking for the working day.
  function assignMachine(lineIds: string[], machineId: string) {
    if (!canAssign) return ["Planning or production access is required."];
    const targets = allowedLines.filter((line) => lineIds.includes(line.id) && !line.completedAt);
    if (!targets.length || targets.length !== lineIds.length) return ["These activities can no longer be changed."];
    let next = data.entries;
    for (const line of targets) {
      const processId = allowedCalendars.find((item) => item.id === line.calendarId)?.processId;
      const own = next.filter((entry) => entry.planLineId === line.id && entry.status !== "Cancelled");
      if (!machineId) {
        if (own.some((entry) => entry.status !== "Draft")) return ["Confirmed bookings keep their machine. Choose another machine instead."];
        next = next.filter((entry) => !own.includes(entry));
        continue;
      }
      const machine = machines.find((item) => item.id === machineId && item.active === "Active" && item.unitId === activityCalendar?.unitId && item.processIds?.includes(processId ?? ""));
      if (!machine) return ["Select an active machine set up for this process."];
      next = own.length
        ? next.map((entry) => own.includes(entry) ? { ...entry, machineId, workCentreId: machine.workCentreId, changedBy: member.name } : entry)
        : [...next, { id: newId("sched"), calendarId: line.calendarId, planLineId: line.id, productId: line.productId, productionOrderId: line.productionOrderId, workCentreId: machine.workCentreId, machineId, startAt: `${line.plannedDate}T08:00`, endAt: `${line.plannedDate}T17:00`, status: "Draft" as const, changedBy: member.name }];
    }
    const changed = new Set(next.filter((entry) => lineIds.includes(entry.planLineId ?? "")).map((entry) => entry.id));
    const clash = findMachineConflicts(next, machines, products).find((conflict) => conflict.entryIds.some((id) => changed.has(id)));
    if (clash) return [`${machines.find((item) => item.id === clash.machineId)?.name ?? "This machine"} is already booked at that time.`];
    setData((current) => ({ ...current, entries: next }));
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
  function applySnapshot(next: WorkspaceSnapshot) {
    if (!canManage) return;
    setDirectory(next.directory); setProducts(next.products); setWorkCentres(next.workCentres); setMachines(next.machines); setData(next.data);
    setUnitSelection(""); setProcessSelection(null); setSelectedActivity(null);
  }
  function receiveWip(id: string) {
    if (!canProduce || !scope(data.transfers).some((item) => item.id === id)) return;
    setData((current) => ({ ...current, transfers: current.transfers.map((item) => item.id === id && !item.receivedAt ? { ...item, receivedAt: new Date().toISOString(), receivedBy: member.name } : item) }));
  }
  function planWip(id: string, date: string) {
    if (!canCreate || !scope(data.transfers).some((item) => item.id === id)) return;
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
    <AppHeader activeTab={activeTab} conflictCount={conflicts.length} onTabChange={setActiveTab} showReports={caps.reports} />
    <div className="workstation-content">
      <header className="workstation-topbar"><span>Bio Tree / Production</span>{identity ? <span className="user-selector signed-in">Signed in as <strong>{identity.name}</strong></span> : <label className="user-selector">User<select value={memberId} onChange={(event) => { setMemberId(event.target.value); setProcessSelection(null); setSelectedActivity(null); }}>{directory.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}</header>
      {persistenceStatus}
      {activeTab !== "planner" ? <div className="workspace-heading"><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div> : null}
      {!unit && activeTab !== "master" ? <section><p>{canManage ? "Add a unit to create its calendar." : "No unit assigned. Contact your administrator."}</p>{canManage ? <button type="button" className="primary-button" onClick={() => { setActiveTab("master"); setAdminSection("Configuration"); }}>Manage units</button> : null}</section> : null}
      {unit && !unitCalendars.length && activeTab === "planner" ? <p role="status">{directory.calendars.some((item) => item.unitId === unit.id) ? "No process access assigned for this unit. Configure access in Admin." : "No processes configured for this unit yet."}</p> : null}
      {unit && activeTab === "planner" ? <PlannerBoard planningView={planningView} onPlanningView={setPlanningView} processNames={processNames} key={`${unit.id}-${memberId}`} calendars={visibleCalendars} filterControls={filterControls} calendarTitle={calendarTitle} entries={entries} machines={calendarMachines} canPlan={canPlan && visibleCalendars.length > 0} canCreate={canCreate && visibleCalendars.length > 0} demo={!identity} onSelect={setSelectedActivity} planLines={planLines} products={products} orders={data.orders} flow={flow}
        onMoveLine={moveLine}
        onAddLine={(line) => { if (canCreate && visibleCalendars.some((item) => item.id === line.calendarId) && products.some((item) => item.id === line.productId && item.active === "Active") && Number.isFinite(line.quantity) && line.quantity > 0 && (!line.productionOrderId || data.orders.some((order) => order.id === line.productionOrderId))) setData((current) => ({ ...current, lines: [...current.lines, line] })); }} /> : null}
      {activeTab === "planner" && selectedLine ? <ActivityWorkspace key={`${selectedLine.id}-${memberId}`} line={selectedLine} product={products.find((item) => item.id === selectedLine.productId)} machines={activityMachines} entries={entries.filter((item) => item.planLineId === selectedLine.id)} canPlan={canPlan && !selectedLine.completedAt} canProduce={canProduce && !selectedLine.completedAt} onClose={() => setSelectedActivity(null)} onProduction={saveProduction}
        orders={data.orders} route={route} format={selectedFormat} warnings={flow.filter((warning) => warning.lineIds.some((id) => routeLineIds.has(id)))} routeMachines={unitMachines} routeEntries={data.entries} canAssign={canAssign} statuses={statuses} onAssignMachine={assignMachine} onOpenLine={setSelectedActivity}
        onPlan={savePlanning}>
        <EndProduction line={selectedLine} outgoing={data.transfers.find((item) => item.sourceLineId === selectedLine.id)} uom={selectedLine.uom ?? products.find((product) => product.id === selectedLine.productId)?.uom ?? ""} directory={directory} editable={canProduce} onComplete={completeProduction} />
      </ActivityWorkspace> : null}
      {activeTab === "master" ? canManage ? <>
        <div className="view-switch admin-main-tabs" aria-label="Admin area">{["Configuration", "Products", "Measurements", "Sample data"].map((item) => <button key={item} type="button" aria-pressed={adminSection === item} onClick={() => setAdminSection(item)}>{item}</button>)}</div>
        {adminSection === "Configuration" ? <CalendarAdmin directory={directory} onSave={saveDirectory} machines={machines} workCentres={workCentres} onMachine={saveMachine} onDeleteMachine={deleteMachine} onOpenCalendar={(unitId) => { setUnitSelection(unitId); setProcessSelection(null); setSelectedActivity(null); setActiveTab("planner"); }} /> : null}
        {adminSection === "Sample data" ? <SampleDataAdmin snapshot={snapshot} onApply={applySnapshot} onOpenCalendar={() => { setUnitSelection(directory.units.find((item) => item.id.startsWith("sample-"))?.id ?? ""); setProcessSelection(null); setSelectedActivity(null); setActiveTab("planner"); }} /> : null}
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
      </> : <section className="admin-access"><h2>Administrator access required</h2>{identity ? <p>Your Bio Tree role does not include scheduler master data. Ask your Bio Tree administrator if you need it.</p> : <><p>The current user is a {member.role}.</p><button type="button" className="primary-button" onClick={() => { const admin = directory.people.find((person) => person.role === "admin"); if (admin) { setMemberId(admin.id); setProcessSelection(null); } }}>Open administrator preview</button></>}</section> : null}
      {activeTab === "orders" ? <OrdersPanel orders={data.orders} lines={data.lines} products={products} directory={directory} visibleCalendarIds={allowedCalendars.map((item) => item.id)} editable={canEditOrders} userName={member.name} onSave={saveOrder} onAdd={addOrders} onDelete={deleteOrder} flow={flow} canAddBatch={caps.createPlan} onAddBatch={addBatch} /> : null}
      {activeTab === "reports" && calendar && caps.reports ? <>
        {filterControls}
        <ProductionActuals key={`${calendarId}-${memberId}-${visibleCalendars.map((item) => item.id).join("-")}`} lines={planLines} products={products} actuals={scope(data.actuals)} editable={canProduce} onSave={saveActual} />
        <details className="wip-reports"><summary>Incoming WIP ({scope(data.transfers).filter((item) => !item.receivedAt).length})</summary><WipInbox transfers={scope(data.transfers)} products={products} directory={directory} canReceive={canProduce} canPlan={canCreate} onReceive={receiveWip} onPlan={planWip} /></details>
        <ReportsPanel planLines={planLines} entries={entries} products={products} workCentres={workCentres} machines={calendarMachines} />
      </> : null}
    </div>
  </main>;
}
