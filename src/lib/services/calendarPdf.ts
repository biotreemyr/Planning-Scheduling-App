import { jsPDF } from "jspdf";
import { printDates, printedActivity, type CalendarPrintInput } from "./calendarPrint";

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
