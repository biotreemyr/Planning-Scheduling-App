import { describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { buildCalendarPdf, buildListPdf } from "../src/lib/services/calendarPdf";
import { seedData } from "../src/lib/seed";

describe("calendar PDF", () => {
  for (const view of ["month", "week", "day"] as const) {
    it(`generates the ${view} view from only the supplied calendar records`, () => {
      const pdf = buildCalendarPdf({ title: "Manufacturing", date: "2026-09-14", view, lines: [{ ...seedData.planLines[0], calendarId: "ferm", activityType: "Dispensing", completedAt: "2026-09-14", yieldQuantity: 1100 }], products: seedData.products, processNames: { ferm: "Fermentation" } });
      const content = pdf.output();
      expect(content).toContain("%PDF");
      expect(content).toContain("Unit: Manufacturing");
      expect(content).not.toContain("Manufacturing /");
      // Monthly cells wrap long product names across PDF text runs.
      for (const word of ["Fermented", "Intermediate", "Base"]) expect(content).toContain(word);
      expect(content).toContain("1,200 kg");
      for (const excluded of ["Fermentation", "Dispensing", "PO-1007", "Fully Scheduled", "High", "Fermenter A", "08:00", "Completed", "Yield:"]) expect(content).not.toContain(excluded);
      expect(content).not.toContain("Enzyme Blend");
      expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      if (process.env.CALENDAR_PDF_QA_DIR) { mkdirSync(process.env.CALENDAR_PDF_QA_DIR, { recursive: true }); pdf.save(`${process.env.CALENDAR_PDF_QA_DIR}/${view}.pdf`); }
    });
  }
  it("names the weekdays once along the top of a month, with day numbers in the cells", () => {
    const content = buildCalendarPdf({ title: "Manufacturing", date: "2026-09-14", view: "month", lines: [], products: seedData.products, processNames: {} }).output();
    expect(content).toContain("MONTH PLAN | September 2026");
    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) expect(content).toContain(`(${name})`);
    // Day numbers, not "Mon 14/09/2026" in every cell.
    expect(content).not.toMatch(/\((Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d\/\d\d\/\d{4}\)/);
    expect(content).toContain("(14)");
  });
  it("paginates dense days without dropping the last activity", () => {
    const lines = Array.from({ length: 100 }, (_, index) => ({ ...seedData.planLines[0], id: `line-${index}`, calendarId: "ferm", quantity: 10000 + index }));
    const pdf = buildCalendarPdf({ title: "Manufacturing", date: "2026-09-14", view: "month", lines, products: seedData.products, processNames: { ferm: "Fermentation" } });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output()).toContain("10,099 kg");
  });
  it("prints the list as a month table by process with batch references", () => {
    const columns = [{ id: "disp", name: "Dispensing" }, { id: "pack", name: "Packing" }];
    const lines = [
      { ...seedData.planLines[0], calendarId: "disp", plannedDate: "2026-09-14", orderReference: "Batch 3" },
      { ...seedData.planLines[1], calendarId: "pack", plannedDate: "2026-09-30" },
      { ...seedData.planLines[2], calendarId: "other", plannedDate: "2026-09-15" }
    ];
    const orders = [{ id: "order-1", number: 7, poNumber: "PWL 005144", productId: seedData.products[0].id, quantity: 1200, uom: "kg", expectedDates: {}, createdAt: "2026-09-01T00:00:00Z", createdBy: "Test" }];
    lines[1] = { ...lines[1], productionOrderId: "order-1" };
    const content = buildListPdf({ title: "Manufacturing", date: "2026-09-14", lines, products: seedData.products, columns, orders }).output();
    expect(content).toContain("#7 PWL 005144");
    for (const text of ["Unit: Manufacturing", "PRODUCTION LIST | 2026-09", "Dispensing", "Packing", "Batch 3 · 1,200 kg", "Mon 14/09/2026", "Wed 30/09/2026"]) expect(content).toContain(text);
    expect(content).not.toContain("Enzyme Blend");
  });
  it("paginates a dense list without dropping activities", () => {
    const lines = Array.from({ length: 120 }, (_, index) => ({ ...seedData.planLines[0], id: `line-${index}`, calendarId: "disp", quantity: 10000 + index }));
    const pdf = buildListPdf({ title: "Manufacturing", date: "2026-09-14", lines, products: seedData.products, columns: [{ id: "disp", name: "Dispensing" }] });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output()).toContain("10,119 kg");
  });
});
