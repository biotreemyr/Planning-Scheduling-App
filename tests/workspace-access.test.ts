import { describe, expect, it } from "vitest";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { capabilitiesFromPermissions } from "../src/lib/auth/capabilities";
import { reviewWorkspaceChange } from "../src/lib/auth/workspaceAccess";

const base = addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state!;
const copy = () => structuredClone(base);
const role = (...keys: string[]) => capabilitiesFromPermissions(keys.map((key) => `scheduler.${key}`));
// Core's live roles (checked against the Core database on 2026-10-03).
const viewer = role("planning.view", "schedule.view", "reports.view");
const production = role("planning.view", "schedule.view");
const planner = role("planning.create", "planning.edit", "planning.view", "reports.view", "schedule.view", "orders.view", "orders.create", "orders.edit");
const manager = role("planning.edit", "planning.view", "reports.view", "schedule.edit", "schedule.view");
const admin = role("orders.create", "orders.edit", "master_data.manage", "planning.create", "planning.edit", "planning.view", "reports.view", "schedule.edit", "schedule.view");
const everything = role("master_data.manage", "planning.create", "planning.edit", "planning.view", "reports.view", "schedule.edit", "schedule.view", "schedule.approve", "schedule.cancel", "schedule.review", "schedule.submit");
const openLine = () => base.data.lines.find((line) => !line.completedAt && !base.data.entries.some((entry) => entry.planLineId === line.id))!;

describe("workspace change review", () => {
  it("allows an unchanged save for anyone with access", () => {
    expect(reviewWorkspaceChange(base, copy(), viewer)).toEqual({ allowed: true, denied: [], summary: [] });
  });
  it("lets planners move activities but not viewers or production", () => {
    const next = copy();
    next.data.lines.find((line) => line.id === openLine().id)!.plannedDate = "2026-10-20";
    expect(reviewWorkspaceChange(base, next, planner).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, next, manager).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, next, viewer).denied).toEqual(["move or edit plan activities"]);
    expect(reviewWorkspaceChange(base, next, production).allowed).toBe(false);
  });
  it("requires planning create to add activities, and orders create to add orders", () => {
    const next = copy();
    next.data.lines.push({ ...openLine(), id: "new-line" });
    next.data.orders.push({ ...base.data.orders[0], id: "new-order", poNumber: "PO-NEW", number: 99 });
    expect(reviewWorkspaceChange(base, next, planner).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, next, manager).denied).toEqual(["add orders", "add plan activities"]);
    const edited = copy();
    edited.data.orders[0].quantity += 1;
    expect(reviewWorkspaceChange(base, edited, role("orders.create")).denied).toEqual(["edit or delete orders"]);
    expect(reviewWorkspaceChange(base, edited, role("orders.edit")).allowed).toBe(true);
  });
  it("lets only testing pass a batch and only release release it", () => {
    const passed = copy();
    Object.assign(passed.data.jobOrders[0], { testedAt: "2026-10-08T10:00:00.000Z", testedBy: "QC" });
    expect(reviewWorkspaceChange(base, passed, role("testing.edit")).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, passed, admin).denied).toEqual(["pass testing"]);
    const released = structuredClone(passed);
    Object.assign(released.data.jobOrders[0], { releaseQuantity: 4100, releaseUom: "boxes", releasedAt: "2026-10-09T10:00:00.000Z", releasedBy: "QA" });
    expect(reviewWorkspaceChange(passed, released, role("release.edit")).allowed).toBe(true);
    expect(reviewWorkspaceChange(passed, released, role("testing.edit")).denied).toEqual(["release batches"]);
  });
  it("requires schedule edit to record results, not planning rights", () => {
    const next = copy();
    const line = next.data.lines.find((item) => item.id === openLine().id)!;
    line.completedAt = "2026-10-08T10:00:00.000Z"; line.yieldQuantity = line.quantity;
    next.data.actuals.push({ calendarId: line.calendarId, planLineId: line.id, teamId: "", actualQuantity: line.quantity, plannedQuantity: line.quantity, uom: line.uom!, productionDate: line.plannedDate, hasDeviation: false, deviation: "", correctiveAction: "", updatedBy: "Test", updatedAt: line.completedAt });
    expect(reviewWorkspaceChange(base, next, manager).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, next, planner).denied).toEqual(["record production results"]);
  });
  it("needs approve to confirm and cancel to cancel a booking", () => {
    const draft = base.data.entries.find((entry) => entry.status === "Confirmed")!;
    const before = copy(); before.data.entries.find((entry) => entry.id === draft.id)!.status = "Draft";
    const confirmed = structuredClone(before); confirmed.data.entries.find((entry) => entry.id === draft.id)!.status = "Confirmed";
    expect(reviewWorkspaceChange(before, confirmed, manager).denied).toEqual(["confirm machine bookings"]);
    expect(reviewWorkspaceChange(before, confirmed, everything).allowed).toBe(true);
    const cancelled = structuredClone(before); cancelled.data.entries.find((entry) => entry.id === draft.id)!.status = "Cancelled";
    expect(reviewWorkspaceChange(before, cancelled, admin).denied).toEqual(["cancel machine bookings"]);
    // Moving an already confirmed booking is ordinary editing.
    const moved = copy(); moved.data.entries.find((entry) => entry.id === draft.id)!.startAt = "2026-10-09T08:00";
    expect(reviewWorkspaceChange(base, moved, manager).allowed).toBe(true);
  });
  it("keeps configuration and sample data to master data managers", () => {
    const next = copy(); next.directory.units[0].name = "Renamed";
    expect(reviewWorkspaceChange(base, next, planner).denied).toEqual(["change units, people, products, machines or measurements"]);
    expect(reviewWorkspaceChange(base, next, admin).allowed).toBe(true);
    // Loading sample data creates confirmed bookings, so it needs approve as well.
    expect(reviewWorkspaceChange(newWorkspace(), base, admin).denied).toContain("confirm machine bookings");
    expect(reviewWorkspaceChange(newWorkspace(), base, everything).allowed).toBe(true);
  });
  it("summarises what changed for the audit log", () => {
    const next = copy();
    next.data.lines.find((line) => line.id === openLine().id)!.plannedDate = "2026-10-20";
    expect(reviewWorkspaceChange(base, next, planner).summary).toEqual(["activities changed: 1"]);
  });
  it("lets production save its progress (start date, notes) but not move the plan", () => {
    const progressed = copy();
    const line = progressed.data.lines.find((item) => item.id === openLine().id)!;
    Object.assign(line, { startedAt: "2026-10-07", productionNotes: "Line stopped 20 minutes for a sieve change." });
    expect(reviewWorkspaceChange(base, progressed, manager).allowed).toBe(true);
    expect(reviewWorkspaceChange(base, progressed, viewer).allowed).toBe(false);
    const moved = structuredClone(progressed);
    moved.data.lines.find((item) => item.id === line.id)!.plannedDate = "2026-10-09";
    expect(reviewWorkspaceChange(progressed, moved, role("schedule.edit")).denied).toContain("move or edit plan activities");
  });
});
