import { describe, expect, it } from "vitest";
import { printDates, printedActivity, singular } from "../src/lib/services/calendarPrint";
import { seedData } from "../src/lib/seed";
describe("calendar printing dates", () => {
  it("prints the product name and planned quantity with UOM, and no batch line without a job order", () => {
    const line = { ...seedData.planLines[0], calendarId: "ferm", activityType: "Dispensing", uom: "bottles" };
    expect(printedActivity(line, seedData.products)).toEqual({ productName: "Fermented Intermediate Base", batch: "", quantity: "1,200 bottles" });
    expect(printedActivity({ ...line, uom: undefined }, seedData.products)).toEqual({ productName: "Fermented Intermediate Base", batch: "", quantity: "1,200 kg" });
    expect(printedActivity(line, []).productName).toBe("Unknown product");
  });
  it("prints a Monday-based week across year boundaries", () => {
    const days = printDates("2027-01-01", "week");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-12-28");
    expect(days[6]).toBe("2027-01-03");
  });
  it("includes all monthly grid days including leap day", () => {
    expect(printDates("2028-02-12", "month")).toContain("2028-02-29");
    expect(printDates("2026-09-12", "month")).toHaveLength(35);
  });
  it("prints only the selected day", () => {
    expect(printDates("2026-09-12", "day")).toEqual(["2026-09-12"]);
    expect(printDates("invalid", "day")).toEqual([]);
  });
  it("prints the job order's batch number, batch quantity and pack size", () => {
    const line = { ...seedData.planLines[0], jobOrderId: "job-1", quantity: 300000, uom: "tablets" };
    const job = { id: "job-1", number: "JO0050", orderId: "order-1", sequence: 1, quantity: 300000, uom: "tablets", batchSizeKg: 75, packQuantity: 10000, packUom: "bottles", packSize: 30, batchNumber: "FA-050", createdAt: "2026-10-01T00:00:00Z", createdBy: "Test" };
    expect(printedActivity(line, seedData.products, [], [job]).batch).toBe("Batch FA-050 · 75 kg · Pack 30 tablets/bottle");
    expect(printedActivity(line, seedData.products, [], [{ ...job, batchNumber: undefined }]).batch).toBe("JO JO0050 · 75 kg · Pack 30 tablets/bottle");
    expect(["boxes", "bottles", "pouches", "carton", "sachets"].map(singular)).toEqual(["box", "bottle", "pouch", "carton", "sachet"]);
  });
});
