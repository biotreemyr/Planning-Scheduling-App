"use client";

import { useEffect, useRef, useState } from "react";
import type Calendar from "@toast-ui/calendar";
import { ChevronLeft, ChevronRight, X, Plus, Printer, Download, FileSpreadsheet } from "lucide-react";
import { CalendarPrint, ListPrint } from "./CalendarPrint";
import { PlanningList } from "./PlanningList";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { priorities } from "@/lib/domain/types";
import type { PlanLine, Product, Machine, ScheduleEntry } from "@/lib/domain/types";
import { StatusBadge } from "./StatusBadge";
import { ORDER_COLORS, orderColor, orderNumbers, poLabel, type PurchaseOrder } from "@/lib/services/orders";
import { activityFacts, type JobOrder } from "@/lib/services/jobOrders";
import { lineEnd } from "@/lib/services/scheduling";
import type { ProcessSettings } from "@/lib/services/processSetup";
import { JobPlanDialog, type JobPlan, type PlanRequest } from "./JobPlanDialog";

type View = "month" | "week" | "day";
const NO_ORDER = "#ffffff";
// A light fill of the order colour behind the event text.
const tint = (hex: string, amount = 0.12) => { const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)); return `rgb(${[r, g, b].map((value) => Math.round(255 - (255 - value) * amount)).join(", ")})`; };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

