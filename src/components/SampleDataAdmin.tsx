"use client";
import { useState } from "react";
import { CalendarDays, Database, RotateCw, Trash2 } from "lucide-react";
import { addSampleData, hasSampleData, removeSampleData } from "@/lib/domain/sampleData";
import type { WorkspaceSnapshot } from "@/lib/domain/workspace";

export function SampleDataAdmin({ snapshot, onApply, onOpenCalendar }: {
  snapshot: WorkspaceSnapshot; onApply: (next: WorkspaceSnapshot) => void; onOpenCalendar: () => void;
}) {
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const loaded = hasSampleData(snapshot);
  const preview = loaded ? removeSampleData(snapshot) : null;
  function load(from: WorkspaceSnapshot) {
    const result = addSampleData(from);
    if (!result.state) { setMessage(result.errors.join(" ")); return false; }
    onApply(result.state);
    return true;
  }
  return <section className="calendar-admin">
    <section className="admin-create-area">
      <div className="panel-title"><h2>Sample data</h2><span className={`badge ${loaded ? "warning" : "neutral"}`}>{loaded ? "Loaded" : "Not loaded"}</span></div>
      <p>Sample data adds two units (Manufacturing and Fermentation Plant, both marked “Sample”), their processes, machines, products, four sample staff and about six weeks of plans dated around today. Sample records can be edited like any other record. Remove them before go-live.</p>
      <p>To plan activities, switch <strong>User</strong> to “Aida (Sample planner)”. To record yields, switch to “Kumar (Sample production)”.</p>
      <div className="calendar-navigation">
        {!loaded ? <button type="button" className="primary-button" onClick={() => { if (load(snapshot)) { setMessage("Sample data loaded."); } }}><Database size={17} />Load sample data</button> : <>
          <button type="button" className="primary-button" onClick={onOpenCalendar}><CalendarDays size={17} />Open sample calendar</button>
          <button type="button" className="calendar-button" onClick={() => { if (load(removeSampleData(snapshot).state)) setMessage("Sample data reloaded with dates around today. Edits to sample records were reset."); }}><RotateCw size={16} />Reload with current dates</button>
          <button type="button" className="calendar-button" onClick={() => { setConfirming(true); setMessage(""); }}><Trash2 size={16} />Remove sample data</button>
        </>}
      </div>
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
