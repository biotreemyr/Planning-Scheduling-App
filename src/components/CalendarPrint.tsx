"use client";
import { createPortal } from "react-dom";
import { WEEKDAY_HEADINGS, dayNumber, inMonth, listPrintCells, monthTitle, printDates, printedActivity, printedListActivity, type CalendarPrintInput, type ListPrintInput } from "@/lib/services/calendarPrint";
import { monthDates } from "@/lib/services/planningMonth";
import { formatDate, weekday } from "@/lib/services/dates";

export function CalendarPrint({ title, date, view, lines, products, orders, jobOrders }: CalendarPrintInput) {
  if (typeof document === "undefined") return null;
  const dates = printDates(date, view);
  const activities = (day: string) => lines.filter((line) => line.plannedDate === day).map((line) => {
    const activity = printedActivity(line, products, orders, jobOrders);
    return <article key={line.id}><strong>{activity.productName}</strong>{activity.batch ? <p>{activity.batch}</p> : null}<p>{activity.quantity}</p></article>;
  });
  // A month prints like the calendar on screen: weekday names once along the top (repeated on each
  // printed page), day numbers in the cells, and days of the months either side greyed.
  if (view === "month") return createPortal(<section className="calendar-print-sheet print-month" aria-hidden="true">
    <header><h1>Unit: {title}</h1><p>Month plan · {monthTitle(date)}</p></header>
    <table className="print-month-table">
      <thead><tr>{WEEKDAY_HEADINGS.map((name, index) => <th key={name} className={index > 4 ? "print-weekend" : undefined}>{name}</th>)}</tr></thead>
      <tbody>{Array.from({ length: dates.length / 7 }, (_, week) => <tr key={dates[week * 7]}>{dates.slice(week * 7, week * 7 + 7).map((day, index) => <td key={day} className={[!inMonth(day, date) && "print-other-month", index > 4 && "print-weekend"].filter(Boolean).join(" ") || undefined}>
        <span className="print-day-number">{dayNumber(day)}</span>{activities(day)}
      </td>)}</tr>)}</tbody>
    </table>
  </section>, document.body);
  return createPortal(<section className={`calendar-print-sheet print-${view}`} aria-hidden="true">
    <header><h1>Unit: {title}</h1><p>{view[0].toUpperCase() + view.slice(1)} plan · {`${dates[0]} to ${dates.at(-1)}`}</p></header>
    <div className="print-calendar-grid">{dates.map((day) => <section key={day} className="print-day"><h2>{weekday(day)} {formatDate(day)}</h2>{activities(day)}</section>)}</div>
  </section>, document.body);
}

export function ListPrint({ title, date, lines, products, columns, orders, jobOrders }: ListPrintInput) {
  if (typeof document === "undefined") return null;
  const shown = columns.length ? columns : [{ id: "", name: "No processes to show" }];
  return createPortal(<section className="calendar-print-sheet print-list" aria-hidden="true">
    <header><h1>Unit: {title}</h1><p>Production list · {date.slice(0, 7)}</p></header>
    <table className="print-list-table">
      <thead><tr><th>Date</th>{shown.map((column) => <th key={column.id}>{column.name}</th>)}</tr></thead>
      <tbody>{monthDates(date).map((day) => <tr key={day} className={[0, 6].includes(new Date(`${day}T12:00`).getDay()) ? "print-weekend" : undefined}>
        <th>{weekday(day)} {formatDate(day)}</th>
        {listPrintCells(day, lines, shown).map((cell, index) => <td key={shown[index].id}>{cell.map((line) => {
          const activity = printedListActivity(line, products, orders, jobOrders);
          return <article key={line.id}><strong>{activity.productName}</strong>{activity.batch ? <p>{activity.batch}</p> : null}<p>{activity.detail}</p></article>;
        })}</td>)}
      </tr>)}</tbody>
    </table>
  </section>, document.body);
}
