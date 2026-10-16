/**
 * The order list as an Excel workbook, for Print summary's Download Excel: a title and what the list
 * covers, then one row per order numbered 1, 2, 3 in the list's order (not the order numbers).
 */
export type OrdersExcelRow = {
  received?: string; customer: string; po: string; reference: string; productCode: string; product: string; format: string;
  quantity: number; uom: string; kg?: number; progress: string; finished?: number; release: string; expected?: string; status: string;
};
export type OrdersExcelLabels = { received: string; po: string; reference: string; expected: string };

export async function ordersWorkbook(rows: OrdersExcelRow[], meta: { title: string; caption: string; sheet: string; labels: OrdersExcelLabels; at: string }) {
  const excel = await import("exceljs");
  const ExcelJS = (excel as unknown as { default?: typeof excel }).default ?? excel;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(meta.sheet, { views: [{ state: "frozen", ySplit: 4 }] });
  const headers = ["No.", meta.labels.received, "Customer", meta.labels.po, meta.labels.reference, "Product code", "Product", "Dosage form", "Order qty", "UOM", "Total kg", "Progress", "Finished", "Testing / release", meta.labels.expected, "Status"];
  sheet.getCell("A1").value = meta.title; sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${meta.caption} · ${rows.length} order${rows.length === 1 ? "" : "s"} · downloaded ${meta.at}`;
  sheet.getRow(4).values = headers; sheet.getRow(4).font = { bold: true };
  const day = (value?: string) => value ? new Date(`${value}T00:00:00Z`) : "";
  rows.forEach((row, index) => {
    const added = sheet.addRow([index + 1, day(row.received), row.customer, row.po, row.reference, row.productCode, row.product, row.format, row.quantity, row.uom, row.kg ?? "", row.progress, row.finished ?? "", row.release, day(row.expected), row.status]);
    added.getCell(2).numFmt = "dd/mm/yyyy"; added.getCell(15).numFmt = "dd/mm/yyyy"; added.getCell(9).numFmt = "#,##0.###"; added.getCell(11).numFmt = "#,##0.###"; added.getCell(13).numFmt = "#,##0";
  });
  [6, 12, 28, 18, 14, 16, 40, 12, 12, 10, 12, 30, 12, 32, 16, 26].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" };
  return book;
}
