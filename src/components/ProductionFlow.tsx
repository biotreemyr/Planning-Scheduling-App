"use client";
import { useState } from "react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { CompletionInput, WipTransfer } from "@/lib/services/productionFlow";

// Today as YYYY-MM-DD in local time.
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const display = (value: string) => value.slice(0, 10).split("-").reverse().join("-");

/**
 * Production's update for one activity: the day work started, then the day it completed with the
 * actual quantity, notes on any issue, and where the output goes: the next process of the job's
 * route, the WIP room (held for that process), or nowhere when it is the final output.
 */
export function ProductionUpdate({ line, uom, directory: d, editable, nextCalendarId, onProgress, onComplete, outgoing }: {
  line: PlanLine; uom: string; directory: CalendarDirectory; editable: boolean;
  // The next process of this batch's route, offered first as the destination.
  nextCalendarId?: string;
  onProgress: (startedAt: string, notes: string) => string[];
  onComplete: (input: CompletionInput) => string[];
  outgoing?: WipTransfer;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const source = d.calendars.find((calendar) => calendar.id === line.calendarId);
  const processName = (id?: string) => d.processes.find((process) => process.id === d.calendars.find((calendar) => calendar.id === id)?.processId)?.name ?? d.calendars.find((calendar) => calendar.id === id)?.name ?? "";
  const others = d.calendars.filter((calendar) => calendar.processId !== source?.processId && calendar.unitId === source?.unitId && calendar.id !== nextCalendarId);
  if (line.completedAt) return <section className="production-update"><h3>Part 2 - Production update</h3>
    <dl className="production-facts">
      <div><dt>Started</dt><dd>{line.startedAt ? display(line.startedAt) : "-"}</dd></div>
      <div><dt>Completed</dt><dd>{display(new Date(line.completedAt).toISOString())}</dd></div>
      <div><dt>Actual quantity</dt><dd>{line.yieldQuantity?.toLocaleString()} {uom} <small>({line.quantity > 0 ? ((line.yieldQuantity ?? 0) / line.quantity * 100).toFixed(1) : "0"}% of plan)</small></dd></div>
      <div><dt>Output</dt><dd>{outgoing ? `${outgoing.wipRoom ? "WIP room, for " : "Transferred to "}${processName(outgoing.calendarId)} · ${outgoing.receivedAt ? `received by ${outgoing.receivedBy}` : "awaiting receipt"}` : "Final output - no transfer"}</dd></div>
    </dl>
    {line.productionNotes ? <p><strong>Notes:</strong> {line.productionNotes}</p> : null}
  </section>;
  return <section className="production-update"><h3>Part 2 - Production update</h3>
    {!editable ? <p className="route-muted">{line.startedAt ? `Started ${display(line.startedAt)}. ` : "Not started yet. "}Production records progress here.</p> : <form className="production-update-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const startedAt = String(data.get("startedAt") ?? ""), completedDate = String(data.get("completedAt") ?? ""), notes = String(data.get("notes") ?? "").trim();
      const quantityText = String(data.get("quantity") ?? "").trim();
      const completing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "complete";
      if (!completing) { const result = onProgress(startedAt, notes); setErrors(result); setSaved(result.length ? "" : "Progress saved."); return; }
      if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity to complete."]); return; }
      const [kind, destinationId = ""] = String(data.get("destination") ?? "final").split(":");
      const progress = startedAt !== (line.startedAt ?? "") || notes !== (line.productionNotes ?? "") ? onProgress(startedAt || completedDate, notes) : [];
      if (progress.length) { setErrors(progress); return; }
      setErrors(onComplete({ quantity: Number(quantityText), completedDate, notes, destinationId: kind === "final" ? "" : destinationId, wipRoom: kind === "wip" }));
    }}>
      <label>Date started<input name="startedAt" type="date" defaultValue={line.startedAt ?? ""} /></label>
      <label>Date completed<input name="completedAt" type="date" defaultValue="" max={today()} /></label>
      <label>Actual quantity ({uom})<input name="quantity" type="number" min="0" step="any" placeholder={`Planned ${line.quantity.toLocaleString()}`} /></label>
      <label className="production-notes">Notes<textarea name="notes" defaultValue={line.productionNotes ?? ""} placeholder="Anything that happened during production: issues, stoppages, deviations" /></label>
      <label className="production-destination">After completion, send to<select name="destination" defaultValue={nextCalendarId ? `next:${nextCalendarId}` : "final"}>
        {nextCalendarId ? <option value={`next:${nextCalendarId}`}>Next process: {processName(nextCalendarId)}</option> : null}
        {nextCalendarId ? <option value={`wip:${nextCalendarId}`}>WIP room, for {processName(nextCalendarId)}</option> : null}
        <option value="final">Final output - no transfer</option>
        {others.length ? <optgroup label="Another process">{others.map((calendar) => <option key={calendar.id} value={`next:${calendar.id}`}>{processName(calendar.id)}</option>)}</optgroup> : null}
      </select></label>
      <div className="production-actions">
        <button type="submit" value="progress" className="calendar-button">Save progress</button>
        <button type="submit" value="complete" className="primary-button">Complete production</button>
      </div>
      {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
      {saved && !errors.length ? <p role="status">{saved}</p> : null}
      <p className="route-muted">Save progress records the start date and notes. Complete production also needs the completed date and actual quantity; it then locks.</p>
    </form>}
  </section>;
}

export function WipInbox({ transfers, products, directory: d, canReceive, canPlan, onReceive, onPlan }: { transfers: WipTransfer[]; products: Product[]; directory: CalendarDirectory; canReceive: boolean; canPlan: boolean; onReceive: (id: string) => void; onPlan: (id: string, date: string) => void }) {
  return <section className="wip-inbox"><h2>Incoming WIP <span className="badge neutral">{transfers.filter((item) => !item.receivedAt).length} awaiting receipt</span></h2>{!transfers.length ? <p>No incoming WIP.</p> : transfers.map((item) => <article key={item.id} className="wip-row"><div><h3>{products.find((product) => product.id === item.productId)?.name}</h3><p>{item.quantity.toLocaleString()} {item.uom} · From {d.calendars.find((calendar) => calendar.id === item.sourceCalendarId)?.name} · {item.orderReference}{item.wipRoom ? " · in the WIP room" : ""}</p><p>{item.notes}</p><small>Sent by {item.createdBy} · {new Date(item.createdAt).toLocaleString()}</small><p>{item.receivedAt ? `Received by ${item.receivedBy}` : "Awaiting receipt"}</p></div>{canReceive && !item.receivedAt ? <button className="calendar-button" type="button" onClick={() => onReceive(item.id)}>Acknowledge receipt</button> : null}{canPlan && item.receivedAt && !item.plannedLineId ? <form className="admin-inline" onSubmit={(event) => { event.preventDefault(); onPlan(item.id, String(new FormData(event.currentTarget).get("date"))); }}><label>Planned date<input name="date" type="date" required defaultValue={item.createdAt.slice(0, 10)} /></label><button type="submit" className="calendar-button">Add WIP to plan</button></form> : null}{item.plannedLineId ? <span className="badge neutral">Added to plan</span> : null}</article>)}</section>;
}
