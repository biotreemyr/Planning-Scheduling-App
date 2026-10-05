"use client";
import { useState } from "react";
import { CalendarDays, Database, RotateCw, Trash2 } from "lucide-react";
import { FERMENTATION, addSampleData, hasSampleData, removeSampleData } from "@/lib/domain/sampleData";
import type { WorkspaceSnapshot } from "@/lib/domain/workspace";
import { useSettings } from "./MeasurementSettings";

export function SampleDataAdmin({ snapshot, onApply, onOpenCalendar }: {
  snapshot: WorkspaceSnapshot; onApply: (next: WorkspaceSnapshot) => void; onOpenCalendar: () => void;
}) {
  const [message, setMessage] = useState("");
  const { activities, setActivities } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const loaded = hasSampleData(snapshot);
  const preview = loaded ? removeSampleData(snapshot) : null;
  // The fermentation plant is switched off in the sample data; workspaces loaded earlier still have it.
  const plant = !FERMENTATION ? snapshot.directory.units.find((unit) => unit.id === "sample-unit-ferm") : undefined;
  function load(from: WorkspaceSnapshot) {
    const result = addSampleData(from);
    if (!result.state) { setMessage(result.errors.join(" ")); return false; }
    onApply(result.state);
    return true;
  }
  return <section className="calendar-admin">
    <section className="admin-create-area">
      <div className="panel-title"><h2>Sample data</h2><span className={`badge ${loaded ? "warning" : "neutral"}`}>{loaded ? "Loaded" : "Not loaded"}</span></div>
      <p>Sample data adds a Manufacturing unit (marked “Sample”) with its processes, machines, products, sample customers, POs, job orders, two sample staff and about six weeks of plans dated around today. Sample records can be edited like any other record. Remove them before go-live.</p>
      <p>To plan activities, switch <strong>User</strong> to “Aida (Sample planner)”. To record yields, switch to “Kumar (Sample production)”.</p>
      <div className="calendar-navigation">
        {!loaded ? <button type="button" className="primary-button" onClick={() => { if (load(snapshot)) { setMessage("Sample data loaded."); } }}><Database size={17} />Load sample data</button> : <>
          <button type="button" className="primary-button" onClick={onOpenCalendar}><CalendarDays size={17} />Open sample calendar</button>
          <button type="button" className="calendar-button" onClick={() => { if (load(removeSampleData(snapshot).state)) setMessage("Sample data reloaded with dates around today. Edits to sample records were reset."); }}><RotateCw size={16} />Reload with current dates</button>
          <button type="button" className="calendar-button" onClick={() => { setConfirming(true); setMessage(""); }}><Trash2 size={16} />Remove sample data</button>
        </>}
      </div>
      {plant ? <div className="admin-delete-confirm" role="alert">
        <p><strong>{plant.name}</strong> is switched off in the sample data. Remove it, with its machines, staff, products, POs and plans, and keep the rest of the sample data?</p>
        <button type="button" className="calendar-button" onClick={() => {
          const result = removeSampleData(snapshot, [plant.id]);
          // Its activity types are switched off (not deleted) unless other plans still use them; Admin > Measurements can switch them back on.
          const stillUsed = new Set(result.state.data.lines.map((line) => line.activityType));
          setActivities(activities.map((item) => ["Fermentation", "Drying"].includes(item.name) && !stillUsed.has(item.name) ? { ...item, active: false } : item));
          onApply(result.state); setMessage(`${plant.name} removed: ${result.removed.lines} plan lines, ${result.removed.machines} machines, ${result.removed.people} people and ${result.removed.products} products.`); }}><Trash2 size={16} />Remove {plant.name}</button>
      </div> : null}
      {confirming && preview ? <div className="admin-delete-confirm" role="alert">
        <p>Remove {preview.removed.units} sample units, {preview.removed.people} people, {preview.removed.machines} machines, {preview.removed.products} products and {preview.removed.lines} plan lines ({preview.removed.entries} machine bookings)? Plans added inside the sample units are removed too. A daily database backup is kept.</p>
        {preview.kept.length ? <p>Kept because real records use them: {preview.kept.join(", ")}.</p> : null}
        <button type="button" className="calendar-button" onClick={() => { onApply(preview.state); setConfirming(false); setMessage("Sample data removed."); }}>Confirm remove</button>
        <button type="button" className="calendar-button" onClick={() => setConfirming(false)}>Cancel</button>
      </div> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  </section>;
}
