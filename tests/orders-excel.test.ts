import { describe, expect, it } from "vitest";
import { ordersWorkbook } from "../src/lib/services/ordersExcel";

describe("orders in Excel", () => {
  it("lists the orders numbered 1, 2, 3 under a title and what the list covers", async () => {
    const row = (po: string, extra = {}) => ({ received: "2026-10-05", customer: "POWERLIFE (M) SDN. BHD.", po, reference: "SO1", productCode: "FG-1", product: "Vitamin C", format: "Tablet", quantity: 2000, uom: "boxes", progress: "Not scheduled", release: "-", status: "Not scheduled", ...extra });
    const book = await ordersWorkbook([row("PWL005331"), row("PWL005114", { status: "Closed · 2,006 of 2,000 boxes (+6)" })], { title: "Customer orders", caption: "All orders · PO received: all dates", sheet: "Customer orders", at: "16/10/2026 20:00",
      labels: { received: "PO received", po: "PO number", reference: "SO number", expected: "Expected delivery" } });
    const sheet = book.getWorksheet("Customer orders")!;
    expect(sheet.getCell("A1").value).toBe("Customer orders");
    expect(sheet.getCell("A2").value).toBe("All orders · PO received: all dates · 2 orders · downloaded 16/10/2026 20:00");
    expect((sheet.getRow(4).values as unknown[]).slice(1, 5)).toEqual(["No.", "PO received", "Customer", "PO number"]);
    expect([sheet.getCell("A5").value, sheet.getCell("D5").value, sheet.getCell("A6").value, sheet.getCell("P6").value]).toEqual([1, "PWL005331", 2, "Closed · 2,006 of 2,000 boxes (+6)"]);
    expect(sheet.getCell("B5").numFmt).toBe("dd/mm/yyyy");
    expect((await book.xlsx.writeBuffer()).byteLength).toBeGreaterThan(1000);
  });
});
