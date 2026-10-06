"use client";

import { useEffect, useRef, useState } from "react";
import type Calendar from "@toast-ui/calendar";
import { ChevronLeft, ChevronRight, X, Plus, Printer, Download } from "lucide-react";
import { CalendarPrint, ListPrint } from "./CalendarPrint";
import { PlanningList } from "./PlanningList";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { priorities } from "@/lib/domain/types";
import type { PlanLine, Product, Machine, ScheduleEntry } from "@/lib/domain/types";
import { StatusBadge } from "./StatusBadge";
import { MeasurementFields } from "./MeasurementSettings";
import { readMeasurement } from "@/lib/services/measurements";
import { ORDER_COLORS, orderColor, orderNumbers, poLabel, type PurchaseOrder } from "@/lib/services/orders";
import { findJobByNumber, type JobOrder, type ManualJob } from "@/lib/services/jobOrders";

type View = "month" | "week" | "day";
const NO_ORDER = "#ffffff";
// A light fill of the order colour behind the event text.
const tint = (hex: string, amount = 0.12) => { const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)); return `rgb(${[r, g, b].map((value) => Math.round(255 - (255 - value) * amount)).join(", ")})`; };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

type NewActivity = Pick<PlanLine, "calendarId" | "productId" | "plannedDate" | "quantity" | "priority" | "notes" | "orderReference" | "uom" | "activityType" | "unitWeightMg" | "batchSizeKg" | "productionOrderId" | "jobOrderId"> & {
  // A job order number not known yet: created with the activity, for the PO item chosen.
  newJob?: ManualJob;
};
const dateKey = (value: { getFullYear(): number; getMonth(): number; getDate(): number }) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export default function PlanningCalendar({ orders = [], jobOrders = [], warnings, processNames, planningView = "calendar", planLines, products, initialDate, onCreate, onMove, canPlan = true, canCreate = canPlan, demo = true, onSelect, calendarTitle = "Production calendar", allPrintLines = planLines, entries = [], machines = [], calendars = [] }: {
  processNames: Record<string, string>;
  orders?: PurchaseOrder[];
  jobOrders?: JobOrder[];
  // Process-flow warnings by activity id, marked with ⚠ on the calendar and list.
  warnings?: Map<string, string[]>;
  planningView?: "calendar" | "list";
  calendars?: UnitCalendar[];
  calendarTitle?: string; allPrintLines?: PlanLine[]; entries?: ScheduleEntry[]; machines?: Machine[];
  planLines: PlanLine[]; products: Product[]; initialDate: string;
  // Returns an error to show, or nothing when the activity was added.
  onCreate: (activity: NewActivity) => string | void;
  onMove: (id: string, date: string) => string;
  canPlan?: boolean;
  // Adding needs Core's planning.create; moving needs planning.edit. Defaults to canPlan.
  canCreate?: boolean;
  demo?: boolean;
  onSelect?: (id: string) => void;
}) {
  const callbacks = useRef({ onCreate, onMove, canPlan, canCreate, onSelect });
  callbacks.current = { onCreate, onMove, canPlan, canCreate, onSelect };
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftDate, setDraftDate] = useState(initialDate);
  const [draftCalendar, setDraftCalendar] = useState("");
  // The job order number is keyed in. A known number fills in its product, PO, quantity and batch
  // reference; a new one is created with the activity once its PO item is chosen.
  const [jobText, setJobText] = useState("");
  const [newJobOrder, setNewJobOrder] = useState("");
  const [formError, setFormError] = useState("");
  const job = findJobByNumber(jobText, jobOrders);
  const draftJob = job?.id ?? "";
  const creatingJob = !job && !!jobText.trim();
  const jobOrder = orders.find((item) => item.id === (job ? job.orderId : creatingJob ? newJobOrder : ""));
  const [formVersion, setFormVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const hoverLine = planLines.find((line) => line.id === hover?.id);
  function openCreate(value: string, calendarId = "") {
    if (!callbacks.current.canCreate) return;
    setDraftCalendar(calendarId);
    setJobText(""); setNewJobOrder(""); setFormError("");
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
    const numbers = orderNumbers(orders);
    instance.createEvents(planLines.map((line) => {
      const item = products.find((entry) => entry.id === line.productId);
      const number = line.productionOrderId ? numbers.get(line.productionOrderId) : undefined;
      const color = number ? orderColor(number) : NO_ORDER;
      return {
        id: line.id, calendarId: "planning", category: "allday", isAllday: true,
        raw: { number, priority: line.priority, completed: !!line.completedAt, warn: warnings?.get(line.id)?.join("\n") },
        title: `${line.activityType ? `${line.activityType}: ` : ""}${item?.name ?? "Unknown product"} - ${line.quantity.toLocaleString()} ${line.uom ?? item?.uom ?? ""}`,
        start: line.plannedDate, end: line.plannedDate, isReadOnly: !canPlan || !!line.completedAt,
        color: "#1f2528", borderColor: color, backgroundColor: line.completedAt ? "#ecefed" : tint(color)
      };
    }));
    instance.setOptions({ isReadOnly: !canPlan && !canCreate });
  }, [ready, planLines, products, canPlan, canCreate, orders, warnings]);

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
            if (planningView === "list") buildListPdf({ title: calendarTitle, date, lines: allPrintLines, products, columns: calendars, orders }).save(`${fileName}-list-${date.slice(0, 7)}.pdf`);
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
        {canCreate ? <button className="primary-button" type="button" disabled={!ready || !products.length} onClick={() => openCreate(date)}><Plus size={17} />Add activity</button> : null}
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
    {planningView === "list" ? <PlanningList key={date.slice(0, 7)} date={date} lines={planLines} products={products} orders={orders} jobOrders={jobOrders} warnings={warnings} calendars={calendars} canPlan={canPlan} canCreate={canCreate} onMove={onMove} onSelect={(id) => { if (onSelect) onSelect(id); else setSelectedId(id); }} onCreate={openCreate} /> : null}
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
    <dialog ref={dialog} className="activity-dialog" onClose={() => { calendar.current?.clearGridSelections(); }}>
      <form key={formVersion} className="form-panel" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const quantity = Number(data.get("quantity"));
        const productId = String(data.get("product"));
        if (!Number.isFinite(quantity) || quantity <= 0 || !products.some((item) => item.id === productId)) return;
        // Every activity carries out a job order, which decides its product, PO and batch.
        if (!jobOrder || jobOrder.productId !== productId) { setFormError(creatingJob ? `Choose the PO item for job order ${jobText.trim()}.` : "Key in the job order number."); return; }
        // The process is the activity type: the process chosen above names it.
        const calendarId = String(data.get("calendar") ?? "");
        const measured = { ...readMeasurement(data), activityType: processNames[calendarId] ?? calendars.find((item) => item.id === calendarId)?.name ?? "" };
        const activity = { ...measured, calendarId: String(data.get("calendar") ?? ""), productId, plannedDate: String(data.get("date")), quantity, priority: String(data.get("priority")) as PlanLine["priority"], notes: String(data.get("notes") ?? ""), productionOrderId: jobOrder.id };
        const error = callbacks.current.onCreate(job ? { ...activity, orderReference: job.number, jobOrderId: job.id }
          : { ...activity, orderReference: jobText.trim(), newJob: { number: jobText.trim(), orderId: jobOrder.id, quantity, uom: measured.uom, ...(measured.batchSizeKg ? { batchSizeKg: measured.batchSizeKg } : {}) } });
        if (error) { setFormError(error); return; }
        setDate(String(data.get("date")));
        event.currentTarget.reset();
        dialog.current?.close();
        setNotice(creatingJob ? `Job order ${jobText.trim()} created and its activity added to the plan.` : "Activity added to the current team plan.");
      }}>
        <div className="panel-title"><h2>Add activity</h2><button className="icon-button" type="button" aria-label="Close activity form" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
        <label>Job order<input name="jobNumber" required maxLength={60} autoComplete="off" list="job-order-numbers" placeholder="Key in the job order number" value={jobText} onChange={(event) => { setJobText(event.target.value); setFormError(""); }} /></label>
        <datalist id="job-order-numbers">{jobOrders.map((item) => { const order = orders.find((entry) => entry.id === item.orderId); return <option key={item.id} value={item.number}>{[products.find((product) => product.id === order?.productId)?.name, `${item.quantity.toLocaleString()} ${item.uom}`, order?.poNumber, item.batchNumber ? `Batch no. ${item.batchNumber}` : ""].filter(Boolean).join(" · ")}</option>; })}</datalist>
        {creatingJob ? <>
          <p className="orders-help">New job order <strong>{jobText.trim()}</strong>: choose its PO item. It is created with this activity, for the quantity below.</p>
          <label>PO item<select required value={newJobOrder} onChange={(event) => { setNewJobOrder(event.target.value); setFormError(""); }}><option value="" disabled>Choose the PO item</option>{orders.map((item) => <option key={item.id} value={item.id}>{orderNumbers(orders).get(item.id)} · {poLabel(item, orders)}{item.customerName ? ` · ${item.customerName}` : ""} · {products.find((product) => product.id === item.productId)?.name ?? "Unknown product"}</option>)}</select></label>
        </> : null}
        <p className="orders-help">Product: <strong>{jobOrder ? products.find((product) => product.id === jobOrder.productId)?.name ?? "Unknown product" : "set by the job order"}</strong></p>
        <input type="hidden" name="product" value={jobOrder?.productId ?? ""} />
        <label>Process<select name="calendar" required defaultValue={draftCalendar || undefined}>{calendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Planned date<input name="date" type="date" required defaultValue={draftDate} /></label>
        <MeasurementFields key={`measure-${draftJob || newJobOrder}`} defaultQuantity={job?.quantity ?? products.find((product) => product.id === jobOrder?.productId)?.batchQuantity} defaultUom={job?.uom ?? jobOrder?.uom} />
        <label>Priority<select name="priority" defaultValue="Normal">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        {jobOrder ? <p className="orders-help">PO number: <strong>{poLabel(jobOrder, orders)}</strong>{jobOrder.customerName ? ` · ${jobOrder.customerName}` : ""}<br />Batch reference: <strong>{job?.number ?? jobText.trim()}</strong>{job?.batchNumber ? ` · Batch no. ${job.batchNumber}` : " · production keys in the batch number"}</p> : null}
        <label>Remarks<textarea name="notes" /></label>
        {formError ? <p role="alert">{formError}</p> : null}
        <button className="primary-button" type="submit" disabled={!jobOrder}><Plus size={17} />{creatingJob ? "Create job order and add" : "Add to plan"}</button>
      </form>
    </dialog>
    <div className="order-legend" aria-label="Legend">
      <span><span className="order-badge">1</span>Order number · tab colour</span>
      <span>{ORDER_COLORS.map((color, index) => <i key={color} className="order-legend-swatch" style={{ background: color }} title={`Orders ${index + 1}, ${index + 9}, ${index + 17}…`} />)} repeat every 8</span>
      <span><span className="priority-mark high">!</span>High</span><span><span className="priority-mark urgent">!</span>Urgent</span>
      <span><i className="order-legend-swatch no-order" />No PO linked</span><span>✓ Completed</span>
    </div>
    {ready && planningView === "list" ? <ListPrint title={calendarTitle} date={date} lines={allPrintLines} products={products} columns={calendars} orders={orders} /> : null}
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
