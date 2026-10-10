// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PlanningList } from "../src/components/PlanningList";
import type { PlanLine, Product } from "../src/lib/domain/types";

const products: Product[] = [{ id: "p1", sku: "P1", name: "Vitamin C", uom: "tablets", productType: "Finished Good", active: "Active" }];
const calendars = [{ id: "dispensing", unitId: "u1", processId: "d", name: "Dispensing" }, { id: "filling", unitId: "u1", processId: "f", name: "Filling" }];
const line = (id: string, extra: Partial<PlanLine> = {}): PlanLine => ({ id, planId: "plan", productId: "p1", quantity: 100, plannedDate: "2026-10-09", priority: "Normal", status: "Unscheduled", calendarId: "dispensing", ...extra });

// jsdom has no layout: the pointer is "over" whichever cell the test names.
let over: Element | null = null;
function pointer(target: EventTarget, type: string, x: number, y: number, pointerType = "mouse") {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: pointerType } });
  act(() => { target.dispatchEvent(event); });
}
const cell = (date: string, calendarId: string) => document.querySelector(`td[data-cell-date="${date}"][data-cell-calendar="${calendarId}"]`)!;

function setup(lines: PlanLine[], canPlan = true) {
  const onMove = vi.fn(() => "Moved.");
  const onSelect = vi.fn();
  document.elementFromPoint = () => over;
  Element.prototype.scrollBy = () => {};
  const view = (items: PlanLine[]) => <PlanningList date="2026-10-01" lines={items} products={[...products]} calendars={[...calendars]} canPlan={canPlan} onMove={onMove} onSelect={onSelect} onCreate={() => {}} />;
  const { rerender } = render(view(lines));
  const card = (id: string) => cell(lines.find((entry) => entry.id === id)!.plannedDate, "dispensing").querySelector<HTMLElement>(".plan-grid-item")!;
  return { onMove, onSelect, card, rerender: (items: PlanLine[]) => act(() => { rerender(view(items)); }) };
}

afterEach(() => { cleanup(); over = null; vi.useRealTimers(); });

describe("dragging in the list view", () => {
  it("moves an activity to the date it is dropped on, with moves and release heard on the window", () => {
    const { onMove, onSelect, card } = setup([line("a")]);
    const item = card("a");
    pointer(item.querySelector(".plan-list-product")!, "pointerdown", 100, 100);
    over = cell("2026-10-12", "dispensing");
    // After pointer-down the card is no longer the event target, as when capture is lost.
    pointer(window, "pointermove", 100, 140);
    pointer(window, "pointermove", 100, 180);
    expect(document.querySelector(".plan-grid-ghost")).not.toBeNull();
    expect(cell("2026-10-12", "dispensing").className).toContain("plan-list-drop-target");
    pointer(window, "pointerup", 100, 180);
    expect(onMove).toHaveBeenCalledWith("a", "2026-10-12");
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector(".plan-grid-ghost")).toBeNull();
  });

  it("survives the grid re-rendering mid-drag", () => {
    const { onMove, card, rerender } = setup([line("a")]);
    pointer(card("a"), "pointerdown", 100, 100);
    over = cell("2026-10-14", "dispensing");
    pointer(window, "pointermove", 100, 160);
    // A parent update (a save finishing, a session refresh) re-renders with fresh arrays.
    rerender([line("a"), line("b", { plannedDate: "2026-10-20" })]);
    pointer(window, "pointermove", 100, 170);
    pointer(window, "pointerup", 100, 170);
    expect(onMove).toHaveBeenCalledWith("a", "2026-10-14");
  });

  it("refuses another process column and explains why", () => {
    const { onMove, card } = setup([line("a")]);
    pointer(card("a"), "pointerdown", 100, 100);
    over = cell("2026-10-12", "filling");
    pointer(window, "pointermove", 160, 160);
    pointer(window, "pointerup", 160, 160);
    expect(onMove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Activities stay in their process");
  });

  it("says a completed activity is locked instead of silently ignoring the drag", () => {
    const { onMove, card } = setup([line("a", { completedAt: "2026-10-09T10:00:00Z" })]);
    pointer(card("a"), "pointerdown", 100, 100);
    pointer(window, "pointermove", 100, 160);
    pointer(window, "pointerup", 100, 160);
    expect(onMove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("is completed, so it is locked");
  });

  it("lets a finger pick a card up by holding it, but a quick swipe still scrolls", () => {
    vi.useFakeTimers();
    const { onMove, card } = setup([line("a")]);
    pointer(card("a"), "pointerdown", 100, 100, "touch");
    pointer(window, "pointermove", 100, 140, "touch");
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector(".plan-grid-ghost")).toBeNull();
    pointer(window, "pointerup", 100, 140, "touch");

    pointer(card("a"), "pointerdown", 100, 100, "touch");
    act(() => { vi.advanceTimersByTime(400); });
    over = cell("2026-10-13", "dispensing");
    pointer(window, "pointermove", 100, 170, "touch");
    pointer(window, "pointerup", 100, 170, "touch");
    expect(onMove).toHaveBeenCalledWith("a", "2026-10-13");
  });
});
