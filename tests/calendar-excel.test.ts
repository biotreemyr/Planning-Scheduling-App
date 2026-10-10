import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCalendarWorkbook, buildListWorkbook } from "../src/lib/services/calendarExcel";
import { seedData } from "../src/lib/seed";

const job = { id: "job-1", number: "JO0050", orderId: "order-1", sequence: 1, quantity: 300000, uom: "tablets", batchSizeKg: 75, packQuantity: 10000, packUom: "bottles", packSize: 30, batchNumber: "FA-050", createdAt: "2026-10-01T00:00:00Z", createdBy: "Test" };
const orders = [{ id: "order-1", number: 7, poNumber: "PO-2610-142", customerName: "Kinabalu Pharmacy", productId: seedData.products[0].id, quantity: 600000, uom: "tablets", expectedDates: {}, createdAt: "2026-09-01T00:00:00Z", createdBy: "Test" }];
const lines = [
  { ...seedData.planLines[0], id: "a", calendarId: "disp", plannedDate: "2026-10-19", activityType: "Dispensing", quantity: 75, uom: "kg", jobOrderId: "job-1", productionOrderId: "order-1" },
  { ...seedData.planLines[0], id: "b", calendarId: "pack", plannedDate: "2026-10-23", activityType: "Packing", quantity: 10000, uom: "bottles", jobOrderId: "job-1", productionOrderId: "order-1" }
];
const reload = async (book: ExcelJS.Workbook) => { const copy = new ExcelJS.Workbook(); await copy.xlsx.load(await book.xlsx.writeBuffer()); return copy; };

describe("schedule as Excel", () => {
  it("lays the list out like the PDF, with batch details, plus a filterable schedule sheet", async () => {
    const book = await reload(buildListWorkbook(ExcelJS, { title: "Manufacturing", date: "2026-10-01", lines, products: seedData.products, columns: [{ id: "disp", name: "Dispensing" }, { id: "pack", name: "Packing" }], orders, jobOrders: [job] }));
    const list = book.getWorksheet("Production list")!;
    expect(list.getCell("A1").value).toBe("Unit: Manufacturing");
    expect(list.getCell("A2").value).toBe("PRODUCTION LIST | 2026-10");
    expect([list.getCell("A4").value, list.getCell("B4").value, list.getCell("C4").value]).toEqual(["Date", "Dispensing", "Packing"]);
    const dispensing = String(list.getRow(4 + 19).getCell(2).value);
    expect(dispensing).toContain("Batch FA-050 · 75 kg · Pack 30 tablets/bottle");
    expect(dispensing).toContain("#7 PO-2610-142 · 75 kg");
    const schedule = book.getWorksheet("Schedule")!;
    expect(schedule.getRow(1).values).toContain("Batch no.");
    const first = schedule.getRow(2);
    expect([first.getCell(3).value, first.getCell(6).value, first.getCell(7).value, first.getCell(8).value, first.getCell(9).value, first.getCell(10).value]).toEqual(["Dispensing", "FA-050", 75, "30 tablets/bottle", 75, "kg"]);
    expect(schedule.rowCount).toBe(3);
  });
  it("lays the calendar out as weeks, like the calendar PDF", async () => {
    const book = await reload(buildCalendarWorkbook(ExcelJS, { title: "Manufacturing", date: "2026-10-01", view: "month", lines, products: seedData.products, processNames: {}, orders, jobOrders: [job] }));
    const sheet = book.getWorksheet("Month plan")!;
    expect(sheet.getCell("A2").value).toBe("MONTH PLAN | October 2026");
    // Weekdays head the columns once; each cell names its day by number only.
    expect(sheet.getRow(4).values).toEqual([, "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    // 19 Oct 2026 is the Monday of the fourth week row.
    expect(String(sheet.getCell("A8").value)).toMatch(/^19\n\n[\s\S]*Batch FA-050/);
    expect(String(sheet.getCell("A5").value)).toBe("28");
  });
});
