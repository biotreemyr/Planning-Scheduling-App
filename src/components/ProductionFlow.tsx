"use client";
import { useState } from "react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { CompletionInput, CorrectionInput, WipTransfer } from "@/lib/services/productionFlow";
import { actualUoms, stepOf } from "@/lib/services/processRules";

// Today as YYYY-MM-DD in local time.
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const display = (value: string) => value.slice(0, 10).split("-").reverse().join("-");
// A stored timestamp's local day, YYYY-MM-DD.
const localDay = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

/**
 * Production's update for one activity: the day work started, then the day it completed with the
 * actual quantity, notes on any issue, and where the output goes: the next process of the job's
 * route, the WIP room (held for that process), or nowhere when it is the final output.
 */
export function ProductionUpdate({ line, uom, directory: d, editable, nextCalendarId, onProgress, onComplete, onCorrect, outgoing }: {
  line: PlanLine; uom: string; directory: CalendarDirectory; editable: boolean;
  // The next process of this batch's route, offered first as the destination.
  nextCalendarId?: string;
  onProgress: (startedAt: string, notes: string) => string[];
  onComplete: (input: CompletionInput) => string[];
  // Present when a completed update may be corrected.
  onCorrect?: (input: CorrectionInput) => string[];
  outgoing?: WipTransfer;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const source = d.calendars.find((calendar) => calendar.id === line.calendarId);
  const processName = (id?: string) => d.processes.find((process) => process.id === d.calendars.find((calendar) => calendar.id === id)?.processId)?.name ?? d.calendars.find((calendar) => calendar.id === id)?.name ?? "";
  // The units this process reports in; the planned unit first when it is one of them.
  const reportUoms = actualUoms(processName(line.calendarId), uom);
  const doneUom = line.yieldUom ?? uom;
  const defaultUom = line.completedAt ? doneUom : reportUoms.includes(uom) ? uom : reportUoms[0] ?? uom;
  // Where the output can go: the WIP room, any other process of the unit after dispensing (in the
  // unit's process order), or final output. The next process of the batch's route is the default.
  const destinations = d.calendars.filter((calendar) => calendar.unitId === source?.unitId && calendar.id !== source?.id && stepOf(processName(calendar.id)) !== "dispensing");
  const unitOrder = d.calendars.filter((calendar) => calendar.unitId === source?.unitId);
  // The WIP room holds the output for the next process, or else the process after this one.
  const wipFor = (outgoing?.wipRoom ? outgoing.calendarId : undefined) ?? nextCalendarId ?? unitOrder.slice(unitOrder.findIndex((calendar) => calendar.id === source?.id) + 1).find((calendar) => destinations.includes(calendar))?.id;
  const completedDay = line.completedAt ? localDay(line.completedAt) : "";
  const handedOver = !!outgoing && !!(outgoing.receivedAt || outgoing.plannedLineId);
  const destinationValue = line.completedAt ? outgoing ? `${outgoing.wipRoom ? "wip" : "next"}:${outgoing.calendarId}` : "final" : nextCalendarId ? `next:${nextCalendarId}` : "final";

  if (line.completedAt && !correcting) return <section className="production-update"><h3>Production update</h3>
    <dl className="production-facts">
      <div><dt>Started</dt><dd>{line.startedAt ? display(line.startedAt) : "-"}</dd></div>
      <div><dt>Completed</dt><dd>{display(completedDay)}</dd></div>
      <div><dt>Actual quantity</dt><dd>{line.yieldQuantity?.toLocaleString()} {doneUom}{doneUom === uom && line.quantity > 0 ? <small> ({((line.yieldQuantity ?? 0) / line.quantity * 100).toFixed(1)}% of plan)</small> : <small> (planned {line.quantity.toLocaleString()} {uom})</small>}</dd></div>
      <div><dt>Output</dt><dd>{outgoing ? `${outgoing.wipRoom ? "WIP room, for " : "Transferred to "}${processName(outgoing.calendarId)} · ${outgoing.receivedAt ? `received by ${outgoing.receivedBy}` : "awaiting receipt"}` : "Final output - no transfer"}</dd></div>
    </dl>
    {line.productionNotes ? <p><strong>Notes:</strong> {line.productionNotes}</p> : null}
    {saved ? <p role="status">{saved}</p> : null}
    {editable && onCorrect ? <button type="button" className="calendar-button" onClick={() => { setCorrecting(true); setErrors([]); setSaved(""); }}>Correct this update</button> : null}
  </section>;
  return <section className="production-update"><h3>{correcting ? "Correct production update" : "Production update"}</h3>
    {!editable ? <p className="route-muted">{line.startedAt ? `Started ${display(line.startedAt)}. ` : "Not started yet. "}Production records progress here.</p> : <form className="production-update-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const startedAt = String(data.get("startedAt") ?? ""), completedDate = String(data.get("completedAt") ?? ""), notes = String(data.get("notes") ?? "").trim();
      const quantityText = String(data.get("quantity") ?? "").trim();
      const [kind, destinationId = ""] = String(data.get("destination") ?? "final").split(":");
      const output = { quantity: Number(quantityText), uom: String(data.get("yieldUom") ?? "") || uom, completedDate, notes, destinationId: kind === "final" ? "" : destinationId, wipRoom: kind === "wip" };
      if (correcting) {
        if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity."]); return; }
        const result = onCorrect!({ ...output, startedAt });
        setErrors(result);
        if (!result.length) { setCorrecting(false); setSaved("Production update corrected."); }
        return;
      }
      const completing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "complete";
      if (!completing) { const result = onProgress(startedAt, notes); setErrors(result); setSaved(result.length ? "" : "Progress saved."); return; }
      if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity to complete."]); return; }
      const progress = startedAt !== (line.startedAt ?? "") || notes !== (line.productionNotes ?? "") ? onProgress(startedAt || completedDate, notes) : [];
      if (progress.length) { setErrors(progress); return; }
      setErrors(onComplete(output));
    }}>
      <label>Date started<input name="startedAt" type="date" defaultValue={line.startedAt ?? ""} /></label>
      <label>Date completed<input name="completedAt" type="date" defaultValue={completedDay} max={today()} /></label>
      <div className="quantity-fields"><label>Actual quantity<input name="quantity" type="number" min="0" step="any" defaultValue={line.completedAt ? line.yieldQuantity : undefined} readOnly={handedOver} placeholder={`Planned ${line.quantity.toLocaleString()} ${uom}`} /></label>
        <label>UOM<select name="yieldUom" defaultValue={defaultUom} disabled={handedOver}>{[...new Set([...reportUoms, ...(line.completedAt ? [doneUom] : [])])].map((name) => <option key={name}>{name}</option>)}</select></label>
        {handedOver ? <input type="hidden" name="yieldUom" value={doneUom} /> : null}</div>
      <label className="production-notes">Notes<textarea name="notes" defaultValue={line.productionNotes ?? ""} placeholder="Anything that happened during production: issues, stoppages, deviations" /></label>
      <label className="production-destination">After completion, send to<select name="destination" defaultValue={destinationValue} disabled={handedOver}>
        {wipFor ? <option value={`wip:${wipFor}`}>WIP room</option> : null}
        {destinations.map((calendar) => <option key={calendar.id} value={`next:${calendar.id}`}>{processName(calendar.id)}{calendar.id === nextCalendarId ? " (next process)" : ""}</option>)}
        <option value="final">Final output</option>
      </select></label>
      {handedOver ? <input type="hidden" name="destination" value={destinationValue} /> : null}
      <div className="production-actions">
        {correcting ? <>
          <button type="button" className="calendar-button" onClick={() => { setCorrecting(false); setErrors([]); }}>Cancel</button>
          <button type="submit" className="primary-button">Save correction</button>
        </> : <>
          <button type="submit" value="progress" className="calendar-button">Save progress</button>
          <button type="submit" value="complete" className="primary-button">Complete production</button>
        </>}
      </div>
      {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
      {saved && !errors.length ? <p role="status">{saved}</p> : null}
      <p className="route-muted">{correcting ? handedOver ? `${processName(outgoing!.calendarId)} has already received this output, so its quantity and destination stay as they are. Dates and notes can still be corrected.` : "Correct anything keyed in by mistake. The handover to the next process follows the correction."
        : "Save progress records the start date and notes. Complete production also needs the completed date and actual quantity. A mistake can be corrected afterwards."}</p>
    </form>}
  </section>;
}

