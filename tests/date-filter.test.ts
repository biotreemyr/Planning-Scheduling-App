import { describe, expect, it } from "vitest";
import { dateFilterLabel, dayFilter, matchesDateFilter, monthFilter, rangeFilter, yearFilter } from "../src/lib/services/dateFilter";

describe("date column filter", () => {
  const dates = ["2026-09-30", "2026-10-01", "2026-10-09", "2026-10-31", "2025-12-31", undefined];
  const kept = (filter: string) => dates.filter((date) => matchesDateFilter(date, filter));
  it("matches a day, a range, a month, a year, no date, or everything", () => {
    expect(kept(dayFilter("2026-10-09"))).toEqual(["2026-10-09"]);
    expect(kept(rangeFilter("2026-10-09", "2026-09-30"))).toEqual(["2026-09-30", "2026-10-01", "2026-10-09"]);
    expect(kept(monthFilter("2026-10"))).toEqual(["2026-10-01", "2026-10-09", "2026-10-31"]);
    expect(kept(yearFilter("2026"))).toEqual(["2026-09-30", "2026-10-01", "2026-10-09", "2026-10-31"]);
    expect(kept("none")).toEqual([undefined]);
    expect(kept("")).toEqual(dates);
    // Timestamps are compared by their day.
    expect(matchesDateFilter("2026-10-09T16:00:00Z", dayFilter("2026-10-09"))).toBe(true);
  });
  it("orders a range either way and treats one day as a day", () => {
    expect(rangeFilter("2026-10-09", "2026-10-01")).toBe("r:2026-10-01..2026-10-09");
    expect(rangeFilter("2026-10-09", "2026-10-09")).toBe("d:2026-10-09");
  });
  it("labels the choice the way the app shows dates", () => {
    expect(["", "none", dayFilter("2026-10-09"), monthFilter("2026-10"), yearFilter("2026"), rangeFilter("2026-10-01", "2026-10-09"), rangeFilter("2025-12-30", "2026-01-02")].map(dateFilterLabel))
      .toEqual(["All dates", "No date", "09/10/2026", "Oct 2026", "2026", "01/10 – 09/10/2026", "30/12/2025 – 02/01/2026"]);
  });
});
