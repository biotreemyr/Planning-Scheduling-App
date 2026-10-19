"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, FileText, FlaskConical, Sparkles, LayoutGrid, Users, History } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { StatusBadge } from "@/components/StatusBadge";
import PlanningCalendar from "@/components/PlanningCalendar";
import { ToolbarMenu } from "@/components/ToolbarMenu";
import { DateCheckProvider, useDateCheck } from "@/components/DateCheck";
import { stampChanges } from "@/lib/services/stamps";
import { dateWarnings } from "@/lib/services/dateChecks";
import { ActivityWorkspace } from "@/components/ActivityWorkspace";
import { CalendarAdmin } from "@/components/CalendarAdmin";
import { validateDirectoryChange } from "@/lib/services/adminConfiguration";
import { ProductionUpdate, WipInbox } from "@/components/ProductionFlow";
import { accessibleCalendars, selectedUnitCalendars, scopeCalendarRecords, type CalendarDirectory, type CalendarPerson } from "@/lib/domain/calendarAccess";
import type { WorkspaceEnvelope, WorkspaceSnapshot } from "@/lib/domain/workspace";
import { SampleDataAdmin } from "@/components/SampleDataAdmin";
import { useWorkspacePersistence } from "@/components/WorkspacePersistence";
import { capabilitiesForDemoRole, capabilitiesFromPermissions } from "@/lib/auth/capabilities";
import { OrdersPanel } from "@/components/OrdersPanel";
import { StatusPanel, type StatusSection } from "@/components/StatusPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { inUnit, type JobPlan } from "@/components/JobPlanDialog";
import { calendarProcessName, calendarSettings, unitRoute, type ProcessSettings } from "@/lib/services/processSetup";
import { batchRoute, isNonProduction, validateOrder, type PurchaseOrder } from "@/lib/services/orders";
import { awaitingReceipt, validateCompletion, validateCorrection, withoutProgress, type CompletionInput, type Progress, type CorrectionInput, type WipTransfer } from "@/lib/services/productionFlow";
import { localDateKey } from "@/lib/services/calendarPrint";
import { ProductionActuals, type ActualInput } from "@/components/ProductionActuals";
import { validateActual, type ProductionActual } from "@/lib/services/actuals";
import { batchKilograms, isVolume } from "@/lib/services/measurements";
import { MeasurementProvider, MeasurementAdmin, useSettings } from "@/components/MeasurementSettings";
import type {
  Machine,
  PlanLine,
  Product,
  ScheduleEntry,
  WorkCentre
} from "@/lib/domain/types";
import { priorities, type Customer } from "@/lib/domain/types";
import { findMachineConflicts } from "@/lib/services/conflicts";
import { formatYield, limitText, stepYieldWith, yieldWarnings, type YieldLimits } from "@/lib/services/yields";
import { YieldLimitsProvider } from "./YieldLimitsContext";
import { closeOrder, formulaPending, jobForOrder, readyToClose, releaseToOrders, sharesProblem, type ReleaseEntry } from "@/lib/services/sharedJobs";
import { bookActivityMachines, bookedMachineIds, machineLabel, sameMachines, withMasterEquipment } from "@/lib/services/machines";
import type { EquipmentCatalog } from "@/lib/services/masterData";
import { getScheduleReport } from "@/lib/services/reports";
import { lineEnd, syncPlanLineStatuses } from "@/lib/services/scheduling";
import { moveActivity, reopenMovedBookings, resizeActivity } from "@/lib/services/planChanges";
import { recordTest, rejectBatch, type TestResult, checkTally, createManualJobOrder, lateWarnings, linesForJob, processQuantity, type ManualJob, updateJobOrder, validateBatchNumber, validateCustomer, type JobOrder } from "@/lib/services/jobOrders";
import { checkProcessFlow, inferFormat, warningsByLine, type FlowWarning } from "@/lib/services/processRules";
import type { Release } from "@/lib/services/releases";
import { ReleaseNotes } from "./ReleaseNotes";
import { formatDate } from "@/lib/services/dates";
import type { OrderCatalog } from "@/lib/services/masterData";

type Tab = "planner" | "orders" | "trials" | "status" | "master" | "reports" | "audit" | "news";
type PlanningView = "calendar" | "list";

const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "planner", label: "Planner Board", icon: CalendarDays },
  { id: "orders", label: "Orders", icon: FileText },
  { id: "trials", label: "R&D, Trial & Pilot", icon: FlaskConical },
  { id: "status", label: "QA/QC", icon: CheckCircle2 },
  { id: "master", label: "Setup", icon: LayoutGrid },
  { id: "reports", label: "Reports", icon: ClipboardList },
  { id: "audit", label: "Audit trail", icon: History },
  { id: "news", label: "What's new", icon: Sparkles }
];

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function toDisplayDate(value: string) {
  return formatDate(value.slice(0, 10));
}


function labelFor<T extends { id: string; name: string }>(items: T[], id?: string) {
  return items.find((item) => item.id === id)?.name ?? "Unassigned";
}

function AppHeader({
  activeTab,
  onTabChange,
  conflictCount,
  showReports,
  showAudit,
  showAdmin,
  showOrders,
  showStatus,
  statusSections,
  statusSection,
  onStatusSection,
  version,
  badges = {}
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  conflictCount: number;
  showReports: boolean;
  // The Audit trail only with Core's "View audit trails".
  showAudit: boolean;
  // Signed-in Core users see Admin only with Core's "Manage scheduler master data".
  showAdmin: boolean;
  // Orders with Core's "View orders"; Status with "View testing" or "View release".
  showOrders: boolean; showStatus: boolean;
  // QA/QC's sections (Testing, Release) the person may open, listed under it while it is open.
  statusSections: { id: StatusSection; label: string }[]; statusSection: StatusSection; onStatusSection: (section: StatusSection) => void;
  // The released version in use, from CHANGELOG.md; it opens What's new.
  version?: string;
  // Work waiting in a tab, e.g. POs ready for planning to close.
  badges?: Partial<Record<Tab, number>>;
}) {
  return (
    <aside className="app-header">
      <div className="workstation-brand">
        <strong>Bio Tree<span> / OS</span></strong>
        <p>Production workspace</p>
      </div>
      <nav className="tab-list" aria-label="Scheduler sections">
        {tabs.filter((tab) => (showReports || tab.id !== "reports") && (showAudit || tab.id !== "audit") && (showAdmin || tab.id !== "master") && (showOrders || (tab.id !== "orders" && tab.id !== "trials")) && (showStatus || tab.id !== "status")).map((tab) => {
          const Icon = tab.icon;
          return <Fragment key={tab.id}>
            <button
              className={activeTab === tab.id ? "tab active" : "tab"}
              onClick={() => { onTabChange(tab.id); if (tab.id === "status" && statusSections.length && !statusSections.some((item) => item.id === statusSection)) onStatusSection(statusSections[0].id); }}
              aria-current={activeTab === tab.id && tab.id !== "status" ? "page" : undefined}
              aria-expanded={tab.id === "status" ? activeTab === "status" : undefined}
              type="button"
            >
              <Icon size={17} />
              <span>{tab.label}</span>
              {badges[tab.id] ? <span className="tab-badge" title={`${badges[tab.id]} PO${badges[tab.id] === 1 ? "" : "s"} ready to close`}>{badges[tab.id]}</span> : null}
            </button>
            {tab.id === "status" && activeTab === "status" ? <div className="tab-sub" role="group" aria-label="QA/QC sections">
              {statusSections.map((item) => <button key={item.id} type="button" className={statusSection === item.id ? "tab sub active" : "tab sub"} aria-current={statusSection === item.id ? "page" : undefined} onClick={() => onStatusSection(item.id)}>{item.label}</button>)}
            </div> : null}
          </Fragment>;
        })}
      </nav>
      <button type="button" onClick={() => onTabChange(showReports ? "reports" : "planner")} className={conflictCount > 0 ? "alert-pill visible" : "alert-pill"}>
        <AlertTriangle size={16} />
        <span>{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span>
      </button>
      <div className="sidebar-footer">Bio Tree Biotechnology<p>Planning & production</p>{version ? <button type="button" className="app-version" title="What's new in this version" onClick={() => onTabChange("news")}>v{version}</button> : null}</div>
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
  processSettings,
  calendars,
  filterControls,
  calendarTitle,
  entries,
  machines,
  planLines,
  products,
  orders,
  jobOrders,
  allLines,
  canPrint,
  flow,
  onJobPlan,
  editJobRequest,
  onMoveLine,
  onResizeLine,
  canPlan,
  canCreate,
  demo,
  onSelect,
  planningView,
  onPlanningView
}: {
  processNames: Record<string, string>;
  processSettings: Record<string, ProcessSettings>;
  calendars: UnitCalendar[];
  filterControls: ReactNode;
  calendarTitle: string;
  entries: ScheduleEntry[];
  machines: Machine[];
  planLines: PlanLine[];
  products: Product[];
  orders: PurchaseOrder[];
  jobOrders: JobOrder[];
  // Every activity, including processes out of view, so a planned job order never shows as waiting.
  allLines: PlanLine[];
  // Whether this person may plan job orders (the waiting list's Plan buttons).
  canPrint: boolean;
  flow: FlowWarning[];
  // The plan form: a job order's whole route (new), or corrections to a planned one (edit).
  onJobPlan: (plan: JobPlan, mode: "new" | "edit") => { error: string } | { message: string };
  editJobRequest: { jobId: string; nonce: number } | null;
  onMoveLine: (id: string, date: string) => string;
  onResizeLine: (id: string, endDate: string) => string;
  canPlan: boolean;
  canCreate: boolean;
  demo: boolean;
  onSelect: (id: string) => void;
  planningView: PlanningView;
  onPlanningView: (view: PlanningView) => void;
}) {
  const setPlanningView = onPlanningView;
  const [initialDate] = useState(() => localDateKey(new Date()));
  const planRequest = editJobRequest;
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
        <div className="panel-title planner-title">
          <h2>Production plan</h2>
          {filterControls}
          <label className="planning-search"><span className="admin-sr-only">Search plans</span><input type="search" placeholder="Search product, order, remarks" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <ToolbarMenu label="Filters" badge={[priorityFilter, statusFilter].filter(Boolean).length || undefined} active={!!(priorityFilter || statusFilter)}>
            <div className="toolbar-menu-fields">
              <label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{["Unscheduled", "Partially Scheduled", "Fully Scheduled"].map((value) => <option key={value}>{value}</option>)}</select></label>
              {priorityFilter || statusFilter ? <button type="button" className="calendar-button" onClick={() => { setPriorityFilter(""); setStatusFilter(""); }}>Clear filters</button> : null}
            </div>
          </ToolbarMenu>
          <JobOrderQueue jobOrders={jobOrders} orders={orders} products={products} lines={allLines} calendars={calendars} />
          <span className="result-count" aria-live="polite">{visibleLines.length} of {planLines.length} lines</span>
          <div className="view-switch" aria-label="Planning view">
            <button type="button" aria-pressed={planningView === "calendar"} onClick={() => setPlanningView("calendar")}>Calendar</button>
            <button type="button" aria-pressed={planningView === "list"} onClick={() => setPlanningView("list")}>List</button>
          </div>
        </div>
        <FlowBanner warnings={flow.filter((warning) => warning.lineIds.some((id) => planLines.some((line) => line.id === id)))} onOpen={onSelect} />
        {visibleLines.length === 0 && planLines.length > 0 ? <p role="status" className="empty-state">No plan lines match these filters.</p> : null}
        <PlanningCalendar canPrint={canPrint} processNames={processNames} processSettings={processSettings} planningView={planningView} calendars={calendars} calendarTitle={calendarTitle} allPrintLines={planLines} entries={entries} machines={machines} canPlan={canPlan} canCreate={canCreate} demo={demo} onSelect={onSelect} planLines={visibleLines} products={products} orders={orders} jobOrders={jobOrders} warnings={warningsByLine(flow)} initialDate={initialDate} onMove={onMoveLine} onResize={onResizeLine} allLines={allLines} editJobRequest={planRequest} onPlanJob={(plan, mode) => {
          const result = onJobPlan(plan, mode);
          if ("message" in result) { setQuery(""); setPriorityFilter(""); setStatusFilter(""); }
          return result;
        }} />
      </div>
    </section>
  );
}

