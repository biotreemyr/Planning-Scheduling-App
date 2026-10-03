"use client";

import { useEffect, useRef, useState } from "react";
import type Calendar from "@toast-ui/calendar";
import { ChevronLeft, ChevronRight, X, Plus, Printer, Download } from "lucide-react";
import { CalendarPrint, ListPrint } from "./CalendarPrint";
import { ProductSelect } from "./ProductSelect";
import { PlanningList } from "./PlanningList";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { priorities } from "@/lib/domain/types";
import type { PlanLine, Product, Machine, ScheduleEntry } from "@/lib/domain/types";
import { StatusBadge } from "./StatusBadge";
import { MeasurementFields } from "./MeasurementSettings";
import { readMeasurement } from "@/lib/services/measurements";
import type { PurchaseOrder } from "@/lib/services/orders";

type View = "month" | "week" | "day";
const colors = { Low: "#667078", Normal: "#28679e", High: "#9b6517", Urgent: "#b13a32" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

type NewActivity = Pick<PlanLine, "calendarId" | "productId" | "plannedDate" | "quantity" | "priority" | "notes" | "orderReference" | "uom" | "activityType" | "unitWeightMg" | "batchSizeKg" | "productionOrderId">;
const dateKey = (value: { getFullYear(): number; getMonth(): number; getDate(): number }) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export default function PlanningCalendar({ orders = [], processNames, planningView = "calendar", planLines, products, initialDate, onCreate, onMove, canPlan = true, onSelect, calendarTitle = "Production calendar", allPrintLines = planLines, entries = [], machines = [], calendars = [] }: {
  processNames: Record<string, string>;
  orders?: PurchaseOrder[];
  planningView?: "calendar" | "list";
  calendars?: UnitCalendar[];
  calendarTitle?: string; allPrintLines?: PlanLine[]; entries?: ScheduleEntry[]; machines?: Machine[];
  planLines: PlanLine[]; products: Product[]; initialDate: string;
  onCreate: (activity: NewActivity) => void;
  onMove: (id: string, date: string) => string;
  canPlan?: boolean;
  onSelect?: (id: string) => void;
}) {
  const callbacks = useRef({ onCreate, onMove, canPlan, onSelect });
  callbacks.current = { onCreate, onMove, canPlan, onSelect };
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftDate, setDraftDate] = useState(initialDate);
  const [draftCalendar, setDraftCalendar] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const hoverLine = planLines.find((line) => line.id === hover?.id);
  function openCreate(value: string, calendarId = "") {
    if (!callbacks.current.canPlan) return;
    setDraftCalendar(calendarId);
    setFormVersion((version) => version + 1);
    setHover(null);
    setDraftDate(value);
    dialog.current?.showModal();
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
        defaultView: "month", isReadOnly: !canPlan, usageStatistics: false,
        useDetailPopup: false, useFormPopup: false, gridSelection: { enableClick: true, enableDblClick: true },
        month: { startDayOfWeek: 1 },
        week: { startDayOfWeek: 1, taskView: false, eventView: ["allday"] },
        template: { allday: (event) => `<button type="button" class="calendar-plan-event" data-plan-id="${escapeHtml(event.id)}">${escapeHtml(event.title)}</button>` }
      });
      instance.on("selectDateTime", (info: { start: Date }) => { openCreate(dateKey(info.start)); instance?.clearGridSelections(); });
      instance.on("beforeUpdateEvent", (info) => {
        if (!info.changes.start) return;
        if (!callbacks.current.canPlan || info.event.isReadOnly) return;
        setHover(null);
        const start = info.changes.start;
        setNotice(callbacks.current.onMove(info.event.id, dateKey(typeof start === "string" || typeof start === "number" ? new Date(start) : start)));
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
    instance.createEvents(planLines.map((line) => {
      const item = products.find((entry) => entry.id === line.productId);
      return {
        id: line.id, calendarId: "planning", category: "allday", isAllday: true,
        title: `${line.completedAt ? "Completed: " : ""}${line.activityType ? `${line.activityType}: ` : ""}${item?.name ?? "Unknown product"} - ${line.quantity.toLocaleString()} ${line.uom ?? item?.uom ?? ""}`,
        start: line.plannedDate, end: line.plannedDate, isReadOnly: !canPlan || !!line.completedAt,
        color: colors[line.priority], borderColor: colors[line.priority], backgroundColor: "#f0f4f7"
      };
    }));
    instance.setOptions({ isReadOnly: !canPlan });
  }, [ready, planLines, products, canPlan]);

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
        <button type="button" className="icon-button" aria-label={`Print ${printName} / Save as PDF`} title={`Print ${printName} / Save as PDF`} disabled={!ready} onClick={() => window.print()}><Printer size={18} /></button>
        <button type="button" className="icon-button" aria-label={`Download ${printName} PDF`} title={`Download ${printName} PDF`} disabled={!ready || exporting} onClick={async () => {
          setExporting(true);
          try {
            const { buildCalendarPdf, buildListPdf } = await import("@/lib/services/calendarPdf");
            const fileName = calendarTitle.replace(/[^a-z0-9-]+/gi, "-");
            if (planningView === "list") buildListPdf({ title: calendarTitle, date, lines: allPrintLines, products, columns: calendars }).save(`${fileName}-list-${date.slice(0, 7)}.pdf`);
            else buildCalendarPdf({ title: calendarTitle, date, view: displayView, lines: allPrintLines, products, processNames }).save(`${fileName}-${displayView}-${date}.pdf`);
            setNotice(`${planningView === "list" ? "List" : "Calendar"} PDF downloaded.`);
          } catch { setNotice("PDF could not be generated. Please try again."); }
          finally { setExporting(false); }
        }}><Download size={18} /></button>
        <button type="button" className="icon-button" title="Previous period" aria-label="Previous period" disabled={!ready} onClick={() => navigate("prev")}><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" title="Next period" aria-label="Next period" disabled={!ready} onClick={() => navigate("next")}><ChevronRight size={18} /></button>
        <button type="button" className="calendar-button" disabled={!ready} onClick={() => navigate("today")}>Today</button>
        <h3 aria-live="polite">{range}</h3>
      </div>
      <div className="calendar-navigation">
        {canPlan ? <button className="primary-button" type="button" disabled={!ready || !products.length} onClick={() => openCreate(date)}><Plus size={17} />Add activity</button> : null}
        <input aria-label="Calendar date" type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
        {planningView === "calendar" ? <div className="view-switch" aria-label="Calendar period">
          {(["month", "week", "day"] as const).map((item) => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </div> : null}
      </div>
    </div>
    {failed ? <p role="alert">Calendar could not load. Refresh to retry.</p> : null}
    {!ready && !failed ? <p role="status">Loading calendar...</p> : null}
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    {!canPlan && planLines.some((line) => !line.completedAt) ? <p className="plan-grid-hint">Your role can view this plan but not move activities. Switch <strong>User</strong> to a planner or administrator to drag and drop.</p> : null}
    {planningView === "list" ? <PlanningList key={date.slice(0, 7)} date={date} lines={planLines} products={products} orders={orders} calendars={calendars} canPlan={canPlan} onMove={onMove} onSelect={(id) => { if (onSelect) onSelect(id); else setSelectedId(id); }} onCreate={openCreate} /> : null}
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
      {hoverLine.orderReference ? <p>{hoverLine.orderReference}</p> : null}
      {hoverLine.notes ? <p>{hoverLine.notes}</p> : null}
    </div> : null}
    <dialog ref={dialog} className="activity-dialog" onClose={() => { calendar.current?.clearGridSelections(); }}>
      <form key={formVersion} className="form-panel" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const quantity = Number(data.get("quantity"));
        const productId = String(data.get("product"));
        if (!Number.isFinite(quantity) || quantity <= 0 || !products.some((item) => item.id === productId)) return;
        callbacks.current.onCreate({ ...readMeasurement(data), calendarId: String(data.get("calendar") ?? ""), productId, plannedDate: String(data.get("date")), quantity, priority: String(data.get("priority")) as PlanLine["priority"], notes: String(data.get("notes") ?? ""), orderReference: String(data.get("order") ?? ""), productionOrderId: String(data.get("po") ?? "") || undefined });
        setDate(String(data.get("date")));
        event.currentTarget.reset();
        dialog.current?.close();
        setNotice("Activity added to the current team plan.");
      }}>
        <div className="panel-title"><h2>Add activity</h2><button className="icon-button" type="button" aria-label="Close activity form" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
        <ProductSelect products={products} />
        <label>Process<select name="calendar" required defaultValue={draftCalendar || undefined}>{calendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Planned date<input name="date" type="date" required defaultValue={draftDate} /></label>
        <MeasurementFields />
        <label>Priority<select name="priority" defaultValue="Normal">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        <label>PO number<select name="po" defaultValue=""><option value="">Not linked</option>{orders.map((item) => <option key={item.id} value={item.id}>{item.poNumber}{item.customerName ? ` · ${item.customerName}` : ""} · {products.find((product) => product.id === item.productId)?.name ?? "Unknown product"}</option>)}</select></label>
        <label>Batch / order reference<input name="order" placeholder="e.g. Batch 4" /></label>
        <label>Remarks<textarea name="notes" /></label>
        <button className="primary-button" type="submit"><Plus size={17} />Add to plan</button>
      </form>
    </dialog>
    {planningView === "calendar" ? <div className="calendar-legend">{Object.entries(colors).map(([priority, color]) => <span key={priority}><i style={{ background: color }} />{priority}</span>)}</div> : null}
    {ready && planningView === "list" ? <ListPrint title={calendarTitle} date={date} lines={allPrintLines} products={products} columns={calendars} /> : null}
    {ready && planningView === "calendar" ? <CalendarPrint title={calendarTitle} date={date} view={displayView} lines={allPrintLines} products={products} processNames={processNames} /> : null}
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
