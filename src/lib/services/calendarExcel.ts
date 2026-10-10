import type { Workbook, Worksheet } from "exceljs";
import { WEEKDAY_HEADINGS, dayNumber, listPrintCells, periodLabel, printDates, printedActivity, printedListActivity, scheduleDetail, type CalendarPrintInput, type ListPrintInput } from "./calendarPrint";
import { monthDates } from "./planningMonth";
import type { PlanLine } from "@/lib/domain/types";
import { formatDate, weekday } from "./dates";

/**
 * The planner's print, as an Excel workbook. Sheet 1 follows the PDF's layout (the month list by
 * process, or the calendar grid); sheet 2, "Schedule", has one row per activity with its batch
 * number, batch quantity and pack size, for filtering and sorting.
 */
type ExcelModule = { Workbook: new () => Workbook };

const HEADING = "FFEEF3F7", WEEKEND = "FFF5F6F4", BORDER = "FFA0A0A0";
const border = { style: "thin" as const, color: { argb: BORDER } };
const boxed = { top: border, left: border, bottom: border, right: border };
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00`).toLocaleDateString("en-GB", options);

function sheetTitle(sheet: Worksheet, title: string, subtitle: string, width: number) {
  sheet.getCell(1, 1).value = `Unit: ${title}`;
  sheet.getCell(1, 1).font = { bold: true, size: 15 };
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { size: 10 };
  sheet.mergeCells(1, 1, 1, width);
  sheet.mergeCells(2, 1, 2, width);
}
function headingRow(sheet: Worksheet, row: number, labels: string[]) {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = label; cell.font = { bold: true }; cell.border = boxed;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADING } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}
// Landscape A4, one page wide, heading rows repeated on every printed page.
function pageSetup(sheet: Worksheet, headingRowNumber: number) {
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headingRowNumber}:${headingRowNumber}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
  sheet.headerFooter = { oddFooter: "Bio Tree | Page &P of &N" };
}
const activityText = (parts: string[]) => parts.filter(Boolean).join("\n");

function scheduleSheet(book: Workbook, input: Pick<CalendarPrintInput, "products" | "orders" | "jobOrders">, lines: PlanLine[]) {
  const sheet = book.addWorksheet("Schedule", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Date", key: "date", width: 12 }, { header: "Day", key: "day", width: 6 }, { header: "Process", key: "process", width: 14 },
    { header: "Product", key: "product", width: 36 }, { header: "Job order", key: "job", width: 14 }, { header: "Batch no.", key: "batch", width: 14 },
    { header: "Batch qty (kg)", key: "kg", width: 13 }, { header: "Pack size", key: "pack", width: 20 }, { header: "Quantity", key: "quantity", width: 12 },
    { header: "UOM", key: "uom", width: 10 }, { header: "PO number", key: "po", width: 16 }, { header: "Customer", key: "customer", width: 26 },
    { header: "Priority", key: "priority", width: 10 }, { header: "Status", key: "status", width: 16 }
  ];
  headingRow(sheet, 1, sheet.columns.map((column) => String(column.header)));
  for (const line of [...lines].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.activityType ?? "").localeCompare(b.activityType ?? ""))) {
    const detail = scheduleDetail(line, input.products, input.orders, input.jobOrders);
    const job = input.jobOrders?.find((item) => item.id === line.jobOrderId);
    const row = sheet.addRow({
      date: new Date(`${line.plannedDate}T00:00:00Z`), day: dayLabel(line.plannedDate, { weekday: "short" }), process: detail.process, product: detail.productName,
      job: detail.jobNumber || detail.reference, batch: detail.batchNumber, kg: job?.batchSizeKg ?? null, pack: detail.packSize,
      quantity: detail.quantityValue, uom: detail.uom, po: detail.poNumber, customer: detail.customer, priority: detail.priority, status: detail.status
    });
    row.getCell("date").numFmt = "dd/mm/yyyy";
    row.getCell("quantity").numFmt = "#,##0.###";
    row.getCell("kg").numFmt = "#,##0.###";
    row.eachCell((cell) => { cell.border = boxed; });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  pageSetup(sheet, 1);
}

// Month table: dates down the side, one column per process, as in the list PDF.
export function buildListWorkbook(excel: ExcelModule, input: ListPrintInput) {
  const book = new excel.Workbook();
  book.creator = "Bio Tree Scheduler";
  const columns = input.columns.length ? input.columns : [{ id: "", name: "No processes to show" }];
  const sheet = book.addWorksheet("Production list", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  sheetTitle(sheet, input.title, `PRODUCTION LIST | ${input.date.slice(0, 7)}`, columns.length + 1);
  headingRow(sheet, 4, ["Date", ...columns.map((column) => column.name)]);
  sheet.getColumn(1).width = 14;
  columns.forEach((_, index) => { sheet.getColumn(index + 2).width = 34; });
  const dates = monthDates(input.date);
  dates.forEach((day, offset) => {
    const row = sheet.getRow(5 + offset);
    row.getCell(1).value = `${weekday(day)} ${formatDate(day)}`;
    row.getCell(1).font = { bold: true };
    listPrintCells(day, input.lines, columns).forEach((lines, index) => {
      row.getCell(index + 2).value = lines.map((line) => { const activity = printedListActivity(line, input.products, input.orders, input.jobOrders); return activityText([activity.productName, activity.batch, activity.detail]); }).join("\n\n");
    });
    const weekend = [0, 6].includes(new Date(`${day}T12:00`).getDay());
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = boxed; cell.alignment = { vertical: "top", wrapText: true };
      if (weekend) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WEEKEND } };
    });
  });
  pageSetup(sheet, 4);
  const monthLines = input.lines.filter((line) => dates.includes(line.plannedDate) && columns.some((column) => column.id === line.calendarId));
  scheduleSheet(book, input, monthLines);
  return book;
}

// Calendar grid: a week per row (month and week) or a single day, as in the calendar PDF.
export function buildCalendarWorkbook(excel: ExcelModule, input: CalendarPrintInput) {
  const book = new excel.Workbook();
  book.creator = "Bio Tree Scheduler";
  const dates = printDates(input.date, input.view);
  const perRow = input.view === "day" ? 1 : 7;
  const sheet = book.addWorksheet(`${input.view[0].toUpperCase()}${input.view.slice(1)} plan`, { views: [{ state: "frozen", ySplit: 4 }] });
  sheetTitle(sheet, input.title, `${input.view.toUpperCase()} PLAN | ${periodLabel(input.date, input.view, dates)}`, perRow);
  headingRow(sheet, 4, perRow === 1 ? [dayLabel(dates[0] ?? input.date, { weekday: "long" })] : WEEKDAY_HEADINGS);
  for (let column = 1; column <= perRow; column++) sheet.getColumn(column).width = perRow === 1 ? 80 : 30;
  for (let offset = 0; offset < dates.length; offset += perRow) {
    const row = sheet.getRow(5 + offset / perRow);
    dates.slice(offset, offset + perRow).forEach((day, index) => {
      const activities = input.lines.filter((line) => line.plannedDate === day).map((line) => { const activity = printedActivity(line, input.products, input.orders, input.jobOrders); return activityText([activity.productName, activity.batch, activity.quantity]); });
      const cell = row.getCell(index + 1);
      // The weekday heads the column, so a week row names each day by its number alone.
      cell.value = [perRow === 7 ? dayNumber(day) : `${weekday(day)} ${formatDate(day)}`, ...activities].join("\n\n");
      cell.border = boxed; cell.alignment = { vertical: "top", wrapText: true };
      // Days outside the month are greyed, as on the calendar.
      if (input.view === "month" && day.slice(0, 7) !== input.date.slice(0, 7)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WEEKEND } };
    });
  }
  pageSetup(sheet, 4);
  scheduleSheet(book, input, input.lines.filter((line) => dates.includes(line.plannedDate)));
  return book;
}

export async function downloadWorkbook(book: Workbook, fileName: string) {
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
