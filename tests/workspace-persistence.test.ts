import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { newWorkspace, parseWorkspace } from "../src/lib/domain/workspace";
import { workspaceRepository, RevisionConflict } from "../src/lib/persistence/repository";
import { localPersistenceAllowed, sameLocalOrigin } from "../src/lib/persistence/access";

describe("workspace boundary", () => {
  it("allows only explicitly enabled loopback development access", () => {
    const env = { NODE_ENV: "development", SCHEDULER_PERSISTENCE: "local", SCHEDULER_AUTH_MODE: "demo" };
    expect(localPersistenceAllowed("localhost:3001", env)).toBe(true);
    for (const host of ["attacker.example", "localhost.attacker.example", "10.0.0.1:3001", null]) expect(localPersistenceAllowed(host, env)).toBe(false);
    expect(localPersistenceAllowed("localhost", { ...env, NODE_ENV: "production" })).toBe(false);
    expect(localPersistenceAllowed("localhost", { ...env, SCHEDULER_AUTH_MODE: "core" })).toBe(false);
    expect(localPersistenceAllowed("localhost", { ...env, SCHEDULER_PERSISTENCE: undefined })).toBe(false);
    expect(sameLocalOrigin("localhost:3001", "http://localhost:3001")).toBe(true);
    expect(sameLocalOrigin("localhost:3001", "http://attacker.example")).toBe(false);
    expect(sameLocalOrigin("localhost:3001", null)).toBe(false);
  });
  it("rejects future schemas rather than resetting or downgrading records", () => {
    expect(() => parseWorkspace({ ...newWorkspace(), schemaVersion: 2 })).toThrow();
  });
  it("validates references, unique IDs and required administrator", () => {
    const state = newWorkspace();
    expect(parseWorkspace(state)).toEqual(state);
    state.directory.people = [];
    expect(() => parseWorkspace(state)).toThrow();
    const invalid = newWorkspace();
    invalid.directory.calendars.push({ id: "x", unitId: "missing", processId: "missing", name: "Bad reference" });
    expect(() => parseWorkspace(invalid)).toThrow();
    const duplicate = newWorkspace(); duplicate.measurements.uoms.push({ name: "BOXES", active: true });
    expect(() => parseWorkspace(duplicate)).toThrow();
  });
});

const enabled = !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)("PostgreSQL round trips", () => {
  const db = enabled ? new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL }) : null!;
  const ids: string[] = [];
  const create = () => { const id = `test-${randomUUID()}`; ids.push(id); return { id, repository: workspaceRepository(db, id) }; };
  afterAll(async () => {
    for (const id of ids) { await db.schedulerWorkspaceRevision.deleteMany({ where: { workspaceId: id } }); await db.schedulerWorkspace.deleteMany({ where: { id } }); }
    await db.$disconnect();
  });
  it("saves and reloads configuration and measurement settings without reseeding", async () => {
    const { repository, id } = create(); const initial = await repository.load();
    initial.snapshot.directory.units.push({ id: "fresh-unit", name: "Durable Unit" });
    initial.snapshot.products.push({ id: "product", sku: "P-001", name: "Durable Product", uom: "boxes", productType: "Finished Good", active: "Active" });
    initial.snapshot.measurements.uoms.push({ name: "trays", active: true });
    expect(await repository.save(initial.snapshot, 0, randomUUID())).toBe(1);
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    try { expect((await workspaceRepository(secondClient, id).load()).snapshot).toEqual(initial.snapshot); } finally { await secondClient.$disconnect(); }
    expect(await db.schedulerWorkspaceRevision.count({ where: { workspaceId: id } })).toBe(1);
  });
  it("atomically rejects stale concurrent writes and supports retrying the same save", async () => {
    const { repository } = create(); const initial = await repository.load();
    const mutation = randomUUID();
    await repository.save(initial.snapshot, 0, mutation);
    expect(await repository.save(initial.snapshot, 0, mutation)).toBe(1);
    await expect(repository.save(initial.snapshot, 0, randomUUID())).rejects.toBeInstanceOf(RevisionConflict);
    const results = await Promise.allSettled([repository.save(initial.snapshot, 1, randomUUID()), repository.save(initial.snapshot, 1, randomUUID())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await repository.load()).revision).toBe(2);
  });
  it("round trips plans, production, final actuals and received WIP together", async () => {
    const { repository } = create(); const { snapshot } = await repository.load();
    snapshot.directory.units.push({ id: "u", name: "Unit" });
    snapshot.directory.processes.push({ id: "p1", name: "Production" }, { id: "p2", name: "Packing" });
    snapshot.directory.calendars.push({ id: "c1", unitId: "u", processId: "p1", name: "Production" }, { id: "c2", unitId: "u", processId: "p2", name: "Packing" });
    snapshot.products.push({ id: "product", sku: "P-001", name: "Tablet", uom: "tablets", productType: "Finished Good", active: "Active" });
    snapshot.workCentres.push({ id: "wc", code: "WC", name: "Room", active: "Active" });
    snapshot.machines.push({ id: "m", code: "M", name: "Press", workCentreId: "wc", unitId: "u", processIds: ["p1"], setupMinutes: 30, capacity: 100000, capacityUom: "tablets per shift", active: "Active" });
    const line = { id: "source", calendarId: "c1", planId: "plan", productId: "product", quantity: 100000, plannedDate: "2026-09-13", priority: "Normal" as const, status: "Fully Scheduled" as const, uom: "tablets", activityType: "Tableting", unitWeightMg: 332, batchSizeKg: 33.2 };
    snapshot.data.lines.push({ ...line, completedAt: "2026-09-13T16:00:00Z", yieldQuantity: 95000 }, { ...line, id: "incoming", calendarId: "c2", quantity: 95000, incomingWipId: "transfer", batchSizeKg: 31.54 });
    snapshot.data.entries.push({ id: "entry", calendarId: "c1", planLineId: "source", productId: "product", workCentreId: "wc", machineId: "m", startAt: "2026-09-13T08:00", endAt: "2026-09-13T16:00", status: "Completed" });
    snapshot.data.actuals.push({ calendarId: "c1", planLineId: "source", teamId: "", actualQuantity: 95000, plannedQuantity: 100000, uom: "tablets", productionDate: "2026-09-13", hasDeviation: true, deviation: "5000 rejected tablets", correctiveAction: "Review tooling", updatedBy: "Production", updatedAt: "2026-09-13T16:00:00Z" });
    snapshot.data.transfers.push({ id: "transfer", sourceLineId: "source", sourceCalendarId: "c1", calendarId: "c2", productId: "product", quantity: 95000, uom: "tablets", notes: "Ready to pack", createdAt: "2026-09-13T16:00:00Z", createdBy: "Production", receivedAt: "2026-09-13T17:00:00Z", receivedBy: "Packing", plannedLineId: "incoming" });
    await repository.save(snapshot, 0, randomUUID());
    expect((await repository.load()).snapshot).toEqual(snapshot);
  });
  it("leaves saved data unchanged after invalid input", async () => {
    const { repository } = create(); const initial = await repository.load();
    await expect(repository.save({ ...initial.snapshot, products: [{ id: "broken" }] }, 0, randomUUID())).rejects.toThrow();
    expect(await repository.load()).toEqual(initial);
  });
});
