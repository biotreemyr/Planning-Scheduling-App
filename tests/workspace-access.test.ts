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
const everything = role("orders.create", "orders.edit", "master_data.manage", "planning.create", "planning.edit", "planning.view", "reports.view", "schedule.edit", "schedule.view", "schedule.approve", "schedule.cancel", "schedule.review", "schedule.submit");
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
    expect(reviewWorkspaceChange(base, passed, admin).denied).toEqual(["record testing results"]);
    const released = structuredClone(passed);
    Object.assign(released.data.jobOrders[0], { releaseQuantity: 4100, releaseUom: "boxes", releasedAt: "2026-10-09T10:00:00.000Z", releasedBy: "QA" });
    expect(reviewWorkspaceChange(passed, released, role("release.edit")).allowed).toBe(true);
    expect(reviewWorkspaceChange(passed, released, role("testing.edit")).denied).toEqual(["release or reject batches"]);
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
    // Moving a confirmed booking needs approve, unless it goes back to Draft to be confirmed again.
    const moved = copy(); moved.data.entries.find((entry) => entry.id === draft.id)!.startAt = "2026-10-09T08:00";
    expect(reviewWorkspaceChange(base, moved, manager).denied).toEqual(["move confirmed machine bookings"]);
    expect(reviewWorkspaceChange(base, moved, everything).allowed).toBe(true);
    const reopened = structuredClone(moved); reopened.data.entries.find((entry) => entry.id === draft.id)!.status = "Draft";
    expect(reviewWorkspaceChange(base, reopened, manager).allowed).toBe(true);
    // Production moving it along (In Progress) is not a move.
    const started = copy(); started.data.entries.find((entry) => entry.id === draft.id)!.status = "In Progress";
    expect(reviewWorkspaceChange(base, started, manager).allowed).toBe(true);
  });
  it("needs cancel to delete a booking past Draft", () => {
    const confirmed = base.data.entries.find((entry) => entry.status === "Confirmed")!;
    const deleted = copy(); deleted.data.entries = deleted.data.entries.filter((entry) => entry.id !== confirmed.id);
    expect(reviewWorkspaceChange(base, deleted, manager).denied).toEqual(["cancel machine bookings"]);
    expect(reviewWorkspaceChange(base, deleted, everything).allowed).toBe(true);
    const before = copy(); before.data.entries.find((entry) => entry.id === confirmed.id)!.status = "Draft";
    const draftDeleted = structuredClone(before); draftDeleted.data.entries = draftDeleted.data.entries.filter((entry) => entry.id !== confirmed.id);
    expect(reviewWorkspaceChange(before, draftDeleted, manager).allowed).toBe(true);
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
  it("refuses testing or release bundled with an ordinary job order edit", () => {
    // Before: a mixed change needed only Orders edit, so notes + a pass went through.
    const bundled = copy();
    Object.assign(bundled.data.jobOrders[0], { notes: "Checked", testedAt: "2026-10-08T10:00:00.000Z", testedBy: "QC", testResult: "Passed" });
    expect(reviewWorkspaceChange(base, bundled, planner).denied).toEqual(["record testing results"]);
    expect(reviewWorkspaceChange(base, bundled, role("orders.edit", "testing.edit")).allowed).toBe(true);
    const released = copy();
    Object.assign(released.data.jobOrders[0], { quantity: released.data.jobOrders[0].quantity + 1, releaseQuantity: 10, releaseUom: "boxes", releasedAt: "2026-10-09T10:00:00.000Z", releasedBy: "QA" });
    expect(reviewWorkspaceChange(base, released, planner).denied).toEqual(["release or reject batches"]);
    const confirmed = copy();
    Object.assign(confirmed.data.jobOrders[0], { notes: "x", formulaConfirmedBy: "QA", formulaConfirmedAt: "2026-10-09T10:00:00.000Z" });
    expect(reviewWorkspaceChange(base, confirmed, planner).denied).toEqual(["confirm a shared batch's formula"]);
    // Testing and release rights alone cannot edit the job order's figures.
    expect(reviewWorkspaceChange(base, bundled, role("testing.edit")).denied).toEqual(["edit job orders"]);
    // A stamp alone is still an edit.
    const stamped = copy(); stamped.data.jobOrders[0].updatedBy = "Someone else";
    expect(reviewWorkspaceChange(base, stamped, role("testing.edit")).denied).toEqual(["edit job orders"]);
  });
  it("lets an order editor clear a formula confirmation but not set one", () => {
    const before = copy();
    Object.assign(before.data.jobOrders[0], { formulaConfirmedBy: "QA", formulaConfirmedAt: "2026-10-09T10:00:00.000Z" });
    const cleared = structuredClone(before);
    delete cleared.data.jobOrders[0].formulaConfirmedBy; delete cleared.data.jobOrders[0].formulaConfirmedAt;
    cleared.data.jobOrders[0].notes = "Shares changed";
    expect(reviewWorkspaceChange(before, cleared, planner).allowed).toBe(true);
  });
  it("refuses a new job order that already carries testing, release or a batch number", () => {
    const fresh = () => { const next = copy(); next.data.jobOrders.push({ ...structuredClone(base.data.jobOrders[0]), id: "job-new", number: "JO-NEW" }); return next.data.jobOrders.at(-1)!; };
    const tested = copy(); tested.data.jobOrders.push({ ...fresh(), testedAt: "2026-10-08T10:00:00.000Z", testedBy: "QC", testResult: "Passed" });
    expect(reviewWorkspaceChange(base, tested, planner).denied).toContain("record testing results");
    const released = copy(); released.data.jobOrders.push({ ...fresh(), releasedAt: "2026-10-08T10:00:00.000Z", releasedBy: "QA", releaseQuantity: 1, releaseUom: "boxes" });
    expect(reviewWorkspaceChange(base, released, planner).denied).toContain("release or reject batches");
    const batch = copy(); batch.data.jobOrders.push({ ...fresh(), batchNumber: "B-1" });
    expect(reviewWorkspaceChange(base, batch, role("orders.create")).denied).toContain("enter batch numbers");
    const bare = copy(); const job = fresh();
    for (const key of ["testedAt", "testedBy", "testResult", "releaseQuantity", "releaseUom", "releasedAt", "releasedBy", "rejectedAt", "rejectedBy", "poReleases", "formulaConfirmedBy", "formulaConfirmedAt", "batchNumber", "batchNumberBy", "batchNumberAt"]) delete (job as Record<string, unknown>)[key];
    bare.data.jobOrders.push(job);
    expect(reviewWorkspaceChange(base, bare, role("orders.create")).allowed).toBe(true);
  });
  it("refuses production results bundled with a plan change or carried by a new activity", () => {
    const bundled = copy();
    Object.assign(bundled.data.lines.find((line) => line.id === openLine().id)!, { plannedDate: "2026-10-20", completedAt: "2026-10-08T10:00:00.000Z", yieldQuantity: 1 });
    expect(reviewWorkspaceChange(base, bundled, planner).denied).toEqual(["record production results"]);
    expect(reviewWorkspaceChange(base, bundled, production).denied).toContain("move or edit plan activities");
    const added = copy();
    added.data.lines.push({ ...openLine(), id: "new-line", completedAt: "2026-10-08T10:00:00.000Z", yieldQuantity: 5 });
    expect(reviewWorkspaceChange(base, added, planner).denied).toEqual(["record production results"]);
  });
  it("lets production save results with its own stamp, but not a stamp alone", () => {
    const next = copy();
    Object.assign(next.data.lines.find((line) => line.id === openLine().id)!, { startedAt: "2026-10-07", updatedBy: "Kumar", updatedAt: "2026-10-07T08:00:00.000Z" });
    expect(reviewWorkspaceChange(base, next, manager).allowed).toBe(true);
    const forged = copy(); forged.data.lines.find((line) => line.id === openLine().id)!.updatedBy = "Someone else";
    expect(reviewWorkspaceChange(base, forged, role("schedule.edit")).denied).toEqual(["move or edit plan activities"]);
  });
});
