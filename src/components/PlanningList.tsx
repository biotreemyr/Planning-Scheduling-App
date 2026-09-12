"use client";

import { useRef, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import type { PlanLine, Product } from "@/lib/domain/types";
import { canMovePlan, monthDates } from "@/lib/services/planningMonth";

export function PlanningList({ date, lines, products, canPlan, onMove, onSelect, onCreate }: {
  date: string; lines: PlanLine[]; products: Product[]; canPlan: boolean;
  onMove: (id: string, date: string) => void; onSelect: (id: string) => void; onCreate: (date: string) => void;
}) {
  const dates = monthDates(date);
  const [moving, setMoving] = useState<{ id: string; target: string } | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef<string | null>(null);
  function finish(target: string) {
    const line = lines.find((item) => item.id === active.current);
    if (canMovePlan(line, canPlan) && dates.includes(target) && line!.plannedDate !== target) {
      onMove(line!.id, target);
      setNotice(`Planning date updated to ${target}. Machine bookings are unchanged.`);
    }
    active.current = null; setMoving(null);
  }
  return <div className="monthly-plan-list">
    <p className="sr-only" id="list-move-help">Press Space to pick up an activity, arrow up or down to choose a date, Enter to move, or Escape to cancel.</p>
    {notice ? <p role="status" className="calendar-notice">{notice}</p> : null}
    <span className="sr-only" role="status">{moving ? `Moving activity to ${moving.target}` : ""}</span>
    <table className="plan-list" aria-label="Planned products by date">
      <colgroup><col className="plan-list-date-column" /><col /></colgroup>
      <thead><tr><th scope="col">Date</th><th scope="col">Product</th></tr></thead>
      <tbody>{dates.map((day) => <tr key={day} data-list-date={day} className={moving?.target === day ? "plan-list-drop-target" : ""}
        onDragOver={(event) => { if (canMovePlan(lines.find((line) => line.id === active.current), canPlan)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setMoving({ id: active.current!, target: day }); } }}
        onDrop={(event) => { event.preventDefault(); finish(day); }}>
        <th scope="row"><time dateTime={day}>{new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}<small>{new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}</small></time></th>
        <td><div className="plan-list-day">
          <div className="plan-list-items">{lines.filter((line) => line.plannedDate === day).map((line) => {
            const name = products.find((product) => product.id === line.productId)?.name ?? "Unknown product";
            const movable = canMovePlan(line, canPlan);
            return <div key={line.id} className="plan-list-item" draggable={movable}
              onDragStart={(event) => { if (!movable) { event.preventDefault(); return; } active.current = line.id; setMoving({ id: line.id, target: day }); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", line.id); }}
              onDragEnd={() => { active.current = null; setMoving(null); }}>
              {movable ? <button type="button" className="icon-button plan-list-grip" title={`Move ${name}`} aria-label={`Move ${name}`} aria-describedby="list-move-help"
                onKeyDown={(event) => {
                  if (event.key === " " && !moving) { event.preventDefault(); active.current = line.id; setMoving({ id: line.id, target: day }); }
                  else if (moving?.id === line.id && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const index = dates.indexOf(moving.target); setMoving({ id: line.id, target: dates[Math.max(0, Math.min(dates.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))] }); }
                  else if (moving?.id === line.id && event.key === "Enter") { event.preventDefault(); finish(moving.target); }
                  else if (event.key === "Escape") { active.current = null; setMoving(null); }
                }}><GripVertical size={16} /></button> : null}
              <button className="plan-list-product" type="button" onClick={() => onSelect(line.id)}>{name}</button>
            </div>;
          })}</div>
          {canPlan ? <button className="icon-button plan-list-add" type="button" title={`Add activity on ${day}`} aria-label={`Add activity on ${day}`} onClick={() => onCreate(day)}><Plus size={16} /></button> : null}
        </div></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
