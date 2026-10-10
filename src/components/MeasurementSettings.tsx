"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AdminRows } from "./AdminRows";
import { batchKilograms } from "@/lib/services/measurements";
import { measurementDefaults } from "@/lib/domain/workspace";
type Option = { name: string; active: boolean };
type Settings = { uoms: Option[]; activities: Option[]; setUoms: (items: Option[]) => void; setActivities: (items: Option[]) => void };
const Context = createContext<Settings | null>(null);
export function useSettings() { const value = useContext(Context); if (!value) throw new Error("Missing measurement settings"); return value; }
export function useUoms() { return useSettings().uoms; }
export function MeasurementProvider({ children, initial = measurementDefaults }: { children: ReactNode; initial?: { uoms: Option[]; activities: Option[] } }) {
  const [uoms, setUoms] = useState(initial.uoms);
  const [activities, setActivities] = useState(initial.activities);
  return <Context.Provider value={{ uoms, setUoms, activities, setActivities }}>{children}</Context.Provider>;
}
// Defaults come from a chosen job order; remount (key) the fields to apply new ones.
export function MeasurementFields({ defaultQuantity, defaultUom }: { defaultQuantity?: number; defaultUom?: string } = {}) {
  const { uoms } = useSettings();
  const [quantity, setQuantity] = useState(defaultQuantity ? String(defaultQuantity) : "100");
  const [selected, setSelected] = useState(defaultUom ?? "");
  const uom = uoms.find((item) => item.name === selected && item.active)?.name ?? uoms.find((item) => item.active)?.name ?? "";
  const [weight, setWeight] = useState("");
  const isMass = ["kg", "g", "mg"].includes(uom);
  const kg = batchKilograms(Number(quantity), uom, Number(weight));
  return <>
    <div className="quantity-fields"><label>Quantity<input name="quantity" type="number" required min={isMass ? "0.000001" : "1"} step={isMass ? "any" : "1"} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
    <label>UOM<select name="uom" required value={uom} onChange={(event) => { setSelected(event.target.value); setWeight(""); }}>{uoms.filter((item) => item.active).map((item) => <option key={item.name}>{item.name}</option>)}</select></label></div>
    {!isMass ? <label>Weight per unit (mg / {uom})<input name="unitWeightMg" type="number" min="0.000001" step="any" placeholder="e.g. 332" value={weight} onChange={(event) => setWeight(event.target.value)} /></label> : null}
    <output className="batch-equivalent" aria-live="polite">Equivalent batch size <strong>{kg === undefined ? "Not specified" : `${kg.toLocaleString("en-MY", { maximumFractionDigits: 9 })} kg`}</strong></output>
  </>;
}
export function MeasurementAdmin({ usedUoms = [], usedActivities = [] }: { usedUoms?: string[]; usedActivities?: string[] }) {
  const { uoms, activities, setUoms, setActivities } = useSettings();
  const [error, setError] = useState("");
  const [section, setSection] = useState<"uoms" | "activities">("uoms");
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const items = section === "uoms" ? uoms : activities;
  const update = section === "uoms" ? setUoms : setActivities;
  const used = section === "uoms" ? usedUoms : usedActivities;
  const singular = section === "uoms" ? "UOM" : "activity type";
  const title = section === "uoms" ? "Units of measure" : "Activity types";
  const protectedName = (name: string) => used.includes(name) || (section === "uoms" && ["kg", "g", "mg"].includes(name));
  return <section className="calendar-admin">
    <div className="view-switch admin-sections" aria-label="Measurement section">{(["uoms", "activities"] as const).map((key) => <button type="button" key={key} aria-pressed={section === key} onClick={() => { setSection(key); setEditing(null); setPendingDelete(null); setError(""); }}>{key === "uoms" ? "Units of measure" : "Activity types"}</button>)}</div>
    <section className="admin-create-area"><div className="panel-title"><h2>{editing ? "Edit" : "Add"} {singular}</h2>{editing ? <button type="button" className="calendar-button" onClick={() => { setEditing(null); setError(""); }}>Cancel edit</button> : null}</div>
      <form key={`${section}-${editing}-${version}`} className="admin-inline" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name")).trim(); const active = data.has("active");
        if (!name || items.some((item) => item.name !== editing && item.name.toLowerCase() === name.toLowerCase())) { setError("Enter a unique name."); return; }
        if (editing && name !== editing && protectedName(editing)) { setError("This option is in use or required for calculations. Keep its name; you can mark it inactive."); return; }
        const next = editing ? items.map((item) => item.name === editing ? { name, active } : item) : [...items, { name, active }];
        if (!next.some((item) => item.active)) { setError("Keep at least one option active."); return; }
        update(next); setEditing(null); setError(""); setVersion((value) => value + 1);
      }}><label>{singular} name<input name="name" required maxLength={60} defaultValue={editing ?? ""} /></label><label className="actuals-filter"><input name="active" type="checkbox" defaultChecked={items.find((item) => item.name === editing)?.active ?? true} />Active</label><button type="submit" className="primary-button">{editing ? "Save" : "Add"} {singular}</button></form>
      {error && !pendingDelete ? <p role="alert">{error}</p> : null}
    </section>
    <section className="admin-saved-area"><h2>Existing {title.toLowerCase()} <span className="badge neutral">{items.length}</span></h2>
      {pendingDelete ? <div className="admin-delete-confirm" role="alert"><p>Delete <strong>{pendingDelete}</strong>?</p><button type="button" className="calendar-button" onClick={() => {
        if (protectedName(pendingDelete)) { setError("This option is in use or required for calculations. Mark it inactive instead of deleting it."); return; }
        const next = items.filter((item) => item.name !== pendingDelete);
        if (!next.some((item) => item.active)) { setError("Keep at least one option active."); return; }
        update(next); setPendingDelete(null); setEditing(null); setError("");
      }}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => { setPendingDelete(null); setError(""); }}>Cancel</button>{error ? <p className="admin-delete-error">{error}</p> : null}</div> : null}
      <AdminRows rows={items.map((item) => ({ id: item.name, name: item.name, detail: item.active ? "Active" : "Inactive" }))} detailLabel="Status" onEdit={(name) => { setEditing(name); setPendingDelete(null); setError(""); }} onDelete={(name) => { setPendingDelete(name); setError(""); }} />
    </section>
  </section>;
}