export function WipInbox({ transfers, products, directory: d, canReceive, canPlan, onReceive, onPlan }: { transfers: WipTransfer[]; products: Product[]; directory: CalendarDirectory; canReceive: boolean; canPlan: boolean; onReceive: (id: string) => void; onPlan: (id: string, date: string) => void }) {
  return <section className="wip-inbox"><h2>Incoming WIP <span className="badge neutral">{transfers.filter((item) => !item.receivedAt).length} awaiting receipt</span></h2>{!transfers.length ? <p>No incoming WIP.</p> : transfers.map((item) => <article key={item.id} className="wip-row"><div><h3>{products.find((product) => product.id === item.productId)?.name}</h3><p>{item.quantity.toLocaleString()} {item.uom} · From {d.calendars.find((calendar) => calendar.id === item.sourceCalendarId)?.name} · {item.orderReference}{item.wipRoom ? " · in the WIP room" : ""}</p><p>{item.notes}</p><small>Sent by {item.createdBy} · {new Date(item.createdAt).toLocaleString()}</small><p>{item.receivedAt ? `Received by ${item.receivedBy}` : "Awaiting receipt"}</p></div>{canReceive && !item.receivedAt ? <button className="calendar-button" type="button" onClick={() => onReceive(item.id)}>Acknowledge receipt</button> : null}{canPlan && item.receivedAt && !item.plannedLineId ? <form className="admin-inline" onSubmit={(event) => { event.preventDefault(); onPlan(item.id, String(new FormData(event.currentTarget).get("date"))); }}><label>Planned date<input name="date" type="date" required defaultValue={item.createdAt.slice(0, 10)} /></label><button type="submit" className="calendar-button">Add WIP to plan</button></form> : null}{item.plannedLineId ? <span className="badge neutral">Added to plan</span> : null}</article>)}</section>;
}
