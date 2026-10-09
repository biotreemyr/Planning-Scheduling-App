"use client";
import { useEffect, useRef, useState } from "react";
import { AdminRows } from "./AdminRows";
import type { CalendarDirectory, CalendarPerson } from "@/lib/domain/calendarAccess";
import type { Machine, WorkCentre } from "@/lib/domain/types";
import { configureUnit, removeDirectoryItem } from "@/lib/services/adminConfiguration";
import { DOSAGE_FORMS, NEW_PROCESS, PLANNED_LABEL, REPORT_LABEL, settingsOf, type DosageForm, type PlannedSource, type ProcessSettings, type ReportKind } from "@/lib/services/processSetup";

const id = () => crypto.randomUUID();
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
type Section = "units" | "processes" | "people" | "machines";
const sections: { key: Section; label: string; singular: string }[] = [
  { key: "units", label: "Units", singular: "unit" }, { key: "processes", label: "Processes", singular: "process" },
  { key: "people", label: "People & access", singular: "person" }, { key: "machines", label: "Machines", singular: "machine" }
];

export function CalendarAdmin({ directory: d, onSave, machines, workCentres, onMachine, onDeleteMachine, onOpenCalendar, showPeople = true }: {
  onOpenCalendar: (unitId: string) => void;
  // People & access is hidden when access comes from Bio Tree Core.
  showPeople?: boolean;
  directory: CalendarDirectory; onSave: (directory: CalendarDirectory) => string[];
  machines: Machine[]; workCentres: WorkCentre[]; onMachine: (machine: Machine) => string[];
  onDeleteMachine: (id: string) => string[];
}) {
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<Section>("units");
  const [editing, setEditing] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const editor = useRef<HTMLElement>(null);
  useEffect(() => { if (editing) editor.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [editing]);
  const selectedSection = sections.find((item) => item.key === section)!;
  const rows = section === "machines" ? machines : d[section];
  function finish(errors: string[], message: string) {
    setNotice(errors.join(" ") || message);
    if (!errors.length) { setEditing(null); setPendingDelete(null); setVersion((current) => current + 1); }
    return !errors.length;
  }
  function save(next: CalendarDirectory) { return finish(onSave(next), editing ? "Changes saved." : "Item added."); }
  function remove() {
    if (!pendingDelete) return;
    if (section === "machines") { finish(onDeleteMachine(pendingDelete.id), "Machine deleted."); return; }
    finish(onSave(removeDirectoryItem(d, section, pendingDelete.id)), "Item deleted.");
  }
  function summary(recordId: string) {
    if (section === "units") return d.calendars.filter((item) => item.unitId === recordId).map((item) => d.processes.find((process) => process.id === item.processId)?.name).join(", ") || "No processes assigned";
    if (section === "people") { const person = d.people.find((item) => item.id === recordId)!; return `${person.role} | ${d.units.filter((unit) => person.unitIds.includes(unit.id)).map((unit) => unit.name).join(", ") || "No units assigned"}`; }
    if (section === "machines") { const machine = machines.find((item) => item.id === recordId)!; return `${machine.code} | ${d.units.find((unit) => unit.id === machine.unitId)?.name} | Setup: ${machine.setupMinutes ?? 0} min | ${machine.active}`; }
    const process = d.processes.find((item) => item.id === recordId);
    const settings = settingsOf(process);
    const units = d.units.filter((unit) => d.calendars.some((calendar) => calendar.unitId === unit.id && calendar.processId === recordId)).map((unit) => unit.name).join(", ") || "No units assigned";
    return `${units} | ${settings.forms.length ? settings.forms.join(", ") : "No dosage form"}${settings.optional ? " · optional" : ""}`;
  }
  return <section className="calendar-admin">
    <div className="view-switch admin-sections" aria-label="Administration section">{sections.filter((item) => showPeople || item.key !== "people").map((item) => <button type="button" key={item.key} aria-pressed={section === item.key} onClick={() => { setSection(item.key); setEditing(null); setPendingDelete(null); setNotice(""); }}>{item.label}</button>)}</div>
    {notice && !pendingDelete ? <p role="status" className="admin-notice">{notice}</p> : null}
    <section ref={editor} className="admin-create-area">
      <div className="panel-title"><h2>{editing ? "Edit" : "Add"} {selectedSection.singular}</h2>{editing ? <button type="button" className="calendar-button" onClick={() => { setEditing(null); setNotice(""); }}>Cancel edit</button> : null}</div>
      <div key={`${section}-${editing ?? "new"}-${version}`}>
        {section === "units" ? <UnitForm directory={d} unitId={editing} onSave={save} /> : null}
        {section === "processes" ? <ProcessForm process={d.processes.find((item) => item.id === editing)} onSave={(process) => save({ ...d, processes: editing ? d.processes.map((item) => item.id === editing ? { ...item, ...process } : item) : [...d.processes, { id: id(), ...process }] })} /> : null}
        {section === "people" ? <PersonForm person={d.people.find((item) => item.id === editing) ?? { id: id(), name: "", role: "production", unitIds: [], teamIds: [], calendarIds: [] }} directory={d} submitLabel={editing ? "Save person & access" : "Add person"} onSave={(person) => save({ ...d, people: editing ? d.people.map((item) => item.id === editing ? person : item) : [...d.people, person] })} /> : null}
        {section === "machines" ? <MachineForm machine={machines.find((item) => item.id === editing) ?? { id: id(), name: "", code: "", unitId: d.units[0]?.id, processIds: [], setupMinutes: 0, workCentreId: workCentres[0]?.id ?? "", active: "Active" }} directory={d} workCentres={workCentres} submitLabel={editing ? "Save machine" : "Add machine"} onSave={(machine) => finish(onMachine(machine), editing ? "Machine saved." : "Machine added.")} /> : null}
      </div>
    </section>
    <section className="admin-saved-area"><h2>Existing {selectedSection.label.toLowerCase()} <span className="badge neutral">{rows.length}</span></h2>
      {pendingDelete ? <div className="admin-delete-confirm" role="alert"><p>Delete <strong>{pendingDelete.name}</strong>?{section === "units" || section === "processes" ? " Unused calendar links and access assignments will also be removed." : ""}</p><button type="button" className="calendar-button" onClick={remove}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => { setPendingDelete(null); setNotice(""); }}>Cancel</button>{notice ? <p className="admin-delete-error">{notice}</p> : null}</div> : null}
      <AdminRows onOpenCalendar={section === "units" ? onOpenCalendar : undefined} rows={rows.map((item) => ({ ...item, detail: summary(item.id) }))} detailLabel={section === "units" ? "Processes" : section === "processes" ? "Units" : "Details"} onEdit={(id) => { setEditing(id); setPendingDelete(null); setNotice(""); }} onDelete={(id) => { setPendingDelete({ id, name: rows.find((item) => item.id === id)!.name }); setNotice(""); }} />
    </section>
  </section>;
}

