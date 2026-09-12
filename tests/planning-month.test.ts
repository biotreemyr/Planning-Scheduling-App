import { describe, expect, it } from "vitest";
import { monthDates, canMovePlan } from "../src/lib/services/planningMonth";
import type { PlanLine } from "../src/lib/domain/types";

describe("monthly planning list", () => {
  it("includes every date, including empty days, only in the requested month", () => {
    const dates = monthDates("2026-09-12");
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates[29]).toBe("2026-09-30");
    expect(new Set(dates).size).toBe(30);
  });
  it("handles leap years and year boundaries", () => {
    expect(monthDates("2024-02-15")).toHaveLength(29);
    expect(monthDates("2026-02-15")).toHaveLength(28);
    expect(monthDates("2026-12-31").at(-1)).toBe("2026-12-31");
    expect(monthDates("2027-01-01")[0]).toBe("2027-01-01");
    expect(monthDates("invalid")).toEqual([]);
  });
  it("only allows planners to move known, unfinished activities", () => {
    const line = { id: "test" } as PlanLine;
    expect(canMovePlan(line, true)).toBe(true);
    expect(canMovePlan(line, false)).toBe(false);
    expect(canMovePlan(undefined, true)).toBe(false);
    expect(canMovePlan({ ...line, completedAt: "2026-09-12" }, true)).toBe(false);
  });
});
