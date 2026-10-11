"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { dateWarnings, type DateCheck } from "@/lib/services/dateChecks";
import { localDateKey } from "@/lib/services/calendarPrint";

/** Check dates before saving: proceed at once when they look right, else after the person confirms. */
export type CheckDates = (checks: DateCheck[], proceed: () => void) => void;

// Without the provider (tests, a lone component) the browser's own confirm stands in.
const fallback: CheckDates = (checks, proceed) => {
  const warnings = dateWarnings(checks, localDateKey(new Date()));
  if (!warnings.length || window.confirm(`Check ${warnings.length === 1 ? "this date" : "these dates"}:\n\n${warnings.join("\n")}\n\nSave anyway?`)) proceed();
};
const Context = createContext<CheckDates>(fallback);
export const useDateCheck = () => useContext(Context);

export function DateCheckProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ warnings: string[]; proceed: () => void } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pending && !dialog.current?.open) dialog.current?.showModal(); }, [pending]);
  const check: CheckDates = (checks, proceed) => {
    const warnings = dateWarnings(checks, localDateKey(new Date()));
    if (warnings.length) setPending({ warnings, proceed }); else proceed();
  };
  const close = (save: boolean) => { const next = pending; dialog.current?.close(); setPending(null); if (save) next?.proceed(); };
  return <Context.Provider value={check}>
    {children}
    {pending ? <dialog ref={dialog} className="activity-dialog date-check-dialog" aria-labelledby="date-check-title" onCancel={(event) => { event.preventDefault(); close(false); }}>
      <div className="date-check">
        <h2 id="date-check-title"><CalendarClock size={20} aria-hidden="true" />Check {pending.warnings.length === 1 ? "this date" : "these dates"}</h2>
        <ul>{pending.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        <p className="route-muted">Go back to change it, or save if the date is right.</p>
        <div className="date-check-buttons">
          <button type="button" className="primary-button" autoFocus onClick={() => close(false)}>Go back</button>
          <button type="button" className="calendar-button" onClick={() => close(true)}>Save anyway</button>
        </div>
      </div>
    </dialog> : null}
  </Context.Provider>;
}
