"use client";
import { useState } from "react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { CompletionInput, WipTransfer } from "@/lib/services/productionFlow";

export function EndProduction({ line, uom, directory: d, editable, onComplete, outgoing }: { line: PlanLine; uom: string; directory: CalendarDirectory; editable: boolean; onComplete: (input: CompletionInput) => string[]; outgoing?: WipTransfer }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const source = d.calendars.find((calendar) => calendar.id === line.calendarId);
  if (line.completedAt) return <section><h3>Production complete</h3><p>Yield: {line.yieldQuantity?.toLocaleString()} {uom} ({line.quantity > 0 ? ((line.yieldQuantity ?? 0) / line.quantity * 100).toFixed(1) : "0"}% of plan)</p><p>{new Date(line.completedAt).toLocaleString()}</p>{outgoing ? <p>Transferred to {d.calendars.find((calendar) => calendar.id === outgoing.calendarId)?.name} · {outgoing.receivedAt ? `Received by ${outgoing.receivedBy}` : "Awaiting receipt"}</p> : <p>Final output - no transfer.</p>}</section>;
  if (!editable) return null;
  return <section><h3>Completion & WIP transfer</h3>{!open ? <button type="button" className="primary-button" onClick={() => setOpen(true)}>End production</button> : <form className="form-panel" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setErrors(onComplete({ quantity: Number(data.get("yield")), destinationId: String(data.get("destination")), notes: String(data.get("notes") ?? "").trim() })); }}>
    <label>Final yield ({uom})<input name="yield" type="number" required min="0" step="any" /></label>
    <label>Transfer to process<select name="destination"><option value="">No transfer - final output</option>{d.calendars.filter((calendar) => calendar.processId !== source?.processId).map((calendar) => <option key={calendar.id} value={calendar.id}>{d.units.find((unit) => unit.id === calendar.unitId)?.name} / {d.processes.find((process) => process.id === calendar.processId)?.name}</option>)}</select></label>
    <label>Handoff notes<textarea name="notes" /></label>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    <button type="submit" className="primary-button">Confirm completion & yield</button><button type="button" className="calendar-button" onClick={() => setOpen(false)}>Cancel</button>
  </form>}</section>;
}

export function WipInbox({ transfers, products, directory: d, canReceive, canPlan, onReceive, onPlan }: { transfers: WipTransfer[]; products: Product[]; directory: CalendarDirectory; canReceive: boolean; canPlan: boolean; onReceive: (id: string) => void; onPlan: (id: string, date: string) => void }) {
  return <section className="wip-inbox"><h2>Incoming WIP <span className="badge neutral">{transfers.filter((item) => !item.receivedAt).length} awaiting receipt</span></h2>{!transfers.length ? <p>No incoming WIP.</p> : transfers.map((item) => <article key={item.id} className="wip-row"><div><h3>{products.find((product) => product.id === item.productId)?.name}</h3><p>{item.quantity.toLocaleString()} {item.uom} · From {d.calendars.find((calendar) => calendar.id === item.sourceCalendarId)?.name} · {item.orderReference}</p><p>{item.notes}</p><small>Sent by {item.createdBy} · {new Date(item.createdAt).toLocaleString()}</small><p>{item.receivedAt ? `Received by ${item.receivedBy}` : "Awaiting receipt"}</p></div>{canReceive && !item.receivedAt ? <button className="calendar-button" type="button" onClick={() => onReceive(item.id)}>Acknowledge receipt</button> : null}{canPlan && item.receivedAt && !item.plannedLineId ? <form className="admin-inline" onSubmit={(event) => { event.preventDefault(); onPlan(item.id, String(new FormData(event.currentTarget).get("date"))); }}><label>Planned date<input name="date" type="date" required defaultValue={item.createdAt.slice(0, 10)} /></label><button type="submit" className="calendar-button">Add WIP to plan</button></form> : null}{item.plannedLineId ? <span className="badge neutral">Added to plan</span> : null}</article>)}</section>;
}
