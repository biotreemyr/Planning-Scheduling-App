"use client";
import { useState } from "react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, Product } from "@/lib/domain/types";
import type { CompletionInput, CorrectionInput, WipTransfer } from "@/lib/services/productionFlow";
import { actualUoms, stepOf } from "@/lib/services/processRules";
import { countFromWeight, unitSizeUom } from "@/lib/services/measurements";

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
export function ProductionUpdate({ line, uom, directory: d, editable, nextCalendarId, onProgress, onComplete, onCorrect, onSaved, outgoing, machines = [], machineId = "" }: {
  line: PlanLine; uom: string; directory: CalendarDirectory; editable: boolean;
  // Machines set up for this process, and the one the activity is booked on ("" for none).
  machines?: Machine[]; machineId?: string;
  // Called after a successful save, to close the activity and say what was saved.
  onSaved?: (message: string) => void;
  // The next process of this batch's route, offered first as the destination.
  nextCalendarId?: string;
  onProgress: (startedAt: string, notes: string, machineId?: string) => string[];
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
  const counting = ["capsulation", "tableting", "coating"].includes(stepOf(processName(line.calendarId)) ?? "");
  const defaultUom = counting ? line.weighedUom ?? "kg" : line.completedAt ? doneUom : reportUoms.includes(uom) ? uom : reportUoms[0] ?? uom;
  // Compression, coating and capsulation count tablets or capsules; output weighed in kg or g is
  // converted with the weight of one compressed/coated tablet or filled capsule.
  const step = stepOf(processName(line.calendarId));
  const countUom = step === "capsulation" ? "capsules" : step === "tableting" || step === "coating" ? "tablets" : undefined;
  const unitName = step === "capsulation" ? "Filled capsule" : step === "coating" ? "Coated tablet" : "Compressed tablet";
  const [chosenUom, setChosenUom] = useState(defaultUom);
  const [quantityText, setQuantityText] = useState(line.completedAt ? String((counting ? line.weighedQuantity : line.yieldQuantity) ?? "") : "");
  const [unitMg, setUnitMg] = useState(String(line.actualUnitWeightMg ?? line.actualUnitVolumeMl ?? line.unitWeightMg ?? ""));
  // A weight (kg, g) asks for mg per unit; a volume (L, mL) for mL per unit.
  const sizeUom = unitSizeUom(chosenUom);
  const weighing = !!countUom && !!sizeUom;
  const unitLabel = `${unitName} ${sizeUom === "mL" ? "volume" : "weight"}`;
  const counted = weighing && quantityText.trim() !== "" ? countFromWeight(Number(quantityText), chosenUom, Number(unitMg)) : undefined;
  // The actual quantity follows the weights until production types over it (it can still be changed).
  const storedCount = line.weighedQuantity !== undefined ? countFromWeight(line.weighedQuantity, line.weighedUom ?? "", line.actualUnitWeightMg ?? line.actualUnitVolumeMl ?? 0) : undefined;
  const [actualText, setActualText] = useState(line.completedAt && counting ? String(line.yieldQuantity ?? "") : "");
  const [actualEdited, setActualEdited] = useState(!!line.completedAt && counting && line.yieldQuantity !== storedCount);
  const actualShown = actualEdited ? actualText : counted !== undefined ? String(counted) : "";
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
      <div><dt>Actual quantity</dt><dd>{line.yieldQuantity?.toLocaleString()} {doneUom}{line.weighedQuantity !== undefined ? <small> · {line.actualUnitVolumeMl ? "measured" : "weighed"} {line.weighedQuantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {line.weighedUom} at {(line.actualUnitVolumeMl ?? line.actualUnitWeightMg)?.toLocaleString()} {line.actualUnitVolumeMl ? "mL" : "mg"} each</small> : null}{doneUom === uom && line.quantity > 0 ? <small> ({((line.yieldQuantity ?? 0) / line.quantity * 100).toFixed(1)}% of plan)</small> : <small> (planned {line.quantity.toLocaleString()} {uom})</small>}</dd></div>
      <div><dt>Machine</dt><dd>{machines.find((machine) => machine.id === machineId)?.name ?? "Not assigned"}</dd></div>
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
      const typed = String(data.get("quantity") ?? "").trim();
      const [kind, destinationId = ""] = String(data.get("destination") ?? "final").split(":");
      const machine = String(data.get("machine") ?? "");
      const reported = String(data.get("yieldUom") ?? "") || uom;
      if ((typed || correcting) && weighing && !(Number(unitMg) > 0)) { setErrors([`Enter the ${unitLabel.toLowerCase()} in ${sizeUom} to convert ${reported} to ${countUom}.`]); return; }
      const weighed = typed && weighing ? { quantity: Number(typed), uom: reported, unitWeightMg: Number(unitMg) } : undefined;
      const quantityText = weighed ? actualShown.trim() : typed;
      const output = { quantity: Number(quantityText), uom: weighed ? countUom! : reported, ...(weighed ? { weighed } : {}), completedDate, notes, destinationId: kind === "final" ? "" : destinationId, wipRoom: kind === "wip", machineId: machine };
      const done = (result: string[], message: string) => { setErrors(result); if (!result.length) { if (onSaved) onSaved(message); else setSaved(message); } return result; };
      if (correcting) {
        if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity."]); return; }
        if (!done(onCorrect!({ ...output, startedAt }), "Production update corrected.").length) setCorrecting(false);
        return;
      }
      const completing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "complete";
      if (!completing) { done(onProgress(startedAt, notes, machine), "Progress saved."); return; }
      if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity to complete."]); return; }
      const progress = startedAt !== (line.startedAt ?? "") || notes !== (line.productionNotes ?? "") ? onProgress(startedAt || completedDate, notes) : [];
      if (progress.length) { setErrors(progress); return; }
      done(onComplete(output), "Production completed.");
    }}>
      <label>Date started<input name="startedAt" type="date" defaultValue={line.startedAt ?? ""} /></label>
      <label>Date completed<input name="completedAt" type="date" defaultValue={completedDay} max={today()} /></label>
      <div className={weighing ? "quantity-fields weighed-row" : "quantity-fields"}><label>{weighing ? `Output ${sizeUom === "mL" ? "volume" : "weight"}` : "Actual quantity"}<input name="quantity" type="number" min="0" step="any" value={quantityText} onChange={(event) => setQuantityText(event.target.value)} readOnly={handedOver} placeholder={weighing ? "e.g. 23.975" : `Planned ${line.quantity.toLocaleString()} ${uom}`} /></label>
        <label>UOM<select name="yieldUom" value={chosenUom} onChange={(event) => setChosenUom(event.target.value)} disabled={handedOver}>{[...new Set([...reportUoms, ...(line.completedAt && !counting ? [doneUom] : []), ...(line.weighedUom ? [line.weighedUom] : [])])].map((name) => <option key={name}>{name}</option>)}</select></label>
        {handedOver ? <input type="hidden" name="yieldUom" value={chosenUom} /> : null}
        {weighing ? <>
          <label>{unitLabel} ({sizeUom} each)<input name="unitWeightMg" type="number" min="0" step="any" required value={unitMg} onChange={(event) => setUnitMg(event.target.value)} readOnly={handedOver} placeholder={sizeUom === "mL" ? "e.g. 5" : "e.g. 350"} /></label>
          <label>Actual quantity ({countUom})<input name="actualQuantity" type="number" min="0" step="1" value={actualShown} readOnly={handedOver} placeholder={`Planned ${line.quantity.toLocaleString()}`}
            onChange={(event) => { setActualText(event.target.value); setActualEdited(true); }} /></label>
        </> : null}</div>
      {weighing ? <p className="weighed-count" role="status">{actualEdited && counted !== undefined && actualShown !== String(counted)
        ? <>Calculated from the {sizeUom === "mL" ? "volume" : "weight"}: {counted.toLocaleString()} {countUom} · <button type="button" className="link-button" onClick={() => setActualEdited(false)}>Use calculated</button></>
        : <span className="route-muted">Actual quantity is worked out from the {sizeUom === "mL" ? "volume" : "weight"}; change it if needed.</span>}</p> : null}
      <label>Machine<select name="machine" defaultValue={machineId}>
        <option value="">{machines.length ? "Not assigned" : "No machine set up"}</option>
        {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
      </select></label>
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
        : `Save progress records the start date and notes. Complete production also needs the completed date and ${weighing ? `the output ${sizeUom === "mL" ? "volume" : "weight"} with the ${unitLabel.toLowerCase()}, which give the actual quantity` : "actual quantity"}. A mistake can be corrected afterwards.`}</p>
    </form>}
  </section>;
}

