import { jsPDF } from "jspdf";
import { listPrintCells, printDates, printedActivity, printedListActivity, type CalendarPrintInput, type ListPrintInput } from "./calendarPrint";
import { monthDates } from "./planningMonth";

export type CalendarPdfInput = CalendarPrintInput;
export function buildCalendarPdf(input: CalendarPdfInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dates = printDates(input.date, input.view);
  const columns = input.view === "month" ? 7 : 1;
  const width = 277 / columns;
  const lineHeight = 3.5;
  const minimumRowHeight = input.view === "month" ? 26 : 18;
  let y = 34;
  function header() {
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text(doc.splitTextToSize(`Unit: ${input.title}`, 275).slice(0, 2), 10, 13);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`${input.view.toUpperCase()} PLAN | ${input.view === "month" ? input.date.slice(0, 7) : `${dates[0]} to ${dates.at(-1)}`}`, 10, 28);
    doc.setFontSize(8);
  }
  header();
  for (let offset = 0; offset < dates.length; offset += columns) {
    const days = dates.slice(offset, offset + columns);
    const contents = days.map((day) => input.lines.filter((line) => line.plannedDate === day).flatMap((line) => {
      const activity = printedActivity(line, input.products);
      const text = [activity.productName, activity.quantity, ""];
      return text.flatMap((part) => doc.splitTextToSize(part.replace(/[\x00-\x08\x0b-\x1f]/g, ""), width - 5) as string[]);
    }));
    let continuation = false;
    do {
      if (y > 196 - minimumRowHeight) { doc.addPage(); header(); y = 34; }
      const maxLines = Math.max(1, Math.floor((196 - y - 11) / lineHeight));
      const count = Math.min(maxLines, Math.max(1, ...contents.map((lines) => lines.length)));
      const height = Math.max(minimumRowHeight, 11 + count * lineHeight);
      days.forEach((day, index) => {
        const x = 10 + index * width;
        doc.setDrawColor(160).setLineWidth(0.2).rect(x, y, width, height);
        doc.setFont("helvetica", "bold").setFontSize(8);
        const label = new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
        doc.text(`${label}${continuation ? " (cont.)" : ""}`, x + 2.5, y + 5);
        doc.setFont("helvetica", "normal").setFontSize(8);
        const chunk = contents[index].splice(0, count);
        chunk.forEach((text, line) => doc.text(text, x + 2.5, y + 10 + line * lineHeight));
      });
      y += height;
      continuation = true;
    } while (contents.some((lines) => lines.length));
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page).setFontSize(8);
    doc.text(`Bio Tree | Page ${page} of ${doc.getNumberOfPages()}`, 10, 204);
  }
  return doc;
}

// Month table: dates down the side, one column per process. Header repeats on every page.
export function buildListPdf(input: ListPrintInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const dates = monthDates(input.date);
  const columns = input.columns.length ? input.columns : [{ id: "", name: "No processes to show" }];
  const dateWidth = 24;
  const width = (277 - dateWidth) / columns.length;
  const lineHeight = 3.3;
  const bottom = 196;
  let y = 0;
  const clean = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f]/g, "");
  function header() {
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text(doc.splitTextToSize(`Unit: ${input.title}`, 275).slice(0, 2), 10, 13);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text(`PRODUCTION LIST | ${input.date.slice(0, 7)}`, 10, 22);
    y = 26;
    // Text drawing resets the fill colour, so set it again for every heading cell.
    const headingCell = (x: number, w: number, text: string) => {
      doc.setFillColor(238, 243, 247).setDrawColor(160).setLineWidth(0.2).rect(x, y, w, 8, "FD");
      doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(8).text(text, x + 1.5, y + 5.3);
    };
    headingCell(10, dateWidth, "Date");
    columns.forEach((column, index) => {
      const x = 10 + dateWidth + index * width;
      headingCell(x, width, (doc.splitTextToSize(clean(column.name), width - 3) as string[])[0]);
    });
    y += 8;
  }
  header();
  for (const day of dates) {
    const cells = listPrintCells(day, input.lines, columns).map((lines) => lines.flatMap((line) => {
      const activity = printedListActivity(line, input.products, input.orders);
      // Measure at the same font and size used to draw, or text spills into the next column.
      const name = doc.setFont("helvetica", "bold").setFontSize(7.5).splitTextToSize(clean(activity.productName), width - 3) as string[];
      const detail = doc.setFont("helvetica", "normal").setFontSize(7).splitTextToSize(clean(activity.detail), width - 3) as string[];
      return [...name, ...detail.map((text) => `\u0000${text}`)];
    }));
    const weekend = [0, 6].includes(new Date(`${day}T12:00`).getDay());
    let continuation = false;
    do {
      if (y > bottom - 10) { doc.addPage(); header(); }
      const maxLines = Math.max(1, Math.floor((bottom - y - 3) / lineHeight));
      const count = Math.min(maxLines, Math.max(1, ...cells.map((lines) => lines.length)));
      const height = Math.max(8, 3 + count * lineHeight);
      doc.setDrawColor(160).setLineWidth(0.2);
      if (weekend) doc.setFillColor(245, 246, 244).rect(10, y, dateWidth + width * columns.length, height, "F");
      doc.rect(10, y, dateWidth, height);
      doc.setFont("helvetica", "bold").setFontSize(8);
      doc.text(`${new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}${continuation ? " (cont.)" : ""}`, 12, y + 4.5);
      cells.forEach((lines, index) => {
        const x = 10 + dateWidth + index * width;
        doc.rect(x, y, width, height);
        lines.splice(0, count).forEach((text, line) => {
          const detail = text.startsWith("\u0000");
          doc.setFont("helvetica", detail ? "normal" : "bold").setFontSize(detail ? 7 : 7.5);
          doc.text(detail ? text.slice(1) : text, x + 1.5, y + 4 + line * lineHeight);
        });
      });
      y += height;
      continuation = true;
    } while (cells.some((lines) => lines.length));
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page).setFont("helvetica", "normal").setFontSize(8);
    doc.text(`Bio Tree | Page ${page} of ${doc.getNumberOfPages()}`, 10, 204);
  }
  return doc;
}
