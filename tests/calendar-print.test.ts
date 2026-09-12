import { describe, expect, it } from "vitest";
import { printDates, printedActivity } from "../src/lib/services/calendarPrint";
import { seedData } from "../src/lib/seed";
describe("calendar printing dates", () => {
  it("prints only the product name and planned quantity with UOM", () => {
    const line = { ...seedData.planLines[0], calendarId: "ferm", activityType: "Dispensing", uom: "bottles" };
    expect(printedActivity(line, seedData.products)).toEqual({ productName: "Fermented Intermediate Base", quantity: "1,200 bottles" });
    expect(printedActivity({ ...line, uom: undefined }, seedData.products)).toEqual({ productName: "Fermented Intermediate Base", quantity: "1,200 kg" });
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
});
