/**
 * The QA/QC Testing or Release list as an Excel workbook: a title and what the list covers, then one
 * row per batch numbered 1, 2, 3 in the list's order, with real dates and numbers and filters on the
 * headings.
 */
export type StatusExcelRow = {
  date?: string; pjo: string; product: string; batch: string; job: string; po: string; customer: string;
  output?: number; outputUom: string; finalYield?: number; status: string; release?: string; remarks: string;
};

export async function statusWorkbook(rows: StatusExcelRow[], meta: { title: string; caption: string; dateLabel: string; release: boolean; at: string }) {
  const excel = await import("exceljs");
  const ExcelJS = (excel as unknown as { default?: typeof excel }).default ?? excel;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(meta.title, { views: [{ state: "frozen", ySplit: 4 }] });
  const headers = ["No.", meta.dateLabel, "PJO no.", "Product", "Batch no.", "Job order no.", "PO", "Customer", "Final output", "UOM", "Final yield %", meta.release ? "Testing result" : "Status", ...(meta.release ? ["Release quantity"] : []), "Remarks"];
  sheet.getCell("A1").value = meta.title; sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${meta.caption} · ${rows.length} batch${rows.length === 1 ? "" : "es"} · downloaded ${meta.at}`;
  sheet.getRow(4).values = headers; sheet.getRow(4).font = { bold: true };
  const day = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : "";
  rows.forEach((row, index) => {
    const added = sheet.addRow([index + 1, day(row.date), row.pjo, row.product, row.batch, row.job, row.po, row.customer, row.output ?? "", row.outputUom, row.finalYield ?? "", row.status, ...(meta.release ? [row.release ?? ""] : []), row.remarks]);
    added.getCell(2).numFmt = "dd/mm/yyyy"; added.getCell(9).numFmt = "#,##0.###"; added.getCell(11).numFmt = "0.0";
  });
  [6, 12, 14, 44, 12, 14, 14, 30, 14, 10, 12, 20, ...(meta.release ? [22] : []), 36].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" };
  return book;
}
