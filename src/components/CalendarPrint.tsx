"use client";
import { createPortal } from "react-dom";
import { listPrintCells, printDates, printedActivity, printedListActivity, type CalendarPrintInput, type ListPrintInput } from "@/lib/services/calendarPrint";
import { monthDates } from "@/lib/services/planningMonth";

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

export function ListPrint({ title, date, lines, products, columns, orders }: ListPrintInput) {
  if (typeof document === "undefined") return null;
  const shown = columns.length ? columns : [{ id: "", name: "No processes to show" }];
  return createPortal(<section className="calendar-print-sheet print-list" aria-hidden="true">
    <header><h1>Unit: {title}</h1><p>Production list · {date.slice(0, 7)}</p></header>
    <table className="print-list-table">
      <thead><tr><th>Date</th>{shown.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead>
      <tbody>{monthDates(date).map((day) => <tr key={day} className={[0, 6].includes(new Date(`${day}T12:00`).getDay()) ? "print-weekend" : undefined}>
        <th>{new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</th>
        {listPrintCells(day, lines, shown).map((cell, index) => <td key={shown[index].id}>{cell.map((line) => {
          const activity = printedListActivity(line, products, orders);
          return <article key={line.id}><strong>{activity.productName}</strong><p>{activity.detail}</p></article>;
        })}</td>)}
      </tr>)}</tbody>
    </table>
  </section>, document.body);
}
