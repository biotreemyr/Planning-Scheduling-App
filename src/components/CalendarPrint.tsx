"use client";
import { createPortal } from "react-dom";
import { printDates, printedActivity, type CalendarPrintInput } from "@/lib/services/calendarPrint";

export function CalendarPrint({ title, date, view, lines, products, processNames }: CalendarPrintInput) {
  if (typeof document === "undefined") return null;
  const dates = printDates(date, view);
  return createPortal(<section className={`calendar-print-sheet print-${view}`} aria-hidden="true">
    <header><h1>Unit: {title}</h1><p>{view[0].toUpperCase() + view.slice(1)} plan · {view === "month" ? date.slice(0, 7) : `${dates[0]} to ${dates.at(-1)}`}</p></header>
    <div className="print-calendar-grid">{dates.map((day) => <section key={day} className="print-day"><h2>{new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</h2>{lines.filter((line) => line.plannedDate === day).map((line) => {
      const activity = printedActivity(line, products);
      return <article key={line.id}><strong>{activity.productName}</strong><p>{activity.quantity}</p></article>;
    })}</section>)}</div>
  </section>, document.body);
}
