"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { localDateKey } from "@/lib/services/calendarPrint";
import { dateFilterLabel, dayFilter, filterSpan, monthFilter, monthName, rangeFilter, yearFilter, type DateFilter } from "@/lib/services/dateFilter";
import { placeNear } from "./popover";

type Mode = "day" | "month" | "year";
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const shiftMonth = (month: string, by: number) => { const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const count = (n: number | undefined, noun = "order") => n ? `${n} ${noun}${n === 1 ? "" : "s"}` : `No ${noun}s`;

/**
 * A table column's date filter, the way calendar apps pick dates: a day (or two days for a range)
 * on a month calendar, a whole month, or a whole year. Days, months and years that have rows are
 * marked, so it is clear where the orders are.
 */
export function DateFilterPicker({ label, value, onChange, dates }: { label: string; value: DateFilter; onChange: (value: DateFilter) => void; dates: (string | undefined)[] }) {
  const known = dates.filter((date): date is string => !!date).map((date) => date.slice(0, 10));
  const perDay = new Map<string, number>(), perMonth = new Map<string, number>(), perYear = new Map<string, number>();
  for (const day of known) { for (const [map, key] of [[perDay, day], [perMonth, day.slice(0, 7)], [perYear, day.slice(0, 4)]] as const) map.set(key, (map.get(key) ?? 0) + 1); }
  const today = localDateKey(new Date());
  const span = filterSpan(value);
  const start = () => (span?.[0] ?? [...known].sort().at(-1) ?? today).slice(0, 7);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("day");
  const [view, setView] = useState(start);
  // The first day clicked, waiting for a second to make a range.
  const [from, setFrom] = useState<string | null>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Placed once when it opens: picking a day filters the table at once, which reflows the page, and
  // the calendar must stay under the pointer for the second click of a range. Scrolling closes it.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => { const rect = button.current?.getBoundingClientRect(); if (rect) setPlace(placeNear(rect, 300, 400)); };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("wheel", outside, { passive: true });
    document.addEventListener("touchmove", outside, { passive: true });
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("wheel", outside); document.removeEventListener("touchmove", outside); };
  }, [open]);

  function show() { setView(start()); setMode(value.startsWith("m:") ? "month" : value.startsWith("y:") ? "year" : "day"); setFrom(null); setOpen(true); }
  function pick(next: DateFilter, close = true) { onChange(next); if (close) { setOpen(false); button.current?.focus(); } }
  function pickDay(day: string) {
    // First click picks the day and waits; a second click on another day makes it a range.
    if (from && from !== day) { setFrom(null); pick(rangeFilter(from, day)); }
    else { setFrom(day); pick(dayFilter(day), false); }
  }

  const year = view.slice(0, 4);
  const first = new Date(Number(year), Number(view.slice(5, 7)) - 1, 1);
  const blanks = (first.getDay() + 6) % 7;
  const days = new Date(Number(year), Number(view.slice(5, 7)), 0).getDate();
  const inSpan = (day: string) => !!span && day >= span[0] && day <= span[1];
  const years = [...new Set([...perYear.keys(), today.slice(0, 4), year])].sort().reverse();

  return <div className="date-filter" ref={box} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
    <button type="button" ref={button} className={`date-filter-button${value ? " set" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`Filter ${label}: ${dateFilterLabel(value)}`} title={dateFilterLabel(value)} onClick={() => open ? setOpen(false) : show()}>
      <CalendarDays size={14} /><span>{dateFilterLabel(value)}</span>
    </button>
    {value ? <button type="button" className="date-filter-clear" aria-label={`Clear ${label} filter`} title="Clear" onClick={() => pick("")}><X size={13} /></button> : null}
    {open ? <div className="date-filter-panel" role="dialog" aria-label={`${label} filter`} style={place}>
      <div className="date-filter-modes" role="tablist">
        {(["day", "month", "year"] as const).map((item) => <button type="button" role="tab" key={item} aria-selected={mode === item} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      {mode === "day" ? <>
        <div className="date-filter-nav">
          <button type="button" aria-label="Previous month" onClick={() => setView(shiftMonth(view, -1))}><ChevronLeft size={16} /></button>
          <button type="button" className="date-filter-title" title="Pick a whole month" onClick={() => setMode("month")}>{monthName(view, "long")}</button>
          <button type="button" aria-label="Next month" onClick={() => setView(shiftMonth(view, 1))}><ChevronRight size={16} /></button>
        </div>
        <div className="date-filter-grid days" role="grid">
          {WEEKDAYS.map((day) => <span key={day} className="weekday">{day}</span>)}
          {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = `${view}-${pad(index + 1)}`;
            const classes = [perDay.has(day) && "has-rows", day === today && "today", inSpan(day) && "in-span", (day === span?.[0] || day === span?.[1]) && "edge"].filter(Boolean).join(" ");
            return <button type="button" key={day} className={classes} aria-pressed={inSpan(day)} title={`${dateFilterLabel(dayFilter(day))}: ${count(perDay.get(day))}`} onClick={() => pickDay(day)}>{index + 1}</button>;
          })}
        </div>
        <p className="date-filter-hint">{from ? `From ${dateFilterLabel(dayFilter(from))}: click another day for a range.` : "Click a day, or two days for a range."}</p>
      </> : null}
      {mode === "month" ? <>
        <div className="date-filter-nav">
          <button type="button" aria-label="Previous year" onClick={() => setView(shiftMonth(view, -12))}><ChevronLeft size={16} /></button>
          <button type="button" className="date-filter-title" title="Pick a whole year" onClick={() => setMode("year")}>{year}</button>
          <button type="button" aria-label="Next year" onClick={() => setView(shiftMonth(view, 12))}><ChevronRight size={16} /></button>
        </div>
        <div className="date-filter-grid months">
          {MONTHS.map((name, index) => {
            const month = `${year}-${pad(index + 1)}`;
            return <button type="button" key={month} className={[perMonth.has(month) && "has-rows", value === monthFilter(month) && "edge"].filter(Boolean).join(" ")} aria-pressed={value === monthFilter(month)} title={`${monthName(month, "long")}: ${count(perMonth.get(month))}`} onClick={() => pick(monthFilter(month))}>
              {name}<small>{perMonth.get(month) ?? ""}</small></button>;
          })}
        </div>
      </> : null}
      {mode === "year" ? <div className="date-filter-grid years">
        {years.map((item) => <button type="button" key={item} className={[perYear.has(item) && "has-rows", value === yearFilter(item) && "edge"].filter(Boolean).join(" ")} aria-pressed={value === yearFilter(item)} title={`${item}: ${count(perYear.get(item))}`} onClick={() => pick(yearFilter(item))}>
          {item}<small>{count(perYear.get(item))}</small></button>)}
      </div> : null}
      <div className="date-filter-foot">
        {dates.some((date) => !date) ? <button type="button" className={value === "none" ? "active" : undefined} onClick={() => pick("none")}>No date</button> : null}
        <button type="button" onClick={() => pick("")}>Clear</button>
      </div>
    </div> : null}
  </div>;
}
