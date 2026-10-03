"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, GripVertical, Plus } from "lucide-react";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import { localDateKey } from "@/lib/services/calendarPrint";
import { canMovePlan, monthDates } from "@/lib/services/planningMonth";
import { orderColor, orderNumbers, type PurchaseOrder } from "@/lib/services/orders";
import { OrderBadge, PriorityMark } from "./OrderBadge";

type Target = { date: string; calendarId: string };
type Drag = { id: string; calendarId: string; label: string; pointerId: number; startX: number; startY: number; x: number; y: number; started: boolean };
const DRAG_THRESHOLD = 5;
const EDGE = 56;

// Month grid: dates down the side, one column per process, like the planning spreadsheet.
export function PlanningList({ date, lines, products, orders = [], calendars, canPlan, canCreate = canPlan, onMove, onSelect, onCreate }: {
  date: string; lines: PlanLine[]; products: Product[]; orders?: PurchaseOrder[]; calendars: UnitCalendar[]; canPlan: boolean; canCreate?: boolean;
  onMove: (id: string, date: string) => string; onSelect: (id: string) => void; onCreate: (date: string, calendarId: string) => void;
}) {
  const dates = monthDates(date);
  const numbers = orderNumbers(orders);
  const today = localDateKey(new Date());
  // Keyboard moves and pointer drags share the highlighted target; target is null over a cell that cannot accept the drop.
  const [moving, setMoving] = useState<{ id: string; target: Target | null } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const [notice, setNotice] = useState("");
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const suppressClick = useRef(false);
  const label = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", options);

  function finish(id: string, target: Target | null) {
    const line = lines.find((item) => item.id === id);
    if (target && canMovePlan(line, canPlan) && dates.includes(target.date) && line!.calendarId === target.calendarId && line!.plannedDate !== target.date) {
      setNotice(onMove(id, target.date));
    }
    setMoving(null);
  }
  function cancelDrag() {
    clearInterval(timer.current);
    drag.current = null; setGhost(null); setMoving(null);
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
    else setMoving({ id: current.id, target: locate(current).target });
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
  // The interval outlives renders, so it always calls the latest autoScroll.
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>, line: PlanLine, name: string) {
    if (!canMovePlan(line, canPlan) || event.button !== 0 || moving) return;
    // Touch and pen drag from the grip so the grid can still be scrolled with a finger.
    if (event.pointerType !== "mouse" && !(event.target as HTMLElement).closest(".plan-list-grip")) return;
    drag.current = { id: line.id, calendarId: line.calendarId!, label: name, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, started: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.started) {
      if (Math.hypot(current.x - current.startX, current.y - current.startY) < DRAG_THRESHOLD) return;
      current.started = true;
      timer.current = setInterval(() => autoScrollRef.current(), 16);
    }
    event.preventDefault();
    setGhost({ x: current.x, y: current.y, label: current.label });
    track();
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.started) {
      // The pointer-up also produces a click on the activity; skip opening it.
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const { target, otherColumn } = locate(current);
      if (otherColumn) setNotice("Activities stay in their process. Drop it on a date in the same column.");
      cancelDrag();
      finish(current.id, target);
    } else cancelDrag();
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) cancelDrag(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); clearInterval(timer.current); };
  }, []);

  // Without processes the month still shows, with one empty column.
  const columns = calendars.length ? calendars : [{ id: "", unitId: "", processId: "", name: "No processes to show" }];
  const dragging = moving && ghost ? lines.find((line) => line.id === moving.id) : undefined;
  return <div className={`monthly-plan-list${dragging ? " plan-grid-dragging" : ""}`}>
    <p className="sr-only" id="list-move-help">Drag an activity to another date in its column. With the keyboard, press Space on the handle, arrow up or down to choose a date, Enter to move, or Escape to cancel.</p>
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
              return <td key={calendar.id} data-cell-date={day} data-cell-calendar={calendar.id} className={[isTarget ? "plan-list-drop-target" : "", droppable ? "plan-grid-droppable" : ""].join(" ").trim() || undefined}>
                <div className="plan-grid-cell">
                  {lines.filter((line) => line.plannedDate === day && line.calendarId === calendar.id).map((line) => {
                    const product = products.find((item) => item.id === line.productId);
                    const name = product?.name ?? "Unknown product";
                    const movable = canMovePlan(line, canPlan);
                    const order = orders.find((item) => item.id === line.productionOrderId);
                    const number = order ? numbers.get(order.id) : undefined;
                    const detail = [order?.poNumber, line.orderReference, `${line.quantity.toLocaleString()} ${line.uom ?? product?.uom ?? ""}`.trim()].filter(Boolean).join(" · ");
                    return <div key={line.id} data-movable={movable || undefined} className={`plan-grid-item${number ? "" : " no-order"}${line.completedAt ? " completed" : ""}${dragging?.id === line.id ? " is-dragging" : ""}`}
                      style={number ? { "--order-color": orderColor(number) } as React.CSSProperties : undefined}
                      onPointerDown={(event) => pointerDown(event, line, name)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag}>
                      {movable ? <button type="button" className="icon-button plan-list-grip" title={`Move ${name}`} aria-label={`Move ${name}`} aria-describedby="list-move-help"
                        onKeyDown={(event) => {
                          if (event.key === " " && !moving) { event.preventDefault(); setMoving({ id: line.id, target }); }
                          else if (moving?.id === line.id && moving.target && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const index = dates.indexOf(moving.target.date); setMoving({ id: line.id, target: { ...moving.target, date: dates[Math.max(0, Math.min(dates.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))] } }); }
                          else if (moving?.id === line.id && event.key === "Enter") { event.preventDefault(); finish(line.id, moving.target); }
                          else if (event.key === "Escape") setMoving(null);
                        }}><GripVertical size={14} /></button> : null}
                      <button className="plan-list-product" type="button" title={`${line.completedAt ? "Completed: " : ""}${name}\n${detail}`} onClick={() => { if (!suppressClick.current) onSelect(line.id); }}>
                        <strong><OrderBadge number={number} poNumber={order?.poNumber} /><PriorityMark priority={line.priority} />{line.completedAt ? <CheckCircle2 size={12} aria-label="Completed" /> : null}{name}</strong>
                        <small>{detail}</small>
                      </button>
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
      <small>{moving?.target ? label(moving.target.date, { weekday: "short", day: "2-digit", month: "short" }) : "Drop in the same process column"}</small>
    </div> : null}
  </div>;
}