// Job orders released from POs made in this unit that planning has not scheduled yet: a closed
// list that opens on click, only to show what is pending. Planning is done with Production Planning.
function JobOrderQueue({ jobOrders, orders, products, lines, calendars }: { jobOrders: JobOrder[]; orders: PurchaseOrder[]; products: Product[]; lines: PlanLine[]; calendars: UnitCalendar[] }) {
  // Every activity of the job counts, even in processes filtered out of view.
  const waiting = jobOrders.filter((job) => !lines.some((line) => line.jobOrderId === job.id) && calendars.length > 0 && inUnit(job, orders, calendars[0]?.unitId));
  if (!waiting.length) return null;
  return <ToolbarMenu className="job-queue" label="Waiting to plan" badge={waiting.length} active>
    <p className="job-queue-title">Job orders waiting to be planned</p>
    <ul>{waiting.map((job) => {
      const order = orders.find((item) => item.id === job.orderId);
      const product = products.find((item) => item.id === order?.productId);
      return <li key={job.id}>
        <span><strong>{job.number}</strong> · {product?.name ?? "Unknown product"} · {job.quantity.toLocaleString()} {job.uom}{job.batchSizeKg ? ` (${job.batchSizeKg.toLocaleString()} kg)` : job.batchVolumeL ? ` (${job.batchVolumeL.toLocaleString()} L)` : ""}<small>{order ? `${order.poNumber}${order.customerName ? ` · ${order.customerName}` : ""}` : ""}{job.batchNumber ? ` · Batch no. ${job.batchNumber}` : ""}</small></span>
      </li>;
    })}</ul>
  </ToolbarMenu>;
}

