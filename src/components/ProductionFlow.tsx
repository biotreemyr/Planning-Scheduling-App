"use client";
import { useState } from "react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Machine, PlanLine, Product, RunSet } from "@/lib/domain/types";
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
  onProgress: (startedAt: string, notes: string, machineId?: string, sets?: RunSet[]) => string[];
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
  // Coating runs in several sets: each set's output weight (or volume) and coated tablet weight give
  // its count, and the actual quantity is their total. Sets entered so far are kept with progress.
  const multiSet = step === "coating";
  type SetDraft = { key: number; quantity: string; uom: string; unitSize: string };
  const [sets, setSets] = useState<SetDraft[]>(() => line.runSets?.length
    ? line.runSets.map((set, index) => ({ key: index, quantity: String(set.quantity), uom: set.uom, unitSize: String(set.unitSize) }))
    : [{ key: 0, quantity: "", uom: "kg", unitSize: String(line.unitWeightMg ?? "") }]);
  const setCount = (set: SetDraft) => set.quantity.trim() === "" ? undefined : countFromWeight(Number(set.quantity), set.uom, Number(set.unitSize));
  const setsTotal = sets.reduce((sum, set) => sum + (setCount(set) ?? 0), 0);
  const changeSet = (key: number, change: Partial<SetDraft>) => setSets((current) => current.map((set) => set.key === key ? { ...set, ...change } : set));
  // The sets keyed in, checked: an empty set is skipped, a half-filled one is an error.
  function readSets(): RunSet[] | { error: string } {
    const read: RunSet[] = [];
    for (const [index, set] of sets.entries()) {
      if (set.quantity.trim() === "" && set.unitSize.trim() === "") continue;
      const count = setCount(set);
      if (count === undefined) return { error: `Set ${index + 1}: enter the output ${unitSizeUom(set.uom) === "mL" ? "volume" : "weight"} and the ${unitName.toLowerCase()} ${unitSizeUom(set.uom) === "mL" ? "volume" : "weight"} (${unitSizeUom(set.uom)} each).` };
      read.push({ quantity: Number(set.quantity), uom: set.uom, unitSize: Number(set.unitSize), count });
    }
    return read;
  }
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
      {line.runSets && line.runSets.length > 1 ? <div><dt>Sets</dt><dd>{line.runSets.map((set, index) => <small key={index} className="run-set-fact">Set {index + 1}: {set.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {set.uom} at {set.unitSize.toLocaleString()} {unitSizeUom(set.uom)} each = {set.count.toLocaleString()} {doneUom}</small>)}</dd></div> : null}
      <div><dt>Actual quantity</dt><dd>{line.yieldQuantity?.toLocaleString()} {doneUom}{line.weighedQuantity !== undefined && !(line.runSets && line.runSets.length > 1) ? <small> · {line.actualUnitVolumeMl ? "measured" : "weighed"} {line.weighedQuantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {line.weighedUom} at {(line.actualUnitVolumeMl ?? line.actualUnitWeightMg)?.toLocaleString()} {line.actualUnitVolumeMl ? "mL" : "mg"} each</small> : null}{doneUom === uom && line.quantity > 0 ? <small> ({((line.yieldQuantity ?? 0) / line.quantity * 100).toFixed(1)}% of plan)</small> : <small> (planned {line.quantity.toLocaleString()} {uom})</small>}</dd></div>
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
      const runSets = multiSet ? readSets() : undefined;
      if (runSets && "error" in runSets) { setErrors([runSets.error]); return; }
      if (!multiSet && (typed || correcting) && weighing && !(Number(unitMg) > 0)) { setErrors([`Enter the ${unitLabel.toLowerCase()} in ${sizeUom} to convert ${reported} to ${countUom}.`]); return; }
      const single = runSets?.length === 1 ? runSets[0] : undefined;
      const weighed = multiSet ? single ? { quantity: single.quantity, uom: single.uom, unitWeightMg: single.unitSize } : undefined
        : typed && weighing ? { quantity: Number(typed), uom: reported, unitWeightMg: Number(unitMg) } : undefined;
      const quantityText = multiSet ? runSets!.length ? String(runSets!.reduce((sum, set) => sum + set.count, 0)) : "" : weighed ? String(countFromWeight(weighed.quantity, weighed.uom, weighed.unitWeightMg)) : typed;
      const output = { quantity: Number(quantityText), uom: weighed || multiSet ? countUom! : reported, ...(weighed ? { weighed } : {}), ...(runSets?.length ? { sets: runSets } : {}), completedDate, notes, destinationId: kind === "final" ? "" : destinationId, wipRoom: kind === "wip", machineId: machine };
      const done = (result: string[], message: string) => { setErrors(result); if (!result.length) { if (onSaved) onSaved(message); else setSaved(message); } return result; };
      if (correcting) {
        if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity."]); return; }
        if (!done(onCorrect!({ ...output, startedAt }), "Production update corrected.").length) setCorrecting(false);
        return;
      }
      const completing = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "complete";
      if (!completing) { done(onProgress(startedAt, notes, machine, runSets), runSets?.length ? `Progress saved with ${runSets.length} set${runSets.length === 1 ? "" : "s"}.` : "Progress saved."); return; }
      if (!completedDate || !quantityText) { setErrors(["Enter the completed date and the actual quantity to complete."]); return; }
      const progress = startedAt !== (line.startedAt ?? "") || notes !== (line.productionNotes ?? "") ? onProgress(startedAt || completedDate, notes) : [];
      if (progress.length) { setErrors(progress); return; }
      done(onComplete(output), "Production completed.");
    }}>
      <label>Date started<input name="startedAt" type="date" defaultValue={line.startedAt ?? ""} /></label>
      <label>Date completed<input name="completedAt" type="date" defaultValue={completedDay} max={today()} /></label>
      {multiSet ? <fieldset className="run-sets"><legend>Coating sets</legend>
        {sets.map((set, index) => { const count = setCount(set); const size = unitSizeUom(set.uom) ?? "mg"; return <div className="run-set" key={set.key} role="group" aria-label={`Set ${index + 1}`}>
          <strong>Set {index + 1}</strong>
          <label>Output {size === "mL" ? "volume" : "weight"}<input type="number" min="0" step="any" value={set.quantity} readOnly={handedOver} placeholder="e.g. 120" onChange={(event) => changeSet(set.key, { quantity: event.target.value })} /></label>
          <label>UOM<select value={set.uom} disabled={handedOver} onChange={(event) => changeSet(set.key, { uom: event.target.value })}>{reportUoms.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>{unitName} {size === "mL" ? "volume" : "weight"} ({size} each)<input type="number" min="0" step="any" value={set.unitSize} readOnly={handedOver} placeholder={size === "mL" ? "e.g. 5" : "e.g. 350"} onChange={(event) => changeSet(set.key, { unitSize: event.target.value })} /></label>
          <span className="run-set-count">{count !== undefined ? <>= <strong>{count.toLocaleString()}</strong> {countUom}</> : <span className="route-muted">= -</span>}</span>
          {sets.length > 1 && !handedOver ? <button type="button" className="icon-button danger" aria-label={`Remove set ${index + 1}`} title={`Remove set ${index + 1}`} onClick={() => setSets((current) => current.filter((other) => other.key !== set.key))}>×</button> : null}
        </div>; })}
        {!handedOver ? <button type="button" className="calendar-button" onClick={() => setSets((current) => [...current, { key: Math.max(0, ...current.map((set) => set.key)) + 1, quantity: "", uom: current.at(-1)?.uom ?? "kg", unitSize: current.at(-1)?.unitSize ?? "" }])}>+ Add set {sets.length + 1}</button> : null}
        <p className="weighed-count" role="status">Actual quantity: {setsTotal ? <strong>{setsTotal.toLocaleString()} {countUom}</strong> : <span className="route-muted">total of the sets · planned {line.quantity.toLocaleString()} {uom}</span>}{sets.length > 1 && setsTotal ? <small> from {sets.filter((set) => setCount(set) !== undefined).length} sets</small> : null}</p>
      </fieldset> : <>
      <div className="quantity-fields"><label>{weighing ? `Output ${sizeUom === "mL" ? "volume" : "weight"}` : "Actual quantity"}<input name="quantity" type="number" min="0" step="any" value={quantityText} onChange={(event) => setQuantityText(event.target.value)} readOnly={handedOver} placeholder={weighing ? "e.g. 23.975" : `Planned ${line.quantity.toLocaleString()} ${uom}`} /></label>
        <label>UOM<select name="yieldUom" value={chosenUom} onChange={(event) => setChosenUom(event.target.value)} disabled={handedOver}>{[...new Set([...reportUoms, ...(line.completedAt && !counting ? [doneUom] : []), ...(line.weighedUom ? [line.weighedUom] : [])])].map((name) => <option key={name}>{name}</option>)}</select></label>
        {handedOver ? <input type="hidden" name="yieldUom" value={chosenUom} /> : null}</div>
      {weighing ? <div className="quantity-fields weighed-fields"><label>{unitLabel} ({sizeUom} each)<input name="unitWeightMg" type="number" min="0" step="any" required value={unitMg} onChange={(event) => setUnitMg(event.target.value)} readOnly={handedOver} placeholder={sizeUom === "mL" ? "e.g. 5" : "e.g. 350"} /></label>
        <p className="weighed-count" role="status">Actual quantity: {counted !== undefined ? <strong>{counted.toLocaleString()} {countUom}</strong> : <span className="route-muted">worked out from the {sizeUom === "mL" ? "volume" : "weight"} · planned {line.quantity.toLocaleString()} {uom}</span>}</p></div> : null}
      </>}
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
