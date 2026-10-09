"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, GripVertical, Plus } from "lucide-react";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import { localDateKey } from "@/lib/services/calendarPrint";
import { canMovePlan, monthDates } from "@/lib/services/planningMonth";
import { orderColor, orderNumbers, type PurchaseOrder } from "@/lib/services/orders";
import { OrderBadge, PriorityMark } from "./OrderBadge";
import { activityFacts, type JobOrder } from "@/lib/services/jobOrders";
import { daysBetween, lineDays, lineEnd } from "@/lib/services/scheduling";

type Target = { date: string; calendarId: string };
// kind "resize": dragging the card's bottom edge to the activity's last planned day.
type Drag = { id: string; calendarId: string; label: string; pointerId: number; startX: number; startY: number; x: number; y: number; started: boolean; touch: boolean; kind: "move" | "resize" };
const DRAG_THRESHOLD = 5;
// A finger held this long on a card picks it up; a quicker swipe still scrolls the grid.
const LONG_PRESS_MS = 350;
const LONG_PRESS_SLOP = 8;
const EDGE = 56;

// Month grid: dates down the side, one column per process, like the planning spreadsheet.
export function PlanningList({ date, lines, products, orders = [], jobOrders = [], warnings, calendars, canPlan, canCreate = canPlan, onMove, onResize, onSelect, onCreate }: {
  date: string; lines: PlanLine[]; products: Product[]; orders?: PurchaseOrder[]; jobOrders?: JobOrder[]; warnings?: Map<string, string[]>; calendars: UnitCalendar[]; canPlan: boolean; canCreate?: boolean;
  onMove: (id: string, date: string) => string; onSelect: (id: string) => void; onCreate: (date: string, calendarId: string) => void;
  // Dragging a card's bottom edge down its column sets the activity's last day.
  onResize?: (id: string, endDate: string) => string;
}) {
  const dates = monthDates(date);
  const numbers = orderNumbers(orders);
  const today = localDateKey(new Date());
  // Keyboard moves and pointer drags share the highlighted target; target is null over a cell that cannot accept the drop.
  const [moving, setMoving] = useState<{ id: string; target: Target | null; kind?: "move" | "resize" } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const [notice, setNotice] = useState("");
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suppressClick = useRef(false);
  const label = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", options);

  function finish(id: string, target: Target | null) {
    const line = lines.find((item) => item.id === id);
    if (target && canMovePlan(line, canPlan) && dates.includes(target.date) && line!.calendarId === target.calendarId && line!.plannedDate !== target.date) {
      setNotice(onMove(id, target.date));
    }
    setMoving(null);
  }
  // The cell under the pointer, accepted only in the activity's own process column.
  function locate(current: Drag) {
    const cell = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("td[data-cell-date]");
    if (!cell || !scroller.current?.contains(cell)) return { target: null, otherColumn: false };
    const target = { date: cell.dataset.cellDate!, calendarId: cell.dataset.cellCalendar! };
    return target.calendarId === current.calendarId ? { target, otherColumn: false } : { target: null, otherColumn: true };
  }
  function track() {
    const current = drag.current;
    if (!current) setMoving(null);
    else setMoving({ id: current.id, target: locate(current).target, kind: current.kind });
  }
  // A resize ends on a day on or after the activity's first day, in its own column.
  function finishResize(id: string, target: Target | null) {
    const line = lines.find((item) => item.id === id);
    if (target && onResize && line && canMovePlan(line, canPlan) && line.calendarId === target.calendarId) {
      if (target.date < line.plannedDate) setNotice("An activity cannot end before the day it starts. Drag the edge down to a later day.");
      else if (target.date !== lineEnd(line)) setNotice(onResize(id, target.date));
    }
    setMoving(null);
  }
  // Scroll the grid while the pointer rests near the visible edges of the grid.
  function autoScroll() {
    const current = drag.current;
    const box = scroller.current;
    if (!current?.started || !box) return;
    const rect = box.getBoundingClientRect();
    const top = Math.max(rect.top, 0), bottom = Math.min(rect.bottom, window.innerHeight);
    const left = Math.max(rect.left, 0), right = Math.min(rect.right, window.innerWidth);
    const speed = (distance: number) => Math.ceil(Math.max(0, EDGE - distance) / 3);
    const dy = speed(bottom - current.y) - speed(current.y - top);
    const dx = speed(right - current.x) - speed(current.x - left);
    if (dx || dy) { box.scrollBy(dx, dy); track(); }
  }
  function begin(current: Drag) {
    current.started = true;
    clearInterval(timer.current);
    timer.current = setInterval(() => handlers.current.autoScroll(), 16);
    setGhost({ x: current.x, y: current.y, label: current.label });
    track();
  }
  // Moves and the release are heard on the window, not the card: the card re-renders while it is
  // dragged, and pointer capture is dropped by some browsers, so listening on it lost the drop.
  function windowMove(event: PointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    const travelled = Math.hypot(current.x - current.startX, current.y - current.startY);
    if (!current.started) {
      // A touch that moves before the long press is a scroll; let the browser have it.
      if (current.touch) { if (travelled > LONG_PRESS_SLOP) cancelDrag(); return; }
      if (travelled < DRAG_THRESHOLD) return;
      begin(current);
      return;
    }
    event.preventDefault();
    setGhost({ x: current.x, y: current.y, label: current.label });
    track();
  }
  function windowUp(event: PointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.started) { cancelDrag(); return; }
    current.x = event.clientX; current.y = event.clientY;
    // The release also produces a click on the activity; skip opening it.
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const { target, otherColumn } = locate(current);
    if (otherColumn) setNotice(current.kind === "resize" ? "Stretch an activity down its own process column." : "Activities stay in their process. Drop it on a date in the same column.");
    cancelDrag();
    if (current.kind === "resize") finishResize(current.id, target); else finish(current.id, target);
  }
  // While a finger drags a card the page must not scroll under it.
  function windowTouchMove(event: TouchEvent) { if (drag.current?.started) event.preventDefault(); }
  // Listeners outlive renders, so they always call the latest handlers.
  const handlers = useRef({ windowMove, windowUp, autoScroll, windowTouchMove });
  handlers.current = { windowMove, windowUp, autoScroll, windowTouchMove };
  const listeners = useRef({
    move: (event: PointerEvent) => handlers.current.windowMove(event),
    up: (event: PointerEvent) => handlers.current.windowUp(event),
    cancel: () => cancelDrag(),
    touch: (event: TouchEvent) => handlers.current.windowTouchMove(event)
  });
  function listen(on: boolean) {
    const method = on ? "addEventListener" : "removeEventListener";
    const { move, up, cancel, touch } = listeners.current;
    window[method]("pointermove", move as EventListener);
    window[method]("pointerup", up as EventListener);
    window[method]("pointercancel", cancel);
    if (on) window.addEventListener("touchmove", touch, { passive: false }); else window.removeEventListener("touchmove", touch);
  }
  function cancelDrag() {
    clearInterval(timer.current); clearTimeout(press.current);
    listen(false);
    drag.current = null; setGhost(null); setMoving(null);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>, line: PlanLine, name: string) {
    if (event.button !== 0 || moving || drag.current) return;
    if (!canMovePlan(line, canPlan)) {
      if (line.completedAt) setNotice(`${name} is completed, so it is locked and cannot be moved.`);
      return;
    }
    // Mouse and pen pick the card up on movement; a finger picks it up from the grip at once, or by holding the card.
    const resize = !!(event.target as HTMLElement).closest(".plan-list-resize");
    const grip = resize || !!(event.target as HTMLElement).closest(".plan-list-grip");
    const touch = event.pointerType === "touch" && !grip;
    const current: Drag = { id: line.id, calendarId: line.calendarId!, label: name, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false, touch, kind: resize ? "resize" : "move" };
    drag.current = current;
    listen(true);
    if (event.pointerType === "touch" && grip) begin(current);
    if (touch) press.current = setTimeout(() => { if (drag.current === current) { navigator.vibrate?.(15); begin(current); } }, LONG_PRESS_MS);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) cancelDrag(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); cancelDrag(); };
  }, []);

  // Without processes the month still shows, with one empty column.
  const columns = calendars.length ? calendars : [{ id: "", unitId: "", processId: "", name: "No processes to show" }];
  const dragging = moving && ghost ? lines.find((line) => line.id === moving.id) : undefined;
  return <div className={`monthly-plan-list${dragging ? " plan-grid-dragging" : ""}`}>
    <p className="sr-only" id="list-move-help">Drag an activity to another date in its column; on a touch screen, drag the handle or hold the card first. With the keyboard, press Space on the handle, arrow up or down to choose a date, Enter to move, or Escape to cancel.</p>
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    <span className="sr-only" role="status">{moving?.target ? `Moving activity to ${moving.target.date}` : ""}</span>
    <div className="plan-grid-scroll" ref={scroller}>
      <table className="plan-grid" aria-label="Planned activities by date and process" style={{ minWidth: 112 + columns.length * 190 }}>
        <colgroup><col className="plan-grid-date-column" />{columns.map((item) => <col key={item.id} />)}</colgroup>
        <thead>
          <tr><th scope="col" rowSpan={2} className="plan-grid-corner">Date</th><th scope="colgroup" colSpan={columns.length}>Process</th></tr>
          <tr>{columns.map((item) => <th scope="col" key={item.id}>{item.name}</th>)}</tr>
        </thead>
        <tbody>{dates.map((day) => {
          const weekday = new Date(`${day}T12:00:00`).getDay();
          return <tr key={day} data-list-date={day} className={[day === today ? "plan-grid-today" : "", weekday === 0 || weekday === 6 ? "plan-grid-weekend" : ""].join(" ").trim() || undefined}>
            <th scope="row"><time dateTime={day}>{label(day, { day: "2-digit", month: "short" })}<small>{label(day, { weekday: "short" })}</small></time></th>
            {columns.map((calendar) => {
              const target = { date: day, calendarId: calendar.id };
              const isTarget = moving?.target?.date === day && moving.target.calendarId === calendar.id;
              const droppable = dragging?.calendarId === calendar.id;
              // While stretching, every day from the first to the one under the pointer is highlighted.
              const inRange = moving?.kind === "resize" && dragging && moving.target && dragging.calendarId === calendar.id && day >= dragging.plannedDate && day <= moving.target.date;
              return <td key={calendar.id} data-cell-date={day} data-cell-calendar={calendar.id} className={[isTarget ? "plan-list-drop-target" : "", droppable ? "plan-grid-droppable" : "", inRange ? "plan-list-resize-range" : ""].join(" ").trim() || undefined}>
                <div className="plan-grid-cell">
                  {/* The later days of activities that run over several days. */}
                  {lines.filter((line) => line.calendarId === calendar.id && line.plannedDate < day && lineEnd(line) >= day).map((line) => {
                    const order = orders.find((item) => item.id === line.productionOrderId);
                    const number = order ? numbers.get(order.id) : undefined;
                    const name = products.find((item) => item.id === line.productId)?.name ?? "Unknown product";
                    const facts = activityFacts(line, jobOrders);
                    return <div key={`${line.id}-${day}`} className={`plan-grid-item plan-grid-continued${number ? "" : " no-order"}${line.completedAt ? " completed" : ""}`} style={number ? { "--order-color": orderColor(number) } as React.CSSProperties : undefined}
                      onPointerDown={(event) => { if (lineEnd(line) === day && (event.target as HTMLElement).closest(".plan-list-resize")) pointerDown(event, line, name); }}>
                      <button className="plan-list-product" type="button" title={`${name} · ${facts.jobNumber} · day ${daysBetween(line.plannedDate, day) + 1} of ${lineDays(line)}`} onClick={() => { if (!suppressClick.current) onSelect(line.id); }}>
                        <small>↳ {name}{facts.jobNumber ? ` · ${facts.jobNumber}` : ""} · day {daysBetween(line.plannedDate, day) + 1} of {lineDays(line)}</small>
                      </button>
                      {lineEnd(line) === day && canMovePlan(line, canPlan) && onResize ? <span className="plan-list-resize" role="presentation" title={`Drag to change the last day of ${name}`} /> : null}
                    </div>;
                  })}
                  {lines.filter((line) => line.plannedDate === day && line.calendarId === calendar.id).map((line) => {
                    const product = products.find((item) => item.id === line.productId);
                    const name = product?.name ?? "Unknown product";
                    const movable = canMovePlan(line, canPlan);
                    const order = orders.find((item) => item.id === line.productionOrderId);
                    const number = order ? numbers.get(order.id) : undefined;
                    const job = jobOrders.find((item) => item.id === line.jobOrderId);
                    // Easy to read at a glance: product, then batch number and job order number, then this
                    // process's quantity in its own unit (the actual once production completed it).
                    const facts = activityFacts(line, jobOrders, product?.uom);
                    const batch = [facts.batchNumber, facts.jobNumber].filter(Boolean).join(" · ");
                    // A several-day activity shows its days: "3 days, to 10 Oct".
                    const detail = line.endDate && line.endDate > line.plannedDate ? `${facts.quantity} · ${lineDays(line)} days, to ${new Date(`${line.endDate}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : facts.quantity;
                    return <div key={line.id} data-movable={movable || undefined} className={`plan-grid-item${number ? "" : " no-order"}${line.completedAt ? " completed" : ""}${dragging?.id === line.id ? " is-dragging" : ""}`}
                      style={number ? { "--order-color": orderColor(number) } as React.CSSProperties : undefined}
                      onPointerDown={(event) => pointerDown(event, line, name)} onContextMenu={(event) => { if (drag.current?.touch) event.preventDefault(); }}>
                      {movable ? <button type="button" className="icon-button plan-list-grip" title={`Move ${name}`} aria-label={`Move ${name}`} aria-describedby="list-move-help"
                        onKeyDown={(event) => {
                          if (event.key === " " && !moving) { event.preventDefault(); setMoving({ id: line.id, target }); }
                          else if (moving?.id === line.id && moving.target && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const index = dates.indexOf(moving.target.date); setMoving({ id: line.id, target: { ...moving.target, date: dates[Math.max(0, Math.min(dates.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))] } }); }
                          else if (moving?.id === line.id && event.key === "Enter") { event.preventDefault(); finish(line.id, moving.target); }
                          else if (event.key === "Escape") setMoving(null);
                        }}><GripVertical size={14} /></button> : null}
                      <button className="plan-list-product" type="button" title={`${line.completedAt ? "Completed: " : ""}${name}\n${batch}\n${detail}${order ? `\nPO ${order.poNumber}` : ""}${warnings?.get(line.id) ? `\n⚠ ${warnings.get(line.id)!.join("\n⚠ ")}` : ""}`} onClick={() => { if (!suppressClick.current) onSelect(line.id); }}>
                        <strong><OrderBadge number={number} poNumber={order?.poNumber} /><PriorityMark priority={line.priority} />{warnings?.get(line.id) ? <span className="flow-mark" aria-label="Process-flow warning">⚠</span> : null}{line.completedAt ? <CheckCircle2 size={12} aria-label="Completed" /> : null}{name}</strong>
                        {batch ? <span className="plan-list-batch">{batch}</span> : null}
                        <small>{detail}</small>
                      </button>
                      {movable && onResize ? <span className="plan-list-resize" role="presentation" title={`Drag down to the last day of ${name}`} /> : null}
                    </div>;
                  })}
                  {canCreate && calendar.id && !dragging ? <button className="icon-button plan-list-add" type="button" title={`Add ${calendar.name} activity on ${day}`} aria-label={`Add ${calendar.name} activity on ${day}`} onClick={() => onCreate(day, calendar.id)}><Plus size={14} /></button> : null}
                </div>
              </td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
    {ghost && dragging ? <div className={`plan-grid-ghost${moving?.target ? "" : " invalid"}`} style={{ left: ghost.x + 14, top: ghost.y + 10, ...(dragging.productionOrderId && numbers.get(dragging.productionOrderId) ? { "--order-color": orderColor(numbers.get(dragging.productionOrderId)!) } : {}) } as React.CSSProperties} aria-hidden="true">
      <strong>{ghost.label}</strong>
      <small>{moving?.target ? `${moving.kind === "resize" ? "Until " : ""}${label(moving.target.date, { weekday: "short", day: "2-digit", month: "short" })}` : moving?.kind === "resize" ? "Stretch down the same process column" : "Drop in the same process column"}</small>
    </div> : null}
  </div>;
}
