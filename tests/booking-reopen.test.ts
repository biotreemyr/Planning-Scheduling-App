import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../src/lib/domain/types";
import { reopenMovedBookings } from "../src/lib/services/planChanges";

const entry = (extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id: "e1", calendarId: "c", planLineId: "l", productId: "p", workCentreId: "w", machineId: "m1", startAt: "2026-10-20T08:00", endAt: "2026-10-20T17:00", status: "Confirmed", ...extra });

describe("a confirmed booking moved by someone who cannot approve", () => {
  it("goes back to Draft, to be confirmed again", () => {
    expect(reopenMovedBookings([entry()], [entry({ startAt: "2026-10-21T08:00", endAt: "2026-10-21T17:00" })], false)[0].status).toBe("Draft");
    expect(reopenMovedBookings([entry()], [entry({ machineId: "m2" })], false)[0].status).toBe("Draft");
  });
  it("stays confirmed for an approver, or when only its status or notes change", () => {
    expect(reopenMovedBookings([entry()], [entry({ machineId: "m2" })], true)[0].status).toBe("Confirmed");
    const after = [entry({ notes: "Clean first" })];
    expect(reopenMovedBookings([entry()], after, false)).toBe(after);
  });
});