export function WipInbox({ transfers, products, directory: d, canReceive, canPlan, onReceive, onPlan }: { transfers: WipTransfer[]; products: Product[]; directory: CalendarDirectory; canReceive: boolean; canPlan: boolean; onReceive: (id: string) => void; onPlan: (id: string, date: string) => void }) {
  return <section className="wip-inbox"><h2>Incoming WIP <span className="badge neutral">{transfers.filter((item) => !item.receivedAt).length} awaiting receipt</span></h2>{!transfers.length ? <p>No incoming WIP.</p> : transfers.map((item) => <article key={item.id} className="wip-row"><div><h3>{products.find((product) => product.id === item.productId)?.name}</h3><p>{item.quantity.toLocaleString()} {item.uom} · From {d.calendars.find((calendar) => calendar.id === item.sourceCalendarId)?.name} · {item.orderReference}{item.wipRoom ? " · in the WIP room" : ""}</p><p>{item.notes}</p><small>Sent by {item.createdBy} · {new Date(item.createdAt).toLocaleString()}</small><p>{item.receivedAt ? `Received by ${item.receivedBy}` : "Awaiting receipt"}</p></div>{canReceive && !item.receivedAt ? <button className="calendar-button" type="button" onClick={() => onReceive(item.id)}>Acknowledge receipt</button> : null}{canPlan && item.receivedAt && !item.plannedLineId ? <form className="admin-inline" onSubmit={(event) => { event.preventDefault(); onPlan(item.id, String(new FormData(event.currentTarget).get("date"))); }}><label>Planned date<input name="date" type="date" required defaultValue={item.createdAt.slice(0, 10)} /></label><button type="submit" className="calendar-button">Add WIP to plan</button></form> : null}{item.plannedLineId ? <span className="badge neutral">Added to plan</span> : null}</article>)}</section>;
}
