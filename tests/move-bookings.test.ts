import { describe, expect, it } from "vitest";
import { daysBetween, shiftTimestamp } from "../src/lib/services/scheduling";

describe("moving bookings with their activity", () => {
  it("shifts local and UTC timestamps by whole days, keeping time and format", () => {
    expect(shiftTimestamp("2026-10-05T08:00", 3)).toBe("2026-10-08T08:00");
    expect(shiftTimestamp("2026-10-30T13:30", 4)).toBe("2026-11-03T13:30");
    expect(shiftTimestamp("2026-10-05T00:00:00.000Z", -6)).toBe("2026-09-29T00:00:00.000Z");
  });
  it("counts calendar days between plan dates across month and year ends", () => {
    expect(daysBetween("2026-10-05", "2026-10-13")).toBe(8);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-13", "2026-10-07")).toBe(-6);
  });
});