function ReportsPanel({
  planLines,
  entries,
  products,
  processName,
  machines
}: {
  planLines: PlanLine[];
  entries: ScheduleEntry[];
  products: Product[];
  processName: (calendarId: string) => string;
  machines: Machine[];
}) {
  const report = getScheduleReport(planLines, entries, processName, machines, products);

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
            <h2>Load by process</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Process</th>
              <th>Machine bookings</th>
              <th>Scheduled hours</th>
            </tr>
          </thead>
          <tbody>
            {report.processLoad.map((row) => (
              <tr key={row.calendarId}>
                <td>{row.processName}</td>
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
              <h3>{machineLabel(machines.find((item) => item.id === conflict.machineId)) || "Unassigned"}</h3>
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

export default function SchedulerDemo({ initial, writeToken, identity, catalog, equipment, releases = [] }: { initial: WorkspaceEnvelope; writeToken: string; identity?: CoreIdentity; catalog?: OrderCatalog; equipment?: EquipmentCatalog; releases?: Release[] }) {
  return <MeasurementProvider initial={initial.snapshot.measurements}><DateCheckProvider><TeamWorkspace initial={initial} writeToken={writeToken} identity={identity} catalog={catalog} equipment={equipment} releases={releases} /></DateCheckProvider></MeasurementProvider>;
}

function TeamWorkspace({ initial, writeToken, identity, catalog, equipment, releases }: { initial: WorkspaceEnvelope; writeToken: string; identity?: CoreIdentity; catalog?: OrderCatalog; equipment?: EquipmentCatalog; releases: Release[] }) {
  const [directory, setDirectory] = useState<CalendarDirectory>(initial.snapshot.directory);
  const [memberId, setMemberId] = useState(initial.snapshot.directory.people.find((person) => person.role === "admin")!.id);
  // In Core mode the signed-in user replaces the demo person picker. Core has no unit model
  // yet, so they see every unit; what they may change comes only from their Core permissions.
  const coreMember: CalendarPerson | null = identity ? { id: `core-${identity.id}`, name: identity.name, role: "admin", unitIds: directory.units.map((item) => item.id), teamIds: [], calendarIds: directory.calendars.map((item) => item.id), processIds: directory.processes.map((item) => item.id) } : null;
  const member = coreMember ?? directory.people.find((item) => item.id === memberId)!;
  const caps = identity ? capabilitiesFromPermissions(identity.permissions) : capabilitiesForDemoRole(member.role);
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
  // Production can move an activity's dates too, always giving a reason; everything else stays with planners.
  const canMoveDates = canPlan || canProduce;
  const canManage = caps.manage;
  const canAssign = caps.editPlan || caps.produce;
  // Signed-in Core users start on the plan; the local demo starts on Admin to set up units.
  const [activeTab, setActiveTab] = useState<Tab>(identity ? "planner" : "master");
  const [planningView, setPlanningView] = useState<PlanningView>("calendar");
  const [adminSection, setAdminSection] = useState("Setup");
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  // Which QA/QC section is open: Testing or Release.
  const [statusSection, setStatusSection] = useState<StatusSection>("testing");
  // What the last save from the activity panel did, shown once the panel closes.
  const [planNotice, setPlanNotice] = useState("");
  // In the activity window: whether the selected day's production form is open, and the last result.
  const [activityUpdating, setActivityUpdating] = useState(false);
  const [activityNotice, setActivityNotice] = useState("");
  const openActivity = (id: string, update = false) => { setSelectedActivity(id); setActivityUpdating(update); setActivityNotice(""); };
  const checkDates = useDateCheck();
  // "Edit job order planning" from the activity panel reopens the plan form for that job order.
  const [jobEdit, setJobEdit] = useState<{ jobId: string; nonce: number } | null>(null);
  const [products, setProducts] = useState<Product[]>(initial.snapshot.products);
  const [workCentres, setWorkCentres] = useState<WorkCentre[]>(initial.snapshot.workCentres);
  const [storedMachines, setMachines] = useState<Machine[]>(initial.snapshot.machines);
  // QA's acceptable yield ranges, per process and for the final yield.
  const [yieldLimits, setYieldLimits] = useState<YieldLimits>(initial.snapshot.yieldLimits ?? { byProcess: {} });
  // Shown and booked with Master Data's current Equipment ID, name and active state; saved as stored.
  const machines = useMemo(() => withMasterEquipment(storedMachines, equipment), [storedMachines, equipment]);
  const [data, setRawData] = useState<{ lines: PlanLine[]; entries: ScheduleEntry[]; actuals: ProductionActual[]; transfers: WipTransfer[]; orders: PurchaseOrder[]; customers: Customer[]; jobOrders: JobOrder[] }>(initial.snapshot.data);
  type WorkspaceData = { lines: PlanLine[]; entries: ScheduleEntry[]; actuals: ProductionActual[]; transfers: WipTransfer[]; orders: PurchaseOrder[]; customers: Customer[]; jobOrders: JobOrder[] };
  // Every change goes through here and is stamped with who made it and when (see stamps.ts).
  const setData = (update: WorkspaceData | ((current: WorkspaceData) => WorkspaceData)) =>
    setRawData((current) => {
      const next = typeof update === "function" ? update(current) : update;
      const entries = reopenMovedBookings(current.entries, next.entries, caps.approve);
      return stampChanges(current, entries === next.entries ? next : { ...next, entries }, member.name, new Date().toISOString());
    });
  const { uoms, activities } = useSettings();
  const snapshot = { schemaVersion: 1, directory, products, workCentres, machines: storedMachines, measurements: { uoms, activities }, yieldLimits, data } as WorkspaceSnapshot;
  const persistenceStatus = useWorkspacePersistence(initial, snapshot, writeToken);
  const scope = <T extends { calendarId?: string },>(records: T[]) => visibleCalendars.flatMap((item) => scopeCalendarRecords(records, member, item, directory));
  const entries = scope(data.entries);
  // Production, non-production (R&D, trial, pilot batch) or both, by the order an activity belongs to.
  const [streams, setStreams] = useState({ production: true, nonProduction: true });
  const inStream = (orderId?: string) => isNonProduction(data.orders.find((order) => order.id === orderId)) ? streams.nonProduction : streams.production;
  const planLines = syncPlanLineStatuses(scope(data.lines), entries).filter((line) => inStream(line.productionOrderId));
  // The activity panel can step along a batch's route into processes that are filtered out of view.
  const allowedLines = syncPlanLineStatuses(allowedCalendars.flatMap((item) => scopeCalendarRecords(data.lines, member, item, directory)), data.entries);
  const selectedLine = allowedLines.find((line) => line.id === selectedActivity);
  const activityCalendar = allowedCalendars.find((item) => item.id === selectedLine?.calendarId);
  // Orders follow Core's orders tasks only: create adds POs and job orders, edit changes or deletes
  // them, print prints. "View orders" alone is look only.
  const canCreateOrders = caps.createOrders;
  const canEditOrders = caps.editOrders;
  // One set of process-flow warnings feeds the calendar, list, activity panel and orders.
  const flow = [...checkProcessFlow(data.lines, data.entries, data.orders, products, directory), ...checkTally(data.lines, data.jobOrders, directory), ...yieldWarnings(data.jobOrders, data.lines, data.orders, directory), ...lateWarnings(data.lines, data.jobOrders, directory, localDateKey(new Date()))];
  const flowByLine = warningsByLine(flow);
  const route = selectedLine ? batchRoute(selectedLine, allowedLines, directory) : [];
  const routeLineIds = new Set(route.flatMap((step) => step.lines.map((item) => item.id)));
  // The next process this batch is planned in after the selected activity's, for its output.
  const stepIndex = route.findIndex((step) => step.calendar.id === selectedLine?.calendarId);
  const nextCalendarId = stepIndex >= 0 ? route.slice(stepIndex + 1).find((step) => step.lines.length)?.calendar.id : undefined;
  const selectedOrder = data.orders.find((order) => order.id === selectedLine?.productionOrderId);
  const selectedFormat = selectedOrder?.format ?? inferFormat(products.find((item) => item.id === selectedLine?.productId));
  const calendarMachines = machines.filter((machine) => machine.unitId === calendar?.unitId && visibleCalendars.some((item) => machine.processIds?.includes(item.processId)));
  const unitMachines = machines.filter((machine) => machine.unitId === activityCalendar?.unitId);
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
  // The yields an actual would give this activity's process, against QA's limits.
  function stepYieldFor(line: PlanLine, quantity: number, uom: string, weighed?: CompletionInput["weighed"]) {
    const job = data.jobOrders.find((item) => item.id === line.jobOrderId);
    if (!job) return undefined;
    const lines = data.lines.map((item) => item.id === line.id ? { ...item, yieldUom: uom } : item);
    const { weighedQuantity: _q, weighedUom: _u, actualUnitWeightMg: _m, actualUnitVolumeMl: _v, shellWeightMg: _s, ...rest } = line;
    const recorded = weighed ? { ...rest, ...weighedFields({ quantity, destinationId: "", notes: "", weighed }) } : rest;
    return stepYieldWith(job, line.productionOrderId ?? job.orderId, lines, data.orders, directory, line.id, quantity, yieldLimits, recorded);
  }
  // A yield outside QA's limits (% of theoretical) is saved only with production's deviation note.
  function deviationNeeded(line: PlanLine, input: CompletionInput) {
    const stage = stepYieldFor(line, input.quantity, input.uom || line.uom || "", input.weighed);
    return stage?.tone === "out" && !input.deviation?.trim()
      ? `Yield ${formatYield(stage.ofTheoretical)} of theoretical is outside QA's limits (${limitText(stage.limit)}). Add a deviation note before saving.` : "";
  }
  // The empty shell weight last used for this product's capsules, offered again.
  const lastShellWeight = (line: PlanLine) => data.lines.filter((item) => item.productId === line.productId && item.shellWeightMg && item.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0]?.shellWeightMg;
  // Handovers into this activity must be received before it starts or completes.
  const receiptNeeded = (line: PlanLine) => awaitingReceipt(line, data.lines, data.transfers).map((item) =>
    `Acknowledge receipt of ${item.quantity.toLocaleString()} ${item.uom} from ${calendarProcessName(directory, item.sourceCalendarId)} (sent by ${item.createdBy}) before starting this process.`);
  function completeProduction(input: CompletionInput) {
    if (!selectedLine) return ["Activity not available."];
    if (receiptNeeded(selectedLine).length) return receiptNeeded(selectedLine);
    const errors = validateCompletion(selectedLine, input, identity ? { ...member, role: "production" } : member, directory, !identity);
    if (errors.length) return errors;
    const deviation = deviationNeeded(selectedLine, input);
    if (deviation) return [deviation];
    const machine = machineChange(selectedLine, input.machineIds);
    if ("error" in machine) return [machine.error];
    // The completed day production keyed in, at the time of saving (or end of day for an earlier day).
    const now = new Date();
    const completedAt = input.completedDate && input.completedDate !== localDateKey(now) ? new Date(`${input.completedDate}T17:00`).toISOString() : now.toISOString();
    const line = selectedLine;
    // The unit production reported in (kg at dispensing, boxes at packing...), else the planned one.
    const uom = input.uom || (line.uom ?? products.find((product) => product.id === line.productId)?.uom ?? "");
    const transfer: WipTransfer | undefined = input.destinationId ? {
      id: newId("wip"), sourceLineId: line.id, sourceCalendarId: line.calendarId!, calendarId: input.destinationId,
      productId: line.productId, quantity: input.quantity, uom, orderReference: line.orderReference,
      notes: input.notes, createdAt: completedAt, createdBy: member.name, ...(input.wipRoom ? { wipRoom: true } : {})
    } : undefined;
    setData((current) => {
      if (current.lines.find((item) => item.id === line.id)?.completedAt) return current;
      const existingActual = current.actuals.find((item) => item.planLineId === line.id);
      const actual: ProductionActual = { ...existingActual, planLineId: line.id, calendarId: line.calendarId, teamId: "", actualQuantity: input.quantity, plannedQuantity: line.quantity, uom, productionDate: input.completedDate || localDateKey(new Date(completedAt)), hasDeviation: input.deviation?.trim() ? true : existingActual?.hasDeviation ?? false, deviation: input.deviation?.trim() || existingActual?.deviation || "", correctiveAction: existingActual?.correctiveAction ?? "", updatedAt: completedAt, updatedBy: member.name };
      return {
        ...current,
        lines: current.lines.map((item) => item.id === line.id ? { ...withoutProgress(item), completedAt, yieldQuantity: input.quantity, ...(uom !== (item.uom ?? "") ? { yieldUom: uom } : {}), ...weighedFields(input), startedAt: item.startedAt ?? localDateKey(new Date(completedAt)) } : item),
        entries: (machine.entries ?? current.entries).map((item) => item.planLineId === line.id && item.status !== "Cancelled" ? { ...item, status: "Completed" as const, changedBy: member.name } : item),
        actuals: [...current.actuals.filter((item) => item.planLineId !== line.id), actual],
        transfers: transfer ? [...current.transfers, transfer] : current.transfers
      };
    });
    return [];
  }
  // Output reported by weight keeps what was weighed and the weight of one unit beside the count.
  const weighedFields = (input: CompletionInput) => !input.weighed ? {} : { weighedQuantity: input.weighed.quantity, weighedUom: input.weighed.uom,
    ...(isVolume(input.weighed.uom) ? { actualUnitVolumeMl: input.weighed.unitWeightMg } : { actualUnitWeightMg: input.weighed.unitWeightMg }),
    ...(input.weighed.shellWeightMg ? { shellWeightMg: input.weighed.shellWeightMg } : {}) };
  // Production's machine choice in its update: the bookings this save starts from, with the machine
  // changed when it differs (undefined when no choice was sent).
  function machineChange(line: PlanLine, machineIds?: string[]): { entries?: ScheduleEntry[] } | { error: string } {
    if (machineIds === undefined) return {};
    if (sameMachines(bookedMachineIds(data.entries, line.id), machineIds)) return {};
    const booked = bookMachines(data.entries, line, machineIds);
    return "error" in booked ? booked : { entries: booked.entries };
  }
  // A mistaken production update can be corrected after completion: dates, notes, the actual quantity
  // and where the output went. The handover follows: updated, moved, added, or removed for final output.
  function correctProduction(input: CorrectionInput) {
    const line = selectedLine;
    if (!line || !canProduce) return ["Production access to this activity is required."];
    const outgoing = data.transfers.find((item) => item.sourceLineId === line.id);
    const errors = validateCorrection(line, input, outgoing, identity ? { ...member, role: "production" } : member, directory, !identity);
    if (errors.length) return errors;
    const deviation = deviationNeeded(line, input);
    if (deviation) return [deviation];
    const machine = machineChange(line, input.machineIds);
    if ("error" in machine) return [machine.error];
    const now = new Date();
    const sameDay = line.completedAt && localDateKey(new Date(line.completedAt)) === input.completedDate;
    const completedAt = sameDay ? line.completedAt! : input.completedDate === localDateKey(now) ? now.toISOString() : new Date(`${input.completedDate}T17:00`).toISOString();
    const uom = input.uom || (line.uom ?? "");
    const handedOver = !!outgoing && !!(outgoing.receivedAt || outgoing.plannedLineId);
    setData((current) => {
      const lines = current.lines.map((item) => {
        if (item.id !== line.id) return item;
        const { yieldUom: _u, startedAt: _s, productionNotes: _n, weighedQuantity: _wq, weighedUom: _wu, actualUnitWeightMg: _wm, actualUnitVolumeMl: _wv, shellWeightMg: _sw, ...rest } = item;
        return { ...rest, completedAt, yieldQuantity: input.quantity, ...(uom !== (item.uom ?? "") ? { yieldUom: uom } : {}), ...weighedFields(input),
          startedAt: input.startedAt || input.completedDate!, ...(input.notes ? { productionNotes: input.notes } : {}) };
      });
      const actuals = current.actuals.map((item) => item.planLineId === line.id ? { ...item, actualQuantity: input.quantity, uom, productionDate: input.completedDate!, updatedAt: now.toISOString(), updatedBy: member.name,
        ...(input.deviation?.trim() ? { hasDeviation: true, deviation: input.deviation.trim() } : {}) } : item);
      let transfers = current.transfers;
      if (!handedOver) {
        transfers = transfers.filter((item) => item.sourceLineId !== line.id);
        if (input.destinationId) transfers = [...transfers, { ...(outgoing ?? { id: newId("wip"), sourceLineId: line.id, sourceCalendarId: line.calendarId!, productId: line.productId, orderReference: line.orderReference, createdBy: member.name }),
          calendarId: input.destinationId, quantity: input.quantity, uom, notes: input.notes, createdAt: outgoing?.createdAt ?? completedAt, ...(input.wipRoom ? { wipRoom: true } : { wipRoom: undefined }) }];
        transfers = transfers.map((item) => item.wipRoom === undefined ? (({ wipRoom: _w, ...rest }) => rest)(item) : item);
      }
      return { ...current, lines, actuals, transfers, ...(machine.entries ? { entries: machine.entries } : {}) };
    });
    return [];
  }
  // Production's progress on an activity: the day it started and notes; its bookings go in progress.
  function saveProgress(startedAt: string, notes: string, machineIds?: string[], progress?: Progress) {
    const line = selectedLine;
    if (!line || !canProduce) return ["Production access to this activity is required."];
    if (line.completedAt) return ["This activity is already complete."];
    if (startedAt && !/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return ["Choose the date production started."];
    if (startedAt && !line.startedAt && receiptNeeded(line).length) return receiptNeeded(line);
    const machine = machineChange(line, machineIds);
    if ("error" in machine) return [machine.error];
    setData((previous) => { const current = machine.entries ? { ...previous, entries: machine.entries } : previous; return { ...current,
      // The amount run so far and the output's destination are kept as keyed in (an emptied amount is
      // cleared). Without them (calls from completion), what was saved stays.
      lines: current.lines.map((item) => item.id !== line.id ? item : (({ startedAt: _s, productionNotes: _n, ...rest }) => ({ ...(progress === undefined ? rest : withoutProgress(rest)), ...(startedAt ? { startedAt } : {}), ...(notes ? { productionNotes: notes } : {}), ...(progress?.quantity !== undefined ? { progressQuantity: progress.quantity, progressUom: progress.uom, ...(progress.unitSize ? { progressUnitSize: progress.unitSize } : {}) } : {}), ...(progress?.destination ? { progressDestination: progress.destination } : {}) }))(item)),
      entries: startedAt ? current.entries.map((entry) => entry.planLineId === line.id && (entry.status === "Draft" || entry.status === "Confirmed") ? { ...entry, status: "In Progress" as const, changedBy: member.name } : entry) : current.entries }; });
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
  // The planner's reason for a plan date before today, kept on the activities it applies to.
  // The reason given for a plan change (a date before today, or any change made by production), kept on
  // the activities it applies to; a change needing no reason clears an earlier one.
  const withPlanReason = (lines: PlanLine[], ids: string[], reason?: string) => lines.map((line) => !ids.includes(line.id) ? line
    : reason ? { ...line, planChangeReason: reason } : (({ planChangeReason: _r, ...rest }) => rest)(line));
  // Every date change (drag in calendar or list, or the activity's date field) goes through here,
  // so bookings, orders and reports follow. Process-flow problems are warned about, not blocked.
  // A drop on a day before today is confirmed first, with the planner's reason; production gives a
  // reason for every change. The move then happens and reports as usual.
  function moveLine(id: string, date: string) {
    const line = allowedLines.find((item) => item.id === id);
    const checks = [{ label: `${line?.activityType ?? "Activity"} date`, value: date, rule: "plan" as const, was: line?.plannedDate }];
    if (line && !canPlan && canProduce) { checkDates(checks, (reason) => setPlanNotice(applyMove(id, date, reason)), { reason: "always" }); return ""; }
    if (canPlan && line && dateWarnings(checks, localDateKey(new Date())).length) { checkDates(checks, (reason) => setPlanNotice(applyMove(id, date, reason))); return ""; }
    return applyMove(id, date);
  }
  function applyMove(id: string, date: string, reason?: string) {
    if (!canMoveDates || !allowedLines.some((item) => item.id === id)) return "You cannot move this activity.";
    if (!canPlan && !reason) return "Give a reason for changing the plan.";
    const result = moveActivity(data.lines, data.entries, id, date, member.name);
    if ("error" in result) return result.error;
    if (result.lines === data.lines) return "";
    setData((current) => ({ ...current, lines: withPlanReason(result.lines, [id], reason), entries: result.entries }));
    const when = formatDate(date);
    const moved = new Set(result.movedEntryIds);
    const clash = findMachineConflicts(result.entries, machines, products).find((conflict) => conflict.entryIds.some((entryId) => moved.has(entryId)));
    const flowWarning = checkProcessFlow(result.lines, result.entries, data.orders, products, directory).find((warning) => warning.lineIds.includes(id) && !flow.some((old) => old.message === warning.message));
    const base = clash ? `Moved to ${when}. ${machineLabel(machines.find((item) => item.id === clash.machineId)) || "A machine"} is now double-booked that day; change the machine in the activity or check Reports.`
      : moved.size ? `Moved to ${when}. Its machine booking${moved.size === 1 ? "" : "s"} moved with it.` : `Moved to ${when}. No machine booked yet.`;
    return flowWarning ? `${base} Warning: ${flowWarning.message}` : base;
  }
  // Dragging an activity's edge sets its last day; its bookings follow and a machine clash is reported.
  function resizeLine(id: string, endDate: string) {
    const line = allowedLines.find((item) => item.id === id);
    const checks = [{ label: `${line?.activityType ?? "Activity"} last day`, value: endDate, rule: "plan" as const, was: line ? lineEnd(line) : undefined }];
    if (line && !canPlan && canProduce) { checkDates(checks, (reason) => setPlanNotice(applyResize(id, endDate, reason)), { reason: "always" }); return ""; }
    if (canPlan && line && dateWarnings(checks, localDateKey(new Date())).length) { checkDates(checks, (reason) => setPlanNotice(applyResize(id, endDate, reason))); return ""; }
    return applyResize(id, endDate);
  }
  function applyResize(id: string, endDate: string, reason?: string) {
    if (!canMoveDates || !allowedLines.some((item) => item.id === id)) return "You cannot change this activity.";
    if (!canPlan && !reason) return "Give a reason for changing the plan.";
    const result = resizeActivity(data.lines, data.entries, id, endDate, member.name);
    if ("error" in result) return result.error;
    if (result.lines === data.lines) return "";
    setData((current) => ({ ...current, lines: withPlanReason(result.lines, [id], reason), entries: result.entries }));
    const line = result.lines.find((item) => item.id === id)!;
    const day = (value: string) => formatDate(value.slice(0, 10));
    const span = line.endDate ? `${day(line.plannedDate)} – ${day(line.endDate)}` : day(line.plannedDate);
    const changed = new Set(result.changedEntryIds);
    const clash = findMachineConflicts(result.entries, machines, products).find((conflict) => conflict.entryIds.some((entryId) => changed.has(entryId)));
    const flowWarning = checkProcessFlow(result.lines, result.entries, data.orders, products, directory).find((warning) => warning.lineIds.includes(id) && !flow.some((old) => old.message === warning.message));
    const base = `${line.activityType ?? "Activity"} now planned ${span}.${clash ? ` ${machineLabel(machines.find((item) => item.id === clash.machineId)) || "A machine"} is now double-booked in that time; change the machine or check Reports.` : changed.size ? " Its machine booking runs to the same day." : ""}`;
    return flowWarning ? `${base} Warning: ${flowWarning.message}` : base;
  }
  function saveOrder(order: PurchaseOrder) {
    if (!canEditOrders) return ["Your access does not include editing orders."];
    const errors = validateOrder(order, data.orders, products);
    if (errors.length) return errors;
    const old = data.orders.find((item) => item.id === order.id);
    if (old && old.unitId && old.unitId !== order.unitId && data.lines.some((line) => line.productionOrderId === order.id)) return ["This PO has planned activities in its unit. Remove them before moving it to another unit."];
    setData((current) => ({ ...current, orders: current.orders.some((item) => item.id === order.id) ? current.orders.map((item) => item.id === order.id ? { ...order, poNumber: order.poNumber.trim(), customerName: order.customerName?.trim() } : item) : [...current.orders, { ...order, poNumber: order.poNumber.trim(), customerName: order.customerName?.trim() }] }));
    return [];
  }
  // Several line items of one PO are added together, each checked against the ones before it.
  // A customer ID not seen before is added to the customer list in the same save, and so is a
  // product taken from Master Data that the scheduler did not have yet (or had under its code, unlinked).
  function addOrders(items: PurchaseOrder[], customer: Customer, taken: Product[] = []) {
    if (!canCreateOrders) return ["Your access does not include creating orders."];
    const known = data.customers.find((item) => item.id === customer.id);
    // An R&D, trial or pilot order may have no customer ID: it keeps the name only and adds no customer record.
    const listed = !!customer.code.trim();
    const withTaken = [...products.filter((product) => !taken.some((item) => item.id === product.id)), ...taken];
    const customerErrors = known || !listed ? [] : validateCustomer(customer, data.customers);
    if (customerErrors.length) return customerErrors;
    const accepted: PurchaseOrder[] = [];
    const errors = items.flatMap((order, index) => {
      const { customerId: _c, ...rest } = order;
      const linked = { ...rest, poNumber: order.poNumber.trim(), ...(known || listed ? { customerId: customer.id } : {}), customerName: customer.name.trim() };
      const problems = validateOrder(linked, [...data.orders, ...accepted], withTaken);
      if (!problems.length) accepted.push(linked);
      return items.length > 1 ? problems.map((problem) => `Item ${index + 1}: ${problem}`) : problems;
    });
    if (errors.length) return errors;
    if (taken.length) setProducts((current) => [...current.map((product) => taken.find((item) => item.id === product.id) ?? product), ...taken.filter((item) => !current.some((product) => product.id === item.id))]);
    // A customer taken from Master Data may be the scheduler's own, linked now: it replaces the old record.
    setData((current) => ({ ...current, customers: known ? current.customers.map((item) => item.id === customer.id ? customer : item) : listed ? [...current.customers, { ...customer, code: customer.code.trim(), name: customer.name.trim() }] : current.customers, orders: [...current.orders, ...accepted] }));
    return [];
  }
  // The plan form. New: one activity per ticked process of the job order's route. Edit: rows with an
  // activity are corrected (a date change moves its bookings, like dragging), unticked ones removed,
  // newly ticked ones added. The batch number is stored on the job order either way.
  // Book an activity's machines: the ones ticked stay or are added, the others are let go. Usually one
  // machine; a bottle line books several (counting, capping, sealing, labelling). A booking already made
  // keeps its times: a machine swapped for another takes over its booking. A new one is a draft for the
  // working day (completed, for a completed activity being corrected). Double-booking is refused.
  function bookMachines(current: ScheduleEntry[], line: PlanLine, machineIds: string[]) {
    return bookActivityMachines(current, line, machineIds, { calendars: directory.calendars, machines, products, who: member.name, newId: () => newId("sched") });
  }
  function planJobRoute(plan: JobPlan, mode: "new" | "edit"): { error: string } | { message: string } {
    const job = data.jobOrders.find((item) => item.id === plan.jobId);
    const order = data.orders.find((item) => item.id === job?.orderId);
    if (!job || !order) return { error: "This job order no longer exists." };
    const existing = linesForJob(job.id, data.lines);
    if (mode === "new" && existing.length) return { error: `${job.number} is already planned. Open one of its activities to edit its planning.` };
    if (mode === "new" && !inUnit(job, data.orders, visibleCalendars[0]?.unitId)) return { error: `${order.poNumber} is made in ${directory.units.find((item) => item.id === order.unitId)?.name ?? "another unit"}. Plan it on that unit's board.` };
    // POs with different FG codes share a batch only once QA has confirmed they are the same formula.
    if (mode === "new" && formulaPending(job, data.orders)) return { error: `${job.number} is shared by POs with different FG codes. QA confirms they are the same formula under QA/QC before it can be planned.` };
    // A shared batch's filling and packing rows are for one PO each; the rest belong to the batch's first PO.
    const orderOfRow = (row: { orderId?: string }) => data.orders.find((item) => item.id === (row.orderId ?? job.orderId)) ?? order;
    // Quantities are the job order's theoretical figure for each process, whatever the form sent.
    // A process already split over several days keeps its days' shares (the tally warning checks them).
    // Each process plans with the job order figure set for it in Admin.
    const processRows = (calendarId: string, orderId?: string) => plan.rows.filter((row) => (row.on || row.lineId) && row.calendarId === calendarId && (row.orderId ?? job.orderId) === (orderId ?? job.orderId)).length;
    plan = { ...plan, rows: plan.rows.map((row) => {
      const expected = processRows(row.calendarId, row.orderId) === 1 ? processQuantity(jobForOrder(job, row.orderId ?? job.orderId), calendarSettings(directory, row.calendarId).planned) : undefined;
      return expected ? { ...row, quantity: expected.quantity, uom: expected.uom, batchSizeKg: expected.uom === "kg" ? expected.quantity : batchKilograms(expected.quantity, expected.uom) } : row;
    }) };
    const adding = plan.rows.filter((row) => row.on && !row.lineId);
    const removing = plan.rows.filter((row) => !row.on && row.lineId);
    const keeping = plan.rows.filter((row) => row.on && row.lineId);
    if (adding.length && !canCreate) return { error: "Planning access is required to add activities." };
    if ((removing.length || keeping.length) && !canPlan) return { error: "Planning access is required to change activities." };
    for (const row of [...adding, ...keeping]) {
      if (!visibleCalendars.some((item) => item.id === row.calendarId)) return { error: `You cannot plan ${row.activityType} in this view.` };
      if (!(row.quantity > 0) || !row.uom) return { error: `Enter a quantity and UOM for ${row.activityType}.` };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.plannedDate)) return { error: `Choose a date for ${row.activityType}.` };
    }
    if (removing.some((row) => existing.find((line) => line.id === row.lineId)?.completedAt)) return { error: "Completed activities cannot be removed." };
    const batch = plan.batchNumber.trim();
    const batchChanged = batch !== (job.batchNumber ?? "");
    if (batchChanged && batch) { const problem = validateBatchNumber(batch, job, data.jobOrders); if (problem) return { error: problem }; }
    let lines = data.lines, entries = data.entries;
    let updated = 0;
    // Corrections to existing activities.
    for (const row of keeping) {
      const line = lines.find((item) => item.id === row.lineId);
      if (!line) continue;
      // A completed activity keeps its quantity and machine; only its planned date can be corrected.
      if (line.completedAt) {
        if (line.plannedDate === row.plannedDate) continue;
        const moved = moveActivity(lines, entries, line.id, row.plannedDate, member.name);
        if ("error" in moved) return { error: moved.error };
        lines = moved.lines; entries = moved.entries; updated += 1;
        continue;
      }
      if (line.plannedDate === row.plannedDate && line.quantity === row.quantity && line.uom === row.uom && line.priority === plan.priority) continue;
      updated += 1;
      lines = lines.map((item) => item.id === line.id ? { ...item, quantity: row.quantity, uom: row.uom, priority: plan.priority, ...(row.batchSizeKg !== undefined ? { batchSizeKg: row.batchSizeKg } : {}) } : item);
      const moved = moveActivity(lines, entries, line.id, row.plannedDate, member.name);
      if ("error" in moved) return { error: moved.error };
      lines = moved.lines; entries = moved.entries;
    }
    // Unticked activities go, with their machine bookings.
    const removedIds = new Set(removing.map((row) => row.lineId!));
    lines = lines.filter((line) => !removedIds.has(line.id));
    entries = entries.filter((entry) => !removedIds.has(entry.planLineId ?? ""));
    const added: PlanLine[] = adding.map((row) => ({
      id: newId("line"), planId: "production-plan", calendarId: row.calendarId, productId: orderOfRow(row).productId, productionOrderId: orderOfRow(row).id, jobOrderId: job.id, orderReference: job.number,
      plannedDate: row.plannedDate, quantity: row.quantity, uom: row.uom, activityType: row.activityType, priority: plan.priority, status: "Unscheduled",
      ...(row.batchSizeKg !== undefined ? { batchSizeKg: row.batchSizeKg } : {}), ...(plan.notes.trim() ? { notes: plan.notes.trim() } : {})
    }));
    const savedJob: JobOrder = !batchChanged ? job : batch ? { ...job, batchNumber: batch, batchNumberBy: member.name, batchNumberAt: new Date().toISOString() }
      : (({ batchNumber: _b, batchNumberBy: _by, batchNumberAt: _at, ...rest }) => rest)(job);
    const finalLines = [...lines, ...added];
    // Each process's machine: a draft booking for its planned day, or none when left to choose later.
    let machinesChanged = 0;
    for (const [index, row] of plan.rows.entries()) {
      if (!row.on) continue;
      const line = row.lineId ? finalLines.find((item) => item.id === row.lineId) : added[adding.indexOf(row)];
      if (!line || line.completedAt) continue;
      if (sameMachines(bookedMachineIds(entries, line.id), row.machineIds)) continue;
      const booked = bookMachines(entries, line, row.machineIds);
      if ("error" in booked) return { error: `${plan.rows[index].activityType}: ${booked.error}` };
      entries = booked.entries; machinesChanged += 1;
    }
    // The reason for a date before today goes on each activity planned or moved into the past.
    const today = localDateKey(new Date());
    const pastIds = plan.rows.filter((row) => row.on && row.plannedDate < today).map((row) => row.lineId ? existing.find((line) => line.id === row.lineId)?.plannedDate !== row.plannedDate ? row.lineId : "" : added[adding.indexOf(row)]?.id ?? "").filter(Boolean);
    const savedLines = withPlanReason(finalLines, pastIds, plan.pastReason);
    setData((current) => ({ ...current, lines: savedLines, entries, jobOrders: batchChanged ? current.jobOrders.map((item) => item.id === savedJob.id ? savedJob : item) : current.jobOrders }));
    const parts = [added.length ? `${added.length} added` : "", updated ? `${updated} updated` : "", removing.length ? `${removing.length} removed` : "", machinesChanged && mode === "edit" ? `${machinesChanged} machine${machinesChanged === 1 ? "" : "s"} changed` : ""].filter(Boolean).join(", ");
    const booked = plan.rows.filter((row) => row.on).reduce((total, row) => total + row.machineIds.length, 0);
    return { message: mode === "new" ? `${job.number} planned: ${added.map((line) => line.activityType).join(", ")}${batch ? ` · batch ${batch}` : ""}${booked ? ` · ${booked} machine${booked === 1 ? "" : "s"} booked` : ""}.` : `${job.number} planning saved (${parts || (batchChanged ? "batch number" : "no changes")}).` };
  }
  // A PO item's route from Admin: its unit's processes used for its dosage form, in order.
  const orderRoute = (order: PurchaseOrder) => {
    const route = unitRoute(directory, order.unitId ?? directory.units[0]?.id, order.format ?? inferFormat(products.find((item) => item.id === order.productId)));
    return route.length ? route : undefined;
  };
  // Job orders: keyed in on the PO item, one per batch, each with its own number.
  function addJobOrder(input: ManualJob) {
    if (!canCreateOrders) return ["Your access does not include creating job orders."];
    const created = createManualJobOrder(input, data.orders, data.jobOrders, products, { today: new Date(), userName: member.name, newId: () => newId("job"), routeFor: orderRoute });
    if ("error" in created) return [created.error];
    setData((current) => ({ ...current, jobOrders: [...current.jobOrders, created] }));
    return [];
  }
  // Editing a job order; a new number relabels the batch reference of its activities too.
  function editJobOrder(next: JobOrder) {
    if (!canEditOrders) return ["Your access does not include editing job orders."];
    const current = data.jobOrders.find((job) => job.id === next.id);
    if (!current) return ["This job order no longer exists."];
    const result = updateJobOrder(next, data.jobOrders, data.orders, products, orderRoute);
    if ("error" in result) return [result.error];
    const shareIssue = sharesProblem(result, data.orders, data.jobOrders, (order) => order.format ?? inferFormat(products.find((item) => item.id === order.productId)));
    if (shareIssue) return [shareIssue];
    // A PO taken off a shared batch must not keep filling or packing planned for it.
    const dropped = (current.shares ?? []).filter((share) => !result.shares?.some((item) => item.orderId === share.orderId));
    const stranded = dropped.find((share) => data.lines.some((line) => line.jobOrderId === current.id && line.productionOrderId === share.orderId));
    if (stranded) return [`${data.orders.find((order) => order.id === stranded.orderId)?.poNumber ?? "That PO"} has filling or packing planned from this batch. Remove those activities on the Planner Board first.`];
    // POs with different FG codes need QA's confirmation again whenever the POs sharing the batch change.
    const sameShares = JSON.stringify((current.shares ?? []).map((share) => share.orderId).sort()) === JSON.stringify((result.shares ?? []).map((share) => share.orderId).sort());
    const checked: JobOrder = sameShares ? result : (({ formulaConfirmedBy: _b, formulaConfirmedAt: _a, ...rest }) => rest)(result);
    const batchChanged = (result.batchNumber ?? "") !== (current.batchNumber ?? "");
    const saved: JobOrder = batchChanged && checked.batchNumber ? { ...checked, batchNumberBy: member.name, batchNumberAt: new Date().toISOString() }
      : batchChanged ? (({ batchNumberBy: _by, batchNumberAt: _at, ...rest }) => rest)(checked) : checked;
    // Open activities follow the job order's quantities, when their process runs on one day; a process
    // split over several days is left for planning to share out (the tally warning shows it).
    const jobLines = linesForJob(saved.id, data.lines);
    const synced = new Map(jobLines.flatMap((line) => {
      // A shared batch's filling and packing plan with their own PO's pack figures.
      const expected = processQuantity(jobForOrder(saved, line.productionOrderId ?? saved.orderId), calendarSettings(directory, line.calendarId).planned);
      if (!expected || line.completedAt || jobLines.filter((other) => other.calendarId === line.calendarId && other.productionOrderId === line.productionOrderId).length !== 1) return [];
      return [[line.id, { quantity: expected.quantity, uom: expected.uom, batchSizeKg: expected.uom === "kg" ? expected.quantity : batchKilograms(expected.quantity, expected.uom) }] as const];
    }));
    setData((state) => ({ ...state, jobOrders: state.jobOrders.map((job) => job.id === saved.id ? saved : job),
      lines: state.lines.map((line) => {
        if (line.jobOrderId !== saved.id) return line;
        const quantity = synced.get(line.id);
        const relabelled = saved.number === current.number ? line : { ...line, orderReference: saved.number };
        if (!quantity) return relabelled;
        const { batchSizeKg: _kg, ...rest } = relabelled;
        return { ...rest, quantity: quantity.quantity, uom: quantity.uom, ...(quantity.batchSizeKg !== undefined ? { batchSizeKg: quantity.batchSizeKg } : {}) };
      }) }));
    return [];
  }
  function deleteJobOrder(id: string) {
    if (!canEditOrders) return ["Your access does not include removing job orders."];
    if (linesForJob(id, data.lines).length) return ["This job order is planned. Remove or unlink its activities on the Planner Board first."];
    setData((current) => ({ ...current, jobOrders: current.jobOrders.filter((job) => job.id !== id) }));
    return [];
  }
  // Status: a finished batch passes testing, then is released with its release quantity.
  function testJob(id: string, outcome: TestResult) {
    if (!caps.passTesting) return ["Your access does not include recording testing results."];
    const job = data.jobOrders.find((item) => item.id === id);
    if (!job) return ["This job order no longer exists."];
    const result = recordTest(job, outcome, data.lines, data.transfers, member.name, new Date());
    if ("error" in result) return [result.error];
    setData((current) => ({ ...current, jobOrders: current.jobOrders.map((item) => item.id === id ? result : item) }));
    return [];
  }
  function releaseJob(id: string, entries: ReleaseEntry[]) {
    if (!caps.release) return ["Your access does not include releasing batches."];
    const job = data.jobOrders.find((item) => item.id === id);
    if (!job) return ["This job order no longer exists."];
    const result = releaseToOrders(job, entries, data.orders, member.name, new Date());
    if ("error" in result) return [result.error];
    setData((current) => ({ ...current, jobOrders: current.jobOrders.map((item) => item.id === id ? result : item) }));
    return [];
  }
  // QA sets the acceptable yield ranges.
  function saveYieldLimits(next: YieldLimits) {
    if (!caps.release) return ["Only QA can change the yield limits."];
    setYieldLimits(next);
    return [];
  }
  // QA confirms that POs with different FG codes sharing a batch are the same formula.
  function confirmFormula(id: string) {
    if (!caps.release) return ["Your access does not include confirming a shared batch's formula."];
    const job = data.jobOrders.find((item) => item.id === id);
    if (!job) return ["This job order no longer exists."];
    if (!formulaPending(job, data.orders)) return [`${job.number} has nothing to confirm.`];
    setData((current) => ({ ...current, jobOrders: current.jobOrders.map((item) => item.id === id ? { ...item, formulaConfirmedBy: member.name, formulaConfirmedAt: new Date().toISOString() } : item) }));
    return [];
  }
  function rejectJob(id: string) {
    if (!caps.release) return ["Your access does not include rejecting batches."];
    const job = data.jobOrders.find((item) => item.id === id);
    if (!job) return ["This job order no longer exists."];
    const result = rejectBatch(job, member.name, new Date());
    if ("error" in result) return [result.error];
    setData((current) => ({ ...current, jobOrders: current.jobOrders.map((item) => item.id === id ? result : item) }));
    return [];
  }
  // Planning closes a PO once QA has released and reconciled every batch for it.
  function closePo(id: string, quantity: number, uom: string, note: string) {
    if (!canEditOrders) return ["Your access does not include closing POs."];
    const order = data.orders.find((item) => item.id === id);
    if (!order) return ["This PO no longer exists."];
    if (!readyToClose(order, data.jobOrders)) return [`${order.poNumber} is not ready to close: QA has not released every batch for it yet.`];
    const result = closeOrder(order, quantity, uom, note, member.name, new Date());
    if ("error" in result) return [result.error];
    setData((current) => ({ ...current, orders: current.orders.map((item) => item.id === id ? result : item) }));
    return [];
  }
  function deleteOrder(id: string) {
    if (!canEditOrders) return ["Your access does not include editing orders."];
    if (data.lines.some((line) => line.productionOrderId === id)) return ["Activities are linked to this PO. Unlink them on the Planner Board first."];
    const sharedIn = data.jobOrders.find((job) => job.orderId !== id && job.shares?.some((share) => share.orderId === id));
    if (sharedIn) return [`This PO shares batch ${sharedIn.number}. Take it off that job order first.`];
    // Unplanned job orders of the PO item go with it.
    setData((current) => ({ ...current, orders: current.orders.filter((item) => item.id !== id), jobOrders: current.jobOrders.filter((job) => job.orderId !== id) }));
    return [];
  }
  // Set the machine for a batch step. Unbooked days get a draft booking for the working day.
  function assignMachine(lineIds: string[], machineIds: string[]) {
    if (!canAssign) return ["Planning or production access is required."];
    const targets = allowedLines.filter((line) => lineIds.includes(line.id) && !line.completedAt);
    if (!targets.length || targets.length !== lineIds.length) return ["These activities can no longer be changed."];
    let next = data.entries;
    for (const line of targets) {
      const booked = bookMachines(next, line, machineIds);
      if ("error" in booked) return [booked.error];
      next = booked.entries;
    }
    setData((current) => ({ ...current, entries: next }));
    return [];
  }
  function saveMachine(machine: Machine) {
    if (!canManage) return ["Administrator access is required."];
    if (!machine.name.trim() || !machine.code.trim() || !directory.units.some((item) => item.id === machine.unitId) || !machine.processIds?.length) return ["Choose the equipment, a unit and at least one process."];
    if (machine.processIds.some((processId) => !directory.calendars.some((calendar) => calendar.unitId === machine.unitId && calendar.processId === processId))) return ["Select processes configured under this unit."];
    if (!Number.isInteger(machine.setupMinutes) || machine.setupMinutes! < 0 || (machine.capacity !== undefined && (!Number.isFinite(machine.capacity) || machine.capacity <= 0 || !machine.capacityUom?.trim()))) return ["Enter a non-negative setup time and a positive capacity with its unit/basis."];
    if (machines.some((item) => item.id !== machine.id && item.code.toLowerCase() === machine.code.toLowerCase())) return ["Machine code is already in use."];
    if (machine.masterDataId && storedMachines.some((item) => item.id !== machine.id && item.masterDataId === machine.masterDataId)) return [`${machineLabel(machine)} is already set up as a machine.`];
    const old = machines.find((item) => item.id === machine.id);
    if (old && data.entries.some((entry) => entry.machineId === machine.id && (old.unitId !== machine.unitId || !machine.processIds?.includes(directory.calendars.find((item) => item.id === entry.calendarId)?.processId ?? "")))) return ["A booked machine must retain its unit and booked processes."];
    // Work centres are no longer set up on screen; a machine keeps its own, or takes the first one
    // (one is made when none exists), so the saved records stay linked as before.
    const centre = workCentres.find((item) => item.id === machine.workCentreId) ?? workCentres[0] ?? { id: "wc-general", code: "GEN", name: "General", active: "Active" as const };
    if (!workCentres.some((item) => item.id === centre.id)) setWorkCentres((current) => [...current, centre]);
    const saved = { ...machine, workCentreId: centre.id };
    setMachines((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
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
    setDirectory(next.directory); setProducts(next.products); setWorkCentres(next.workCentres); setMachines(next.machines); setYieldLimits(next.yieldLimits ?? { byProcess: {} }); setRawData(next.data);
    setUnitSelection(""); setProcessSelection(null); setSelectedActivity(null);
  }
  function receiveWip(id: string) {
    if (!canProduce || !scope(data.transfers).some((item) => item.id === id)) return;
    setData((current) => ({ ...current, transfers: current.transfers.map((item) => item.id === id && !item.receivedAt ? { ...item, receivedAt: new Date().toISOString(), receivedBy: member.name } : item) }));
  }
  function planWip(id: string, date: string) {
    checkDates([{ label: "Planned date for the received WIP", value: date, rule: "plan" }], (reason) => applyPlanWip(id, date, reason));
  }
  function applyPlanWip(id: string, date: string, reason?: string) {
    if (!canCreate || !scope(data.transfers).some((item) => item.id === id)) return;
    if (validateActual({ actualQuantity: 0, productionDate: date, hasDeviation: false, deviation: "" }).length) return;
    setData((current) => {
      const transfer = current.transfers.find((item) => item.id === id);
      if (!transfer?.receivedAt || transfer.plannedLineId) return current;
      const lineId = newId("line");
      // Received work continues the same batch, so it keeps the source activity's job order and PO.
      const source = current.lines.find((item) => item.id === transfer.sourceLineId);
      const job = source?.productId === transfer.productId ? current.jobOrders.find((item) => item.id === source.jobOrderId) : undefined;
      const line: PlanLine = { ...(job ? { jobOrderId: job.id, productionOrderId: job.orderId } : {}), id: lineId, planId: "production-plan", calendarId: transfer.calendarId, productId: transfer.productId, quantity: transfer.quantity, uom: transfer.uom, plannedDate: date, priority: "Normal", status: "Unscheduled", incomingWipId: id, notes: transfer.notes, orderReference: transfer.orderReference, ...(reason ? { planChangeReason: reason } : {}), activityType: directory.processes.find((item) => item.id === directory.calendars.find((entry) => entry.id === transfer.calendarId)?.processId)?.name };
      return { ...current, lines: [...current.lines, line], transfers: current.transfers.map((item) => item.id === id ? { ...item, plannedLineId: lineId } : item) };
    });
  }
  // The unit picker shows only when there is more than one unit to choose from (BTP alone today).
  const filterControls = <div className="calendar-filters">
    {availableUnits.length > 1 ? <label>Unit<select value={unit?.id ?? ""} disabled={!unit} onChange={(event) => { setUnitSelection(event.target.value); setProcessSelection(null); setSelectedActivity(null); }}>{!unit ? <option value="">No unit assigned</option> : availableUnits.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
    <fieldset className="stream-ticks"><legend className="admin-sr-only">Show orders</legend>
      <label><input type="checkbox" checked={streams.production} onChange={(event) => setStreams({ ...streams, production: event.target.checked })} />Production</label>
      <label><input type="checkbox" checked={streams.nonProduction} onChange={(event) => setStreams({ ...streams, nonProduction: event.target.checked })} />Non-production</label>
    </fieldset>
    {/* Which processes the calendar and list show, in route order, tucked in a menu. */}
    <ToolbarMenu label="Processes" badge={visibleCalendars.length === unitCalendars.length ? "All" : `${visibleCalendars.length} of ${unitCalendars.length}`} active={visibleCalendars.length !== unitCalendars.length}>
      <fieldset className="process-ticks"><legend>Show processes</legend>
        <label className="process-all"><input type="checkbox" checked={unitCalendars.length > 0 && visibleCalendars.length === unitCalendars.length} onChange={(event) => { setProcessSelection(event.target.checked ? null : []); setSelectedActivity(null); }} />All processes</label>
        {unitCalendars.map((item) => <label key={item.id}><input type="checkbox" checked={visibleCalendars.some((entry) => entry.id === item.id)} onChange={(event) => { const ids = visibleCalendars.map((entry) => entry.id); setProcessSelection(event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id)); setSelectedActivity(null); }} />{item.name}</label>)}
      </fieldset>
    </ToolbarMenu>
  </div>;
  return <YieldLimitsProvider value={yieldLimits}><main className="workstation">
    <AppHeader version={releases[0]?.version} badges={canEditOrders ? { orders: data.orders.filter((order) => !isNonProduction(order) && readyToClose(order, data.jobOrders)).length, trials: data.orders.filter((order) => isNonProduction(order) && readyToClose(order, data.jobOrders)).length } : {}} activeTab={activeTab} conflictCount={conflicts.length} onTabChange={setActiveTab} showReports={caps.reports} showAudit={caps.auditTrail} showAdmin={!identity || canManage} showOrders={caps.viewOrders || caps.createOrders || caps.editOrders} showStatus={caps.viewTesting || caps.viewRelease}
      statusSections={[...(caps.viewTesting ? [{ id: "testing" as const, label: "Testing" }] : []), ...(caps.viewRelease ? [{ id: "release" as const, label: "Release" }, { id: "yield" as const, label: "Yield limits" }] : [])]}
      statusSection={statusSection} onStatusSection={setStatusSection} />
    <div className="workstation-content">
      <header className="workstation-topbar"><div className="topbar-title"><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>{persistenceStatus}</div>{identity ? <span className="user-selector signed-in">Signed in as <strong>{identity.name}</strong></span> : <label className="user-selector">User<select value={memberId} onChange={(event) => { setMemberId(event.target.value); setProcessSelection(null); setSelectedActivity(null); }}>{directory.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}</header>
      {!unit && activeTab !== "master" && activeTab !== "news" ? <section><p>{canManage ? "Add a unit to create its calendar." : "No unit assigned. Contact your administrator."}</p>{canManage ? <button type="button" className="primary-button" onClick={() => { setActiveTab("master"); setAdminSection("Configuration"); }}>Manage units</button> : null}</section> : null}
      {unit && !unitCalendars.length && activeTab === "planner" ? <p role="status">{directory.calendars.some((item) => item.unitId === unit.id) ? "No process access assigned for this unit. Configure access in Setup." : "No processes configured for this unit yet."}</p> : null}
      {planNotice && activeTab === "planner" && !selectedActivity ? <p role="status" className="calendar-notice plan-save-notice">{planNotice}<button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setPlanNotice("")}>×</button></p> : null}
      {unit && activeTab === "planner" ? <PlannerBoard planningView={planningView} onPlanningView={setPlanningView} processNames={processNames} processSettings={Object.fromEntries(visibleCalendars.map((item) => [item.id, calendarSettings(directory, item.id)]))} key={`${unit.id}-${memberId}`} calendars={visibleCalendars} filterControls={filterControls} calendarTitle={calendarTitle} entries={entries} machines={calendarMachines} canPlan={canMoveDates && visibleCalendars.length > 0} canCreate={canCreate && visibleCalendars.length > 0} demo={!identity} onSelect={(id: string) => openActivity(id, canProduce)} planLines={planLines} products={products} orders={data.orders} jobOrders={data.jobOrders.filter((job) => inStream(job.orderId))} allLines={data.lines} canPrint={caps.printPlan} flow={flow}
        onMoveLine={moveLine} onResizeLine={resizeLine}
        onJobPlan={planJobRoute} editJobRequest={jobEdit} /> : null}
      {activeTab === "planner" && selectedLine ? <ActivityWorkspace directory={directory} allLines={data.lines} key={`${selectedLine.jobOrderId ?? selectedLine.id}-${memberId}`} onEditJobPlanning={canPlan && selectedLine.jobOrderId ? () => { setJobEdit({ jobId: selectedLine.jobOrderId!, nonce: Date.now() }); setSelectedActivity(null); } : undefined} line={selectedLine} product={products.find((item) => item.id === selectedLine.productId)} onClose={() => setSelectedActivity(null)}
        orders={data.orders} route={route} format={selectedFormat} warnings={flow.filter((warning) => warning.lineIds.some((id) => routeLineIds.has(id)))} routeMachines={unitMachines} routeEntries={data.entries} transfers={data.transfers} visibleCalendarIds={allowedCalendars.map((item) => item.id)} canAssign={canAssign} canUpdate={canProduce} updating={activityUpdating} notice={activityNotice} onAssignMachine={assignMachine} onOpenLine={openActivity}
        jobOrders={data.jobOrders}>
        {(inRow, equivalence) => <ProductionUpdate key={selectedLine.id} previewYield={(quantity, uom, weighed) => stepYieldFor(selectedLine, quantity, uom, weighed)} lastShellWeightMg={lastShellWeight(selectedLine)} inRow={inRow} equivalence={equivalence} onCancel={() => setActivityUpdating(false)} line={selectedLine} outgoing={data.transfers.find((item) => item.sourceLineId === selectedLine.id)} incoming={awaitingReceipt(selectedLine, data.lines, data.transfers)} onReceive={receiveWip} uom={selectedLine.uom ?? products.find((product) => product.id === selectedLine.productId)?.uom ?? ""} directory={directory} editable={canProduce} nextCalendarId={nextCalendarId} onProgress={saveProgress} onComplete={completeProduction} onCorrect={correctProduction}
          machines={unitMachines.filter((machine) => machine.processIds?.includes(activityCalendar?.processId ?? "") && (machine.active === "Active" || data.entries.some((entry) => entry.planLineId === selectedLine.id && entry.machineId === machine.id)))}
          machineIds={bookedMachineIds(data.entries, selectedLine.id)}
          onSaved={(message) => { setActivityUpdating(false); setActivityNotice(`${selectedLine.activityType ?? "Activity"} ${formatDate(selectedLine.plannedDate)}: ${message}`); }} />}
      </ActivityWorkspace> : null}
      {activeTab === "master" ? canManage ? <>
        {!identity ? <div className="view-switch admin-main-tabs" aria-label="Setup area">{["Setup", "Sample data"].map((item) => <button key={item} type="button" aria-pressed={adminSection === item} onClick={() => setAdminSection(item)}>{item}</button>)}</div> : null}
        {adminSection === "Setup" || identity ? <CalendarAdmin uoms={<MeasurementAdmin usedUoms={[...products.map((item) => item.uom), ...data.orders.map((item) => item.uom), ...data.lines.map((item) => item.uom ?? ""), ...data.transfers.map((item) => item.uom), ...machines.map((item) => item.capacityUom ?? "")]} />} showPeople={!identity} directory={directory} onSave={saveDirectory} machines={machines} savedMachines={storedMachines} equipment={equipment} workCentres={workCentres} onMachine={saveMachine} onDeleteMachine={deleteMachine} onOpenCalendar={(unitId) => { setUnitSelection(unitId); setProcessSelection(null); setSelectedActivity(null); setActiveTab("planner"); }} /> : null}
        {adminSection === "Sample data" && !identity ? <SampleDataAdmin snapshot={snapshot} onApply={applySnapshot} onOpenCalendar={() => { setUnitSelection(directory.units.find((item) => item.id.startsWith("sample-"))?.id ?? ""); setProcessSelection(null); setSelectedActivity(null); setActiveTab("planner"); }} /> : null}
      </> : <section className="admin-access"><h2>Administrator access required</h2>{identity ? <p>Your Bio Tree role does not include scheduler master data. Ask your Bio Tree administrator if you need it.</p> : <><p>The current user is a {member.role}.</p><button type="button" className="primary-button" onClick={() => { const admin = directory.people.find((person) => person.role === "admin"); if (admin) { setMemberId(admin.id); setProcessSelection(null); } }}>Open administrator preview</button></>}</section> : null}
      {activeTab === "status" && (caps.viewTesting || caps.viewRelease) ? <StatusPanel jobOrders={data.jobOrders} orders={data.orders} products={products} lines={data.lines} transfers={data.transfers} directory={directory} onConfirmFormula={confirmFormula} yieldLimits={yieldLimits} onYieldLimits={saveYieldLimits}
        access={{ viewTesting: caps.viewTesting, passTesting: caps.passTesting, printTesting: caps.printTesting, viewRelease: caps.viewRelease, release: caps.release, printRelease: caps.printRelease }}
        section={statusSection} onSection={setStatusSection} onTest={testJob} onRelease={releaseJob} onReject={rejectJob} /> : null}
      {activeTab === "orders" && caps.viewOrders ? <OrdersPanel orders={data.orders} customers={data.customers} jobOrders={data.jobOrders} transfers={data.transfers} jobActions={{ canCreate: canCreateOrders, canEdit: canEditOrders, onCreate: addJobOrder, onUpdate: editJobOrder, onDelete: deleteJobOrder }} lines={data.lines} products={products} catalog={catalog} directory={directory} visibleCalendarIds={allowedCalendars.map((item) => item.id)} creatable={canCreateOrders} editable={canEditOrders} printable={caps.printOrders} userName={member.name} onSave={saveOrder} onAdd={addOrders} onDelete={deleteOrder} onClose={closePo} flow={flow} /> : null}
      {activeTab === "trials" && caps.viewOrders ? <OrdersPanel nonProduction orders={data.orders} customers={data.customers} jobOrders={data.jobOrders} transfers={data.transfers} jobActions={{ canCreate: canCreateOrders, canEdit: canEditOrders, onCreate: addJobOrder, onUpdate: editJobOrder, onDelete: deleteJobOrder }} lines={data.lines} products={products} catalog={catalog} directory={directory} visibleCalendarIds={allowedCalendars.map((item) => item.id)} creatable={canCreateOrders} editable={canEditOrders} printable={caps.printOrders} userName={member.name} onSave={saveOrder} onAdd={addOrders} onDelete={deleteOrder} onClose={closePo} flow={flow} /> : null}
      {activeTab === "audit" && caps.auditTrail ? <HistoryPanel refreshKey={activeTab} canDownload={caps.printAuditTrail} /> : null}
      {activeTab === "news" ? <ReleaseNotes releases={releases} /> : null}
      {activeTab === "reports" && calendar && caps.reports ? <>
        {filterControls}
        <ProductionActuals key={`${calendarId}-${memberId}-${visibleCalendars.map((item) => item.id).join("-")}`} lines={planLines} products={products} actuals={scope(data.actuals)} editable={canProduce} onSave={saveActual} />
        <details className="wip-reports"><summary>Incoming WIP ({scope(data.transfers).filter((item) => !item.receivedAt).length})</summary><WipInbox transfers={scope(data.transfers)} products={products} directory={directory} canReceive={canProduce} canPlan={canCreate} onReceive={receiveWip} onPlan={planWip} /></details>
        <ReportsPanel planLines={planLines} entries={entries} products={products} processName={(calendarId) => calendarProcessName(directory, calendarId)} machines={calendarMachines} />
      </> : null}
    </div>
  </main></YieldLimitsProvider>;
}
