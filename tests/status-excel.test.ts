import { describe, expect, it } from "vitest";
import { statusWorkbook } from "../src/lib/services/statusExcel";

describe("testing and release lists in Excel", () => {
  it("numbers the rows 1, 2, 3 in the list's order, with a title, what it covers, real dates and filters", async () => {
    const row = { pjo: "PJO-00004", product: "Naclear 600mg", batch: "B2609006", job: "JO-00004", po: "PWL005114", customer: "POWERLIFE", outputUom: "boxes", status: "Awaiting testing", remarks: "" };
    const book = await statusWorkbook([{ ...row, date: "2026-10-17", output: 330, finalYield: 98.2 }, { ...row, pjo: "PJO-00002", date: "2026-10-12" }],
      { title: "Testing list", caption: "All statuses · Finished: all dates", dateLabel: "Finished", release: false, at: "19/10/2026 21:00" });
    const sheet = book.worksheets[0];
    expect(sheet.getCell("A1").value).toBe("Testing list");
    expect(String(sheet.getCell("A2").value)).toContain("2 batches");
    expect(sheet.getRow(4).values).toContain("Remarks");
    expect([sheet.getCell("A5").value, sheet.getCell("C5").value, sheet.getCell("A6").value, sheet.getCell("C6").value]).toEqual([1, "PJO-00004", 2, "PJO-00002"]);
    expect(sheet.getCell("B5").value).toBeInstanceOf(Date);
    expect(sheet.autoFilter).toBeTruthy();
  });
});
