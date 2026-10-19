/**
 * A report as an Excel workbook: a title row, a caption saying what it covers, then the headings
 * (frozen, with filters) and one row per record numbered 1, 2, 3. Days are real dates shown
 * DD/MM/YYYY and numbers stay numbers, so the sheet can be sorted and summed.
 */
export type ReportColumn = { header: string; width: number; kind?: "text" | "number" | "percent" | "date" };
export type ReportCell = string | number | undefined;

export async function reportWorkbook(columns: ReportColumn[], rows: ReportCell[][], meta: { title: string; caption: string; sheet: string; at: string }) {
  const excel = await import("exceljs");
  const ExcelJS = (excel as unknown as { default?: typeof excel }).default ?? excel;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(meta.sheet.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
  const all: ReportColumn[] = [{ header: "No.", width: 6, kind: "number" }, ...columns];
  sheet.getCell("A1").value = meta.title; sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${meta.caption} · ${rows.length} row${rows.length === 1 ? "" : "s"} · downloaded ${meta.at}`;
  sheet.getRow(4).values = all.map((column) => column.header); sheet.getRow(4).font = { bold: true };
  rows.forEach((row, index) => {
    const added = sheet.addRow([index + 1, ...row.map((value, column) => {
      if (value === undefined || value === "") return "";
      return columns[column].kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : value;
    })]);
    columns.forEach((column, at) => {
      const cell = added.getCell(at + 2);
      if (column.kind === "date") cell.numFmt = "dd/mm/yyyy";
      else if (column.kind === "number") cell.numFmt = "#,##0.###";
      else if (column.kind === "percent") cell.numFmt = "0.0";
    });
  });
  all.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: all.length } };
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" };
  return book;
}

export async function downloadReport(columns: ReportColumn[], rows: ReportCell[][], meta: { title: string; caption: string; sheet: string; at: string; file: string }) {
  const book = await reportWorkbook(columns, rows, meta);
  const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = meta.file; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
