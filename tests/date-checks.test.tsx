// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { dateWarning, dateWarnings, RECENT_DAYS } from "../src/lib/services/dateChecks";
import { DateCheckProvider, useDateCheck } from "../src/components/DateCheck";
import { localDateKey } from "../src/lib/services/calendarPrint";

const today = "2026-10-11";
afterEach(cleanup);

describe("date checks", () => {
  it("catches the wrong month for a date that is usually today, and suggests today", () => {
    expect(dateWarning({ label: "PO received date", value: "2026-09-11", rule: "today" }, today)).toBe("PO received date is 11/09/2026, 30 days ago. Did you mean 11/10/2026?");
    // The wrong year too.
    expect(dateWarning({ label: "Date completed", value: "2025-10-11", rule: "today" }, today)).toBe("Date completed is 11/10/2025, 365 days ago. Did you mean 11/10/2026?");
  });
  it(`lets a recent date through: within ${RECENT_DAYS} days for usually-today dates`, () => {
    expect(dateWarnings([{ label: "PO received date", value: "2026-10-04", rule: "today" }, { label: "Date started", value: today, rule: "today" }], today)).toEqual([]);
    expect(dateWarning({ label: "PO received date", value: "2026-10-03", rule: "today" }, today)).toBe("PO received date is 03/10/2026, 8 days ago.");
  });
  it("questions planning before today and deliveries already passed or before the PO", () => {
    expect(dateWarning({ label: "Blending date", value: "2026-10-10", rule: "plan" }, today)).toBe("Blending date is 10/10/2026, 1 day ago: planned in the past.");
    expect(dateWarning({ label: "Blending date", value: today, rule: "plan" }, today)).toBe("");
    expect(dateWarning({ label: "Expected customer delivery", value: "2026-10-01", rule: "delivery" }, today)).toBe("Expected customer delivery is 01/10/2026, which has already passed.");
    expect(dateWarning({ label: "Expected customer delivery", value: "2026-10-20", rule: "delivery", after: { label: "the PO received date", value: "2026-10-25" } }, today)).toBe("Expected customer delivery 20/10/2026 is before the PO received date 25/10/2026.");
  });
  it("leaves alone a date that was not changed, or not keyed in", () => {
    expect(dateWarning({ label: "PO received date", value: "2026-08-01", rule: "today", was: "2026-08-01" }, today)).toBe("");
    expect(dateWarning({ label: "PO received date", value: "", rule: "today" }, today)).toBe("");
    expect(dateWarning({ label: "Date completed", value: "2026-08-01", rule: "today", was: "2026-08-02" }, today)).not.toBe("");
  });
  it("holds the save until Save anyway, and drops it on Go back", () => {
    const saved = vi.fn();
    const old = localDateKey(new Date(Date.now() - 40 * 86_400_000));
    function Form() { const check = useDateCheck(); return <button type="button" onClick={() => check([{ label: "PO received date", value: old, rule: "today" }], saved)}>Save</button>; }
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
    const view = render(<DateCheckProvider><Form /></DateCheckProvider>);
    fireEvent.click(view.getByText("Save"));
    expect(saved).not.toHaveBeenCalled();
    expect(view.getByRole("heading").textContent).toBe("Check this date");
    fireEvent.click(view.getByText("Go back"));
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(view.getByText("Save"));
    fireEvent.click(view.getByText("Save anyway"));
    expect(saved).toHaveBeenCalledTimes(1);
  });
  it("saves a plan date before today only with a reason, and passes the reason on", () => {
    const saved = vi.fn();
    const old = localDateKey(new Date(Date.now() - 20 * 86_400_000));
    function Form() { const check = useDateCheck(); return <button type="button" onClick={() => check([{ label: "Capsulation date", value: old, rule: "plan" }], saved)}>Save</button>; }
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
    const view = render(<DateCheckProvider><Form /></DateCheckProvider>);
    fireEvent.click(view.getByText("Save"));
    const save = view.getByText("Save with reason") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(view.getByText("Keying in past production records"));
    fireEvent.click(view.getByText("Save with reason"));
    expect(saved).toHaveBeenCalledWith("Keying in past production records");
  });
  it("asks production for a reason for any plan change, even a date that looks fine", () => {
    const saved = vi.fn();
    const later = localDateKey(new Date(Date.now() + 5 * 86_400_000));
    function Form() { const check = useDateCheck(); return <button type="button" onClick={() => check([{ label: "Capsulation date", value: later, rule: "plan", was: localDateKey(new Date()) }], saved, { reason: "always" })}>Save</button>; }
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
    const view = render(<DateCheckProvider><Form /></DateCheckProvider>);
    fireEvent.click(view.getByText("Save"));
    expect(view.getByRole("heading").textContent).toBe("Reason for the plan change");
    fireEvent.click(view.getByText("Machine breakdown"));
    fireEvent.click(view.getByText("Save with reason"));
    expect(saved).toHaveBeenCalledWith("Machine breakdown");
  });
});