const dateKey = (value: { getFullYear(): number; getMonth(): number; getDate(): number }) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export default function PlanningCalendar({ processSettings = {}, canPrint = true, orders = [], jobOrders = [], allLines, editJobRequest, warnings, processNames, planningView = "calendar", planLines, products, initialDate, onPlanJob, onMove, onResize, canPlan = true, canCreate = canPlan, demo = true, onSelect, calendarTitle = "Production calendar", allPrintLines = planLines, entries = [], machines = [], calendars = [] }: {
  processNames: Record<string, string>;
  processSettings?: Record<string, ProcessSettings>;
  // Core's "Print planner board": print, PDF and Excel.
  canPrint?: boolean;
  orders?: PurchaseOrder[];
  jobOrders?: JobOrder[];
  // Process-flow warnings by activity id, marked with ⚠ on the calendar and list.
  warnings?: Map<string, string[]>;
  planningView?: "calendar" | "list";
  calendars?: UnitCalendar[];
  calendarTitle?: string; allPrintLines?: PlanLine[]; entries?: ScheduleEntry[]; machines?: Machine[];
  planLines: PlanLine[]; products: Product[]; initialDate: string;
  // Every activity, to tell planned job orders from ones still to plan.
  allLines?: PlanLine[];
  // Opens the plan form for a job order: "edit" from the activity panel's "Edit job order planning",
  // "new" from the waiting job orders' Plan button.
  editJobRequest?: { jobId: string; nonce: number; mode?: "new" | "edit"; date?: string } | null;
  onPlanJob: (plan: JobPlan, mode: "new" | "edit") => { error: string } | { message: string };
  onMove: (id: string, date: string) => string;
  // Dragging an activity's right edge to a later day makes it run until then.
  onResize?: (id: string, endDate: string) => string;
  canPlan?: boolean;
  // Adding needs Core's planning.create; moving needs planning.edit. Defaults to canPlan.
  canCreate?: boolean;
  demo?: boolean;
  onSelect?: (id: string) => void;
}) {
  const callbacks = useRef({ onMove, onResize, canPlan, canCreate, onSelect });
  callbacks.current = { onMove, onResize, canPlan, canCreate, onSelect };
  // Planning happens per job order, in one form for its whole route.
  const [planRequest, setPlanRequest] = useState<PlanRequest | null>(null);
  useEffect(() => {
    if (!editJobRequest) return;
    setPlanRequest(editJobRequest.mode === "new" ? { mode: "new", jobId: editJobRequest.jobId, date: editJobRequest.date ?? dateKey(new Date()), nonce: editJobRequest.nonce } : { mode: "edit", jobId: editJobRequest.jobId, nonce: editJobRequest.nonce });
  }, [editJobRequest]);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const hoverLine = planLines.find((line) => line.id === hover?.id);
  function openCreate(value: string) {
    if (!callbacks.current.canCreate) return;
    setHover(null);
    setPlanRequest({ mode: "new", date: value, nonce: Date.now() });
  }
  function preview(target: HTMLElement) {
    const event = target.closest<HTMLElement>("[data-plan-id]");
    if (!event) { setHover(null); return; }
    const rect = event.getBoundingClientRect();
    setHover({ id: event.dataset.planId!, left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)), top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 270)) });
  }
  const host = useRef<HTMLDivElement>(null);
  const calendar = useRef<Calendar | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("month");
  const displayView = planningView === "list" ? "month" : view;
  const printName = planningView === "list" ? "list" : "calendar";
  const [date, setDate] = useState(initialDate);
  const [range, setRange] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = planLines.find((line) => line.id === selectedId);
  const product = products.find((item) => item.id === selected?.productId);

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setView("day");
    let disposed = false;
    let instance: Calendar | undefined;
    let observer: ResizeObserver | undefined;
    import("@toast-ui/calendar").then(({ default: CalendarImpl }) => {
      if (disposed || !host.current) return;
      instance = new CalendarImpl(host.current, {
        defaultView: "month", isReadOnly: !canPlan && !canCreate, usageStatistics: false,
        useDetailPopup: false, useFormPopup: false, gridSelection: { enableClick: true, enableDblClick: true },
        month: { startDayOfWeek: 1 },
        week: { startDayOfWeek: 1, taskView: false, eventView: ["allday"] },
        template: { allday: (event) => {
          const { number, priority, completed, warn } = (event.raw ?? {}) as { number?: number; priority?: string; completed?: boolean; warn?: string };
          const badge = number ? `<span class="order-badge">${number}</span>` : "";
          const mark = priority === "High" || priority === "Urgent" ? `<span class="priority-mark ${priority.toLowerCase()}" title="${priority} priority">!</span>` : "";
          return `<button type="button" class="calendar-plan-event${number ? "" : " no-order"}" data-plan-id="${escapeHtml(event.id)}">${badge}${mark}${warn ? `<span class="flow-mark" title="${escapeHtml(warn)}">⚠</span>` : ""}${completed ? "✓ " : ""}${escapeHtml(event.title)}</button>`;
        } }
      });
      instance.on("selectDateTime", (info: { start: Date }) => { openCreate(dateKey(info.start)); instance?.clearGridSelections(); });
      instance.on("beforeUpdateEvent", (info) => {
        if (!callbacks.current.canPlan || info.event.isReadOnly) return;
        const day = (value: unknown) => dateKey(typeof value === "string" || typeof value === "number" ? new Date(value) : value as Date);
        setHover(null);
        // Dragging the whole box moves it (keeping its length); dragging its edge changes its last day.
        if (info.changes.start) setNotice(callbacks.current.onMove(info.event.id, day(info.changes.start)));
        else if (info.changes.end && callbacks.current.onResize) setNotice(callbacks.current.onResize(info.event.id, day(info.changes.end)));
      });
      instance.on("clickEvent", ({ event }: { event: { id: string } }) => { setHover(null); if (callbacks.current.onSelect) callbacks.current.onSelect(event.id); else setSelectedId(event.id); });
      calendar.current = instance;
      observer = new ResizeObserver(() => instance?.render());
      observer.observe(host.current);
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; observer?.disconnect(); instance?.destroy(); calendar.current = null; };
  }, []);

  useEffect(() => {
    const instance = calendar.current;
    if (!ready || !instance) return;
    instance.clear();
    const numbers = orderNumbers(orders);
    instance.createEvents(planLines.map((line) => {
      const item = products.find((entry) => entry.id === line.productId);
      const number = line.productionOrderId ? numbers.get(line.productionOrderId) : undefined;
      const color = number ? orderColor(number) : NO_ORDER;
      return {
        id: line.id, calendarId: "planning", category: "allday", isAllday: true,
        raw: { number, priority: line.priority, completed: !!line.completedAt, warn: warnings?.get(line.id)?.join("\n") },
        // Process, then product, batch number, job order number and this process's quantity (actual once done).
        title: (() => { const facts = activityFacts(line, jobOrders, item?.uom); return `${line.activityType ? `${line.activityType}: ` : ""}${[item?.name ?? "Unknown product", facts.batchNumber, facts.jobNumber, facts.quantity].filter(Boolean).join(" · ")}`; })(),
        start: line.plannedDate, end: lineEnd(line), isReadOnly: !canPlan || !!line.completedAt,
        color: "#1f2528", borderColor: color, backgroundColor: line.completedAt ? "#ecefed" : tint(color)
      };
    }));
    instance.setOptions({ isReadOnly: !canPlan && !canCreate });
  }, [ready, planLines, products, canPlan, canCreate, orders, jobOrders, warnings]);

  useEffect(() => {
    const instance = calendar.current;
    if (!ready || !instance) return;
    instance.setDate(date);
    instance.changeView(displayView);
    const format = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
    const displayDate = (value: Date) => format.format(value).replaceAll("/", "-");
    setRange(displayView === "month"
      ? new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(new Date(`${date}T12:00`))
      : displayView === "day" ? displayDate(instance.getDateRangeStart().toDate())
      : `${displayDate(instance.getDateRangeStart().toDate())} - ${displayDate(instance.getDateRangeEnd().toDate())}`);
  }, [ready, displayView, date]);

  function navigate(direction: "prev" | "next" | "today") {
    const instance = calendar.current;
    if (!instance) return;
    instance[direction]();
    const current = instance.getDate();
    setDate(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
  }

  return <div className="planning-calendar" onMouseLeave={() => setHover(null)} onKeyDown={(event) => { if (event.key === "Escape") setHover(null); }}>
    <div className="calendar-toolbar">
      <div className="calendar-navigation">
        {canPrint ? <>
        <button type="button" className="icon-button" aria-label={`Print ${printName} / Save as PDF`} title={`Print ${printName} / Save as PDF`} disabled={!ready} onClick={() => window.print()}><Printer size={18} /></button>
        <button type="button" className="icon-button" aria-label={`Download ${printName} PDF`} title={`Download ${printName} PDF`} disabled={!ready || exporting} onClick={async () => {
          setExporting(true);
          try {
            const { buildCalendarPdf, buildListPdf } = await import("@/lib/services/calendarPdf");
            const fileName = calendarTitle.replace(/[^a-z0-9-]+/gi, "-");
            if (planningView === "list") buildListPdf({ title: calendarTitle, date, lines: allPrintLines, products, columns: calendars, orders, jobOrders }).save(`${fileName}-list-${date.slice(0, 7)}.pdf`);
            else buildCalendarPdf({ title: calendarTitle, date, view: displayView, lines: allPrintLines, products, processNames, orders, jobOrders }).save(`${fileName}-${displayView}-${date}.pdf`);
            setNotice(`${planningView === "list" ? "List" : "Calendar"} PDF downloaded.`);
          } catch { setNotice("PDF could not be generated. Please try again."); }
          finally { setExporting(false); }
        }}><Download size={18} /></button>
        <button type="button" className="icon-button" aria-label={`Download ${printName} Excel`} title={`Download ${printName} Excel`} disabled={!ready || exporting} onClick={async () => {
          setExporting(true);
          try {
            const [{ buildCalendarWorkbook, buildListWorkbook, downloadWorkbook }, excel] = await Promise.all([import("@/lib/services/calendarExcel"), import("exceljs")]);
            const module = (excel as unknown as { default?: typeof excel }).default ?? excel;
            const fileName = calendarTitle.replace(/[^a-z0-9-]+/gi, "-");
            if (planningView === "list") await downloadWorkbook(buildListWorkbook(module, { title: calendarTitle, date, lines: allPrintLines, products, columns: calendars, orders, jobOrders }), `${fileName}-list-${date.slice(0, 7)}.xlsx`);
            else await downloadWorkbook(buildCalendarWorkbook(module, { title: calendarTitle, date, view: displayView, lines: allPrintLines, products, processNames, orders, jobOrders }), `${fileName}-${displayView}-${date}.xlsx`);
            setNotice(`${planningView === "list" ? "List" : "Calendar"} Excel downloaded.`);
          } catch { setNotice("Excel could not be generated. Please try again."); }
          finally { setExporting(false); }
        }}><FileSpreadsheet size={18} /></button>
        </> : null}
        <button type="button" className="icon-button" title="Previous period" aria-label="Previous period" disabled={!ready} onClick={() => navigate("prev")}><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" title="Next period" aria-label="Next period" disabled={!ready} onClick={() => navigate("next")}><ChevronRight size={18} /></button>
        <button type="button" className="calendar-button" disabled={!ready} onClick={() => navigate("today")}>Today</button>
        <h3 aria-live="polite">{range}</h3>
      </div>
      <div className="calendar-navigation">
        {canCreate ? <button className="primary-button" type="button" disabled={!ready || !products.length} onClick={() => openCreate(date)}><Plus size={17} />Production Planning</button> : null}
        <input aria-label="Calendar date" type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
        {planningView === "calendar" ? <div className="view-switch" aria-label="Calendar period">
          {(["month", "week", "day"] as const).map((item) => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </div> : null}
      </div>
    </div>
    {failed ? <p role="alert">Calendar could not load. Refresh to retry.</p> : null}
    {!ready && !failed ? <p role="status">Loading calendar...</p> : null}
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    {!canPlan && planLines.some((line) => !line.completedAt) ? <p className="plan-grid-hint">Your role can view this plan but not move activities.{demo ? <> Switch <strong>User</strong> to a planner or administrator to drag and drop.</> : " Ask your Bio Tree administrator for planning access if you need it."}</p> : null}
    {planningView === "list" ? <PlanningList key={date.slice(0, 7)} date={date} lines={planLines} products={products} orders={orders} jobOrders={jobOrders} warnings={warnings} calendars={calendars} canPlan={canPlan} canCreate={canCreate} onResize={onResize} onMove={onMove} onSelect={(id) => { if (onSelect) onSelect(id); else setSelectedId(id); }} onCreate={openCreate} /> : null}
    <div hidden={planningView === "list"} className="calendar-scroll" onScroll={() => setHover(null)}><div ref={host} className="calendar-host" onMouseOver={(event) => { if (!event.buttons) preview(event.target as HTMLElement); }} onMouseDown={() => setHover(null)} onFocus={(event) => preview(event.target as HTMLElement)} onBlur={() => setHover(null)} onClick={(event) => {
      const target = event.target as HTMLElement;
      const id = target.closest<HTMLElement>("[data-plan-id]")?.dataset.planId;
      if (id) { setHover(null); if (onSelect) onSelect(id); else setSelectedId(id); }
    }} /></div>
    {hover && hoverLine ? <div role="tooltip" className="activity-preview" style={{ left: hover.left, top: hover.top }}>
      <h3>{products.find((item) => item.id === hoverLine.productId)?.name}</h3>
      <p>{hoverLine.plannedDate.split("-").reverse().join("-")} · {hoverLine.quantity.toLocaleString()} {hoverLine.uom ?? products.find((item) => item.id === hoverLine.productId)?.uom}</p>
      <p>{hoverLine.activityType}{hoverLine.batchSizeKg !== undefined ? ` · ${hoverLine.batchSizeKg} kg equivalent` : ""}</p>
      <div className="record-meta"><StatusBadge value={hoverLine.priority} /><StatusBadge value={hoverLine.completedAt ? "Completed" : hoverLine.status} /></div>
      {hoverLine.orderReference ? <p>{hoverLine.orderReference}{(() => { const batch = jobOrders.find((item) => item.id === hoverLine.jobOrderId)?.batchNumber; return batch ? ` · Batch no. ${batch}` : ""; })()}</p> : null}
      {hoverLine.notes ? <p>{hoverLine.notes}</p> : null}
    </div> : null}
    <JobPlanDialog request={planRequest} jobOrders={jobOrders} orders={orders} products={products} calendars={calendars} processNames={processNames} processSettings={processSettings} lines={allLines ?? allPrintLines} machines={machines} entries={entries}
      onPlan={onPlanJob} onDone={(message, firstDate) => { calendar.current?.clearGridSelections(); setNotice(message); if (firstDate) setDate(firstDate); }} />
    <div className="order-legend" aria-label="Legend">
      <span><span className="order-badge">1</span>Order number · tab colour</span>
      <span>{ORDER_COLORS.map((color, index) => <i key={color} className="order-legend-swatch" style={{ background: color }} title={`Orders ${index + 1}, ${index + 9}, ${index + 17}…`} />)} repeat every 8</span>
      <span><span className="priority-mark high">!</span>High</span><span><span className="priority-mark urgent">!</span>Urgent</span>
      <span><i className="order-legend-swatch no-order" />No PO linked</span><span>✓ Completed</span>
    </div>
    {ready && planningView === "list" ? <ListPrint title={calendarTitle} date={date} lines={allPrintLines} products={products} columns={calendars} orders={orders} jobOrders={jobOrders} /> : null}
    {ready && planningView === "calendar" ? <CalendarPrint title={calendarTitle} date={date} view={displayView} lines={allPrintLines} products={products} processNames={processNames} orders={orders} jobOrders={jobOrders} /> : null}
    {selected ? <section className="calendar-detail" aria-label="Plan line details">
      <button type="button" className="icon-button detail-close" aria-label="Close plan details" title="Close plan details" onClick={() => setSelectedId(null)}><X size={18} /></button>
      <h3>{product?.name ?? "Unknown product"}</h3>
      <p>{selected.plannedDate.split("-").reverse().join("-")} · {selected.quantity.toLocaleString()} {selected.uom ?? product?.uom} {selected.orderReference ? `· ${selected.orderReference}` : ""}</p>
      <p>{selected.activityType}{selected.unitWeightMg !== undefined ? ` · ${selected.unitWeightMg} mg per unit` : ""}{selected.batchSizeKg !== undefined ? ` · ${selected.batchSizeKg} kg equivalent` : ""}</p>
      <div className="record-meta"><StatusBadge value={selected.priority} /><StatusBadge value={selected.status} /></div>
      {selected.notes ? <p>{selected.notes}</p> : null}
    </section> : null}
  </div>;
}
