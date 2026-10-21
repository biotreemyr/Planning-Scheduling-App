"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarOff, Plus, Trash2, X } from "lucide-react";
import { formatDate } from "@/lib/services/dates";
import { dayStatus, offDayNames, shortDay, type HolidayList, type SpecialDay, type WorkingCalendar } from "@/lib/services/workingDays";

/**
 * Off days for a unit: its weekly off days (set by Admin in Setup), the company's public holidays
 * from Circulo, and the special days planners add: an off day opened for overtime, or a working day
 * closed, each with its reason. Planners, production managers and Admin may add and remove them.
 */
export function OffDaysButton({ unitName, calendar, holidays, canEdit, today, onAdd, onRemove }: {
  unitName: string; calendar: WorkingCalendar; holidays: HolidayList; canEdit: boolean; today: string;
  onAdd: (date: string, kind: SpecialDay["kind"], reason: string) => string;
  onRemove: (id: string) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<SpecialDay["kind"]>("working");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { const box = dialog.current; if (!box) return; if (open && !box.open) box.showModal(); if (!open && box.open) box.close(); }, [open]);
  // A day chosen: offer what it is not yet (an off day can be opened, a working day closed).
  const chosen = date ? dayStatus(calendar, date) : undefined;
  useEffect(() => { if (chosen && !chosen.special) setKind(chosen.working ? "closed" : "working"); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  // Latest day first.
  const special = [...calendar.specialDays].sort((a, b) => b.date.localeCompare(a.date));
  const coming = calendar.holidays.filter((item) => item.date >= today);
  const holidayNote = holidays.status === "ok" ? coming.length ? `${coming.length} coming, from Circulo (QA keeps the list).` : "None coming in Circulo's list yet. QA adds them in Circulo · Controlled System · Public holidays."
    : holidays.status === "unavailable" ? "Circulo's list could not be read just now, so planning does not skip public holidays. Refresh later." : "Not connected to Circulo's list.";

  return <>
    <button type="button" className="calendar-button" onClick={() => { setOpen(true); setMessage(""); }} title="Weekly off days, public holidays, overtime and closed days"><CalendarOff size={16} />Off days</button>
    <dialog ref={dialog} className="activity-dialog off-days-dialog" aria-labelledby="off-days-title" onClose={() => setOpen(false)}>
      {open ? <div className="form-panel">
        <div className="panel-title"><h2 id="off-days-title">Off days · {unitName}</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <p className="orders-help"><strong>Off every week:</strong> {offDayNames(calendar.workingDays)} (Admin sets this in Setup · Units). <strong>Public holidays:</strong> {holidayNote} Planning skips off days; open one below when the team comes in for overtime.</p>
        {canEdit ? <form className="off-days-form" onSubmit={(event) => {
          event.preventDefault();
          const error = onAdd(date, kind, reason);
          if (error) { setMessage(error); return; }
          setMessage(`${shortDay(date)} ${kind === "working" ? "opened as a working day" : "closed"}.`); setDate(""); setReason("");
        }}>
          <label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Change to<select value={kind} onChange={(event) => setKind(event.target.value as SpecialDay["kind"])}>
            <option value="working">Working day (overtime)</option><option value="closed">Closed (no production)</option></select></label>
          <label className="off-days-reason">Reason<input required maxLength={300} value={reason} placeholder={kind === "working" ? "e.g. Overtime for PWL005114" : "e.g. Plant shutdown for maintenance"} onChange={(event) => setReason(event.target.value)} /></label>
          <button type="submit" className="primary-button"><Plus size={16} />Add</button>
          {chosen ? <small className="off-days-chosen">{shortDay(date)} is now {chosen.working ? chosen.kind === "overtime" ? "opened for overtime" : "a working day" : chosen.kind === "holiday" ? `a public holiday (${chosen.label})` : chosen.kind === "closed" ? "closed" : "an off day"}.</small> : null}
        </form> : <p className="orders-help">Planners, production managers and Admin can open or close a day.</p>}
        {message ? <p role="status" className="calendar-notice">{message}</p> : null}
        <h3>Overtime and closed days</h3>
        {special.length ? <div className="route-plan-scroll"><table className="off-days-table"><thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Made</th><th scope="col">Reason</th><th scope="col">Added by</th>{canEdit ? <th scope="col"><span className="admin-sr-only">Remove</span></th> : null}<th scope="col">Remarks</th></tr></thead>
          <tbody>{special.map((item, index) => {
            const holiday = calendar.holidays.find((entry) => entry.date === item.date);
            return <tr key={item.id}><td>{index + 1}</td><td>{shortDay(item.date)}</td><td>{item.kind === "working" ? "Working day" : "Closed"}</td><td>{item.reason}</td><td>{item.addedBy}<small>{formatDate(item.addedAt)}</small></td>
              {canEdit ? <td><button type="button" className="icon-button" aria-label={`Remove ${shortDay(item.date)}`} title="Remove: the day goes back to the week's rule" onClick={() => setMessage(onRemove(item.id) || `${shortDay(item.date)} removed.`)}><Trash2 size={15} /></button></td> : null}
              <td>{holiday ? `Public holiday: ${holiday.name}` : item.date < today ? "Past" : "-"}</td></tr>;
          })}</tbody></table></div> : <p className="orders-help">None yet.</p>}
        {coming.length ? <><h3>Coming public holidays</h3>
          <div className="route-plan-scroll"><table className="off-days-table"><thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Holiday</th><th scope="col">Remarks</th></tr></thead>
            <tbody>{coming.map((item, index) => <tr key={item.date}><td>{index + 1}</td><td>{shortDay(item.date)}</td><td>{item.name}</td><td>{dayStatus(calendar, item.date).kind === "overtime" ? "Opened for overtime" : "-"}</td></tr>)}</tbody></table></div></> : null}
      </div> : null}
    </dialog>
  </>;
}