// A unit: its name, which processes it has, and their order, which is the production route order.
function UnitForm({ directory: d, unitId, onSave }: { directory: CalendarDirectory; unitId: string | null; onSave: (directory: CalendarDirectory) => boolean }) {
  const [processIds, setProcessIds] = useState(d.calendars.filter((calendar) => calendar.unitId === unitId).map((calendar) => calendar.processId));
  const nameOf = (processId: string) => d.processes.find((item) => item.id === processId)?.name ?? "Process";
  const move = (index: number, by: number) => setProcessIds((current) => { const next = [...current]; const [item] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item); return next; });
  return <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave(configureUnit(d, { id: unitId ?? id(), name: value(data, "name") }, processIds, id)); }}><label>Unit name<input name="name" required defaultValue={d.units.find((unit) => unit.id === unitId)?.name} /></label>
    <Checks title="Processes in this unit" items={d.processes} selected={processIds} onChange={(ids) => setProcessIds([...processIds.filter((item) => ids.includes(item)), ...ids.filter((item) => !processIds.includes(item))])} />
    {processIds.length ? <fieldset className="route-order"><legend>Route order</legend>
      <p className="orders-help">Production follows this order. Each dosage form uses the processes ticked for it under Processes.</p>
      <ol>{processIds.map((processId, index) => <li key={processId}><span>{index + 1}. {nameOf(processId)}</span>
        <button type="button" className="icon-button" aria-label={`Move ${nameOf(processId)} up`} title="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className="icon-button" aria-label={`Move ${nameOf(processId)} down`} title="Move down" disabled={index === processIds.length - 1} onClick={() => move(index, 1)}>↓</button></li>)}</ol>
    </fieldset> : null}
    <button type="submit" className="primary-button">{unitId ? "Save unit" : "Add unit"}</button></form>;
}

// A process: its name and how it takes part in production.
function ProcessForm({ process, onSave }: { process?: { name: string; settings?: ProcessSettings }; onSave: (process: { name: string; settings: ProcessSettings }) => void }) {
  const [settings, setSettings] = useState<ProcessSettings>(() => process ? settingsOf(process as { name: string; settings?: ProcessSettings }) : NEW_PROCESS);
  const [error, setError] = useState("");
  return <form className="process-form" onSubmit={(event) => {
    event.preventDefault();
    if (!settings.forms.length && !window.confirm("No dosage form is ticked, so this process is in no route and will not be planned. Save anyway?")) return;
    const name = value(new FormData(event.currentTarget), "name");
    if (!name) { setError("Enter the process name."); return; }
    onSave({ name, settings });
  }}>
    <label>Process name<input name="name" required defaultValue={process?.name} placeholder="e.g. Blending" /></label>
    <fieldset className="access-checks"><legend>Used for dosage forms</legend>{DOSAGE_FORMS.map((form) => <label key={form}><input type="checkbox" checked={settings.forms.includes(form)} onChange={(event) => setSettings({ ...settings, forms: event.target.checked ? [...settings.forms, form] : settings.forms.filter((item) => item !== form) as DosageForm[] })} />{form}</label>)}</fieldset>
    <label className="process-optional"><input type="checkbox" checked={settings.optional} onChange={(event) => setSettings({ ...settings, optional: event.target.checked })} />Optional: some products skip it, with no warning</label>
    <label>Planned quantity from the job order<select value={settings.planned} onChange={(event) => setSettings({ ...settings, planned: event.target.value as PlannedSource })}>{(Object.keys(PLANNED_LABEL) as PlannedSource[]).map((key) => <option key={key} value={key}>{PLANNED_LABEL[key]}</option>)}</select></label>
    <label>Production enters<select value={settings.report} onChange={(event) => setSettings({ ...settings, report: event.target.value as ReportKind })}>{(Object.keys(REPORT_LABEL) as ReportKind[]).map((key) => <option key={key} value={key}>{REPORT_LABEL[key]}</option>)}</select></label>
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" className="primary-button">{process ? "Save process" : "Add process"}</button>
  </form>;
}

function Checks({ title, items, selected, onChange }: { title: string; items: { id: string; name: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="access-checks"><legend>{title}</legend>{items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>;
}
function PersonForm({ person, directory: d, onSave, submitLabel }: { person: CalendarPerson; directory: CalendarDirectory; onSave: (person: CalendarPerson) => void; submitLabel: string }) {
  const [draft, setDraft] = useState({ ...person, processIds: person.processIds ?? d.teams.filter((team) => person.teamIds.includes(team.id)).map((team) => team.processId) });
  return <form className="access-editor" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim(), calendarIds: draft.calendarIds.filter((id) => d.calendars.some((calendar) => calendar.id === id && draft.unitIds.includes(calendar.unitId))) }); }}>
    <div className="admin-inline"><label>Person name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as CalendarPerson["role"] })}><option value="production">Production</option><option value="planner">Planner</option><option value="admin">Administrator</option></select></label></div>
    <Checks title="Assigned units" items={d.units} selected={draft.unitIds} onChange={(unitIds) => setDraft({ ...draft, unitIds })} />
    {draft.role === "production" ? <Checks title="Assigned processes" items={d.processes.filter((process) => d.calendars.some((calendar) => draft.unitIds.includes(calendar.unitId) && calendar.processId === process.id))} selected={draft.processIds} onChange={(processIds) => setDraft({ ...draft, processIds })} /> : null}
    {draft.role === "planner" ? <Checks title="Planner unit & process access" items={d.calendars.filter((calendar) => draft.unitIds.includes(calendar.unitId)).map((calendar) => ({ ...calendar, name: `${d.units.find((unit) => unit.id === calendar.unitId)?.name} / ${d.processes.find((process) => process.id === calendar.processId)?.name}` }))} selected={draft.calendarIds} onChange={(calendarIds) => setDraft({ ...draft, calendarIds })} /> : null}
    <button className="primary-button" type="submit">{submitLabel}</button>
  </form>;
}
function MachineForm({ machine, directory: d, workCentres, onSave, submitLabel }: { machine: Machine; directory: CalendarDirectory; workCentres: WorkCentre[]; onSave: (machine: Machine) => void; submitLabel: string }) {
  const [processIds, setProcessIds] = useState(machine.processIds ?? []);
  const [unitId, setUnitId] = useState(machine.unitId ?? d.units[0]?.id ?? "");
  return <form className="access-editor" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...machine, name: value(data, "name"), code: value(data, "code"), unitId: value(data, "unit"), workCentreId: value(data, "workCentre"), setupMinutes: Number(data.get("setup")), capacity: value(data, "capacity") ? Number(data.get("capacity")) : undefined, capacityUom: value(data, "basis"), active: data.get("active") ? "Active" : "Inactive", processIds }); }}>
    <div className="admin-inline"><label>Machine name<input name="name" required defaultValue={machine.name} /></label><label>Code<input name="code" required defaultValue={machine.code} /></label><label>Unit<select name="unit" value={unitId} onChange={(event) => { setUnitId(event.target.value); setProcessIds([]); }}>{d.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Work centre<select name="workCentre" defaultValue={machine.workCentreId}>{workCentres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></label></div>
    <div className="admin-inline"><label>Setup time (minutes)<input name="setup" type="number" min="0" step="1" required defaultValue={machine.setupMinutes ?? 0} /></label><label>Capacity<input name="capacity" type="number" min="0.000001" step="any" defaultValue={machine.capacity} /></label><label>Capacity unit / basis<input name="basis" defaultValue={machine.capacityUom} /></label><label className="actuals-filter"><input name="active" type="checkbox" defaultChecked={machine.active === "Active"} />Active</label></div>
    <Checks title="Available processes" items={d.processes.filter((process) => d.calendars.some((calendar) => calendar.unitId === unitId && calendar.processId === process.id))} selected={processIds} onChange={setProcessIds} />
    <button className="primary-button" type="submit">{submitLabel}</button>
  </form>;
}
