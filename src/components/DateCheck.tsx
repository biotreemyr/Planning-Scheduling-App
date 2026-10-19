"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { dateWarnings, needsPastReason, type DateCheck } from "@/lib/services/dateChecks";
import { localDateKey } from "@/lib/services/calendarPrint";

/**
 * Check dates before saving: proceed at once when they look right, else after the person confirms.
 * A plan date before today also needs a reason, passed on to `proceed` to keep with the plan.
 */
export type CheckDates = (checks: DateCheck[], proceed: (reason?: string) => void) => void;
// Reasons offered with one click; any other can be typed.
const PAST_REASONS = ["Keying in past production records", "Plan corrected to the day it actually ran"];

// Without the provider (tests, a lone component) the browser's own confirm stands in.
const fallback: CheckDates = (checks, proceed) => {
  const warnings = dateWarnings(checks, localDateKey(new Date()));
  if (!warnings.length) { proceed(); return; }
  if (needsPastReason(checks, localDateKey(new Date()))) {
    const reason = window.prompt(`${warnings.join("\n")}\n\nWhy is it planned in the past?`)?.trim();
    if (reason) proceed(reason);
    return;
  }
  if (window.confirm(`Check ${warnings.length === 1 ? "this date" : "these dates"}:\n\n${warnings.join("\n")}\n\nSave anyway?`)) proceed();
};
const Context = createContext<CheckDates>(fallback);
export const useDateCheck = () => useContext(Context);

export function DateCheckProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ warnings: string[]; proceed: (reason?: string) => void; reasonNeeded: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pending && !dialog.current?.open) dialog.current?.showModal(); }, [pending]);
  const check: CheckDates = (checks, proceed) => {
    const warnings = dateWarnings(checks, localDateKey(new Date()));
    if (warnings.length) { setReason(""); setPending({ warnings, proceed, reasonNeeded: needsPastReason(checks, localDateKey(new Date())) }); } else proceed();
  };
  const close = (save: boolean) => { const next = pending; dialog.current?.close(); setPending(null); if (save) next?.proceed(next.reasonNeeded ? reason.trim() : undefined); };
  return <Context.Provider value={check}>
    {children}
    {pending ? <dialog ref={dialog} className="activity-dialog date-check-dialog" aria-labelledby="date-check-title" onCancel={(event) => { event.preventDefault(); close(false); }}>
      <div className="date-check">
        <h2 id="date-check-title"><CalendarClock size={20} aria-hidden="true" />Check {pending.warnings.length === 1 ? "this date" : "these dates"}</h2>
        <ul>{pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        {pending.reasonNeeded ? <div className="date-check-reason">
          <label>Reason for planning in the past<textarea value={reason} maxLength={300} rows={3} placeholder="e.g. Keying in past production records" onChange={(event) => setReason(event.target.value)} /></label>
          <div className="choice-chips">{PAST_REASONS.map((text) => <button key={text} type="button" className={`choice-chip${reason === text ? " selected" : ""}`} aria-pressed={reason === text} onClick={() => setReason(text)}>{text}</button>)}</div>
          <p className="route-muted">The reason is kept with the plan and shows in the audit trail.</p>
        </div> : <p className="route-muted">Go back to change it, or save if the date is right.</p>}
        <div className="date-check-buttons">
          <button type="button" className="primary-button" autoFocus onClick={() => close(false)}>Go back</button>
          <button type="button" className="calendar-button" disabled={pending.reasonNeeded && !reason.trim()} onClick={() => close(true)}>{pending.reasonNeeded ? "Save with reason" : "Save anyway"}</button>
        </div>
      </div>
    </dialog> : null}
  </Context.Provider>;
}
