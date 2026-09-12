"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Plus } from "lucide-react";
import type { PlanLine, Machine, ScheduleEntry, Product } from "@/lib/domain/types";
import { priorities, scheduleStatuses } from "@/lib/domain/types";

export function ActivityWorkspace({ line, product, machines, entries, canPlan, canProduce, onClose, onPlan, onProduction, children }: {
  children?: ReactNode;
  line: PlanLine; product?: Product; machines: Machine[]; entries: ScheduleEntry[];
  canPlan: boolean; canProduce: boolean; onClose: () => void;
  onPlan: (line: PlanLine) => void; onProduction: (entry: ScheduleEntry) => string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="activity-dialog unified-activity" aria-labelledby="activity-workspace-title" onClose={onClose}>
    <header className="panel-title"><div><p className="eyebrow">Activity workspace</p><h2 id="activity-workspace-title">{product?.name}</h2></div><button type="button" className="icon-button" aria-label="Close activity workspace" title="Close" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
    <section><h3>Part 1 - Planning</h3><form className="form-panel" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onPlan({ ...line, plannedDate: String(data.get("date")), quantity: Number(data.get("quantity")), priority: String(data.get("priority")) as PlanLine["priority"], notes: String(data.get("notes")) }); }}>
      <fieldset disabled={!canPlan}><label>Planned date<input name="date" type="date" defaultValue={line.plannedDate} required /></label><label>Quantity ({line.uom ?? product?.uom})<input name="quantity" type="number" min="0.000001" step="any" defaultValue={line.quantity} required /></label><label>Priority<select name="priority" defaultValue={line.priority}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label><label>Remarks<textarea name="notes" defaultValue={line.notes} /></label></fieldset>
      <p>{line.activityType}{line.batchSizeKg !== undefined ? ` · ${line.batchSizeKg} kg equivalent` : ""}</p>
      {canPlan ? <button type="submit" className="primary-button">Save planning</button> : null}
    </form></section>
    <section><h3>Part 2 - Production</h3>
      {entries.length === 0 ? <p>No production details yet.</p> : null}
      {entries.map((entry) => <ProductionForm key={entry.id} entry={entry} machines={machines} editable={canProduce} onSave={onProduction} />)}
      {adding ? <ProductionForm entry={{ id: `sched-${crypto.randomUUID()}`, planLineId: line.id, productId: line.productId, productionOrderId: line.productionOrderId, workCentreId: "", startAt: `${line.plannedDate}T08:00`, endAt: `${line.plannedDate}T16:00`, status: "Draft" }} machines={machines} editable onSave={(entry) => { const errors = onProduction(entry); if (!errors.length) setAdding(false); return errors; }} /> : canProduce ? <button type="button" className="calendar-button" onClick={() => setAdding(true)}><Plus size={16} /> Add production details</button> : null}
    </section>
    {children}
  </dialog>;
}
function ProductionForm({ entry, machines, editable, onSave }: { entry: ScheduleEntry; machines: Machine[]; editable: boolean; onSave: (entry: ScheduleEntry) => string[] }) {
  const [machineId, setMachineId] = useState(entry.machineId ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(entry.status);
  useEffect(() => setStatus(entry.status), [entry.status]);
  const machine = machines.find((item) => item.id === machineId);
  return <form className="production-detail-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!machine) return; const result = onSave({ ...entry, machineId, workCentreId: machine.workCentreId, startAt: String(data.get("start")), endAt: String(data.get("end")), status: String(data.get("status")) as ScheduleEntry["status"], notes: String(data.get("notes")) }); setErrors(result); setSaved(!result.length); }}>
    <fieldset disabled={!editable}><label>Machine<select required value={machineId} onChange={(event) => setMachineId(event.target.value)}><option value="">Select machine</option>{machines.filter((item) => item.active === "Active" || item.id === entry.machineId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <p>Configured capacity: {machine?.capacity !== undefined ? `${machine.capacity} ${machine.capacityUom ?? ""}` : machine?.capacityNotes ?? "Not configured"}</p>
    <p>Setup time: {machine?.setupMinutes ?? 0} minutes</p>
    <label>Start<input name="start" type="datetime-local" required defaultValue={entry.startAt} /></label><label>End<input name="end" type="datetime-local" required defaultValue={entry.endAt} /></label><label>Status<select name="status" value={status} onChange={(event) => setStatus(event.target.value as ScheduleEntry["status"])}>{scheduleStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>Production notes<textarea name="notes" defaultValue={entry.notes} /></label></fieldset>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}{saved ? <p role="status">Production details saved.</p> : null}
    {editable ? <button className="primary-button" type="submit">Save production</button> : null}
  </form>;
}
export function MachineConfiguration({ machines, onSave }: { machines: Machine[]; onSave: (machine: Machine) => void }) {
  return <section className="measurement-admin"><h2>Machine configuration</h2>{machines.map((machine) => <form key={machine.id} className="machine-config-row" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...machine, name: String(data.get("name")).trim(), capacity: data.get("capacity") ? Number(data.get("capacity")) : undefined, capacityUom: String(data.get("unit")).trim() }); }}>
    <label>Machine name<input name="name" defaultValue={machine.name} required /></label><label>Capacity<input name="capacity" type="number" min="0.000001" step="any" defaultValue={machine.capacity} /></label><label>Capacity unit / basis<input name="unit" placeholder="kg per batch / tablets per hour" defaultValue={machine.capacityUom} required /></label><button className="primary-button" type="submit">Save machine</button>
  </form>)}</section>;
}
