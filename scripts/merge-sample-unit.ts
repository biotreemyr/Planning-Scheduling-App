// One-off: fold "Manufacturing (Sample)" into "BTP - Production" and remove the empty BTB unit.
// Dry run by default; pass --apply to save. Take a backup first (npm run db:backup).
//   DATABASE_URL=... npx vite-node --config vitest.config.ts scripts/merge-sample-unit.ts [--apply]
import { randomUUID } from "node:crypto";
import { createDatabase } from "@/lib/persistence/client";
import { workspaceRepository } from "@/lib/persistence/repository";
import { mergeSampleUnit } from "@/lib/domain/unitMerge";
import { parseWorkspace } from "@/lib/domain/workspace";

const apply = process.argv.includes("--apply");
const db = createDatabase();
const repository = workspaceRepository(db);
const named = (name: string, units: { id: string; name: string }[]) => {
  const unit = units.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
  if (!unit) throw new Error(`No unit named ${name}`);
  return unit;
};

try {
  const { revision, snapshot } = await repository.load();
  const units = snapshot.directory.units;
  const sample = named("Manufacturing (Sample)", units), btp = named("BTP - Production", units), btb = named("BTB - Production", units);
  const merged = mergeSampleUnit(snapshot, sample.id, btp.id);
  // BTB goes only while nothing uses it.
  const usesBtb = merged.directory.calendars.some((item) => item.unitId === btb.id) || merged.machines.some((item) => item.unitId === btb.id) || merged.data.orders.some((item) => item.unitId === btb.id);
  if (usesBtb) throw new Error("BTB - Production has processes, machines or orders; not removing it");
  merged.directory.units = merged.directory.units.filter((unit) => unit.id !== btb.id);
  merged.directory.people = merged.directory.people.map((person) => ({ ...person, unitIds: person.unitIds.filter((id) => id !== btb.id) }));
  const next = parseWorkspace(merged);

  const count = (state: typeof snapshot) => ({ units: state.directory.units.map((unit) => unit.name), calendars: state.directory.calendars.length, machines: state.machines.length, lines: state.data.lines.length, entries: state.data.entries.length, actuals: state.data.actuals.length, orders: state.data.orders.length, jobOrders: state.data.jobOrders.length });
  console.log(`Revision ${revision}`);
  console.log("Before", count(snapshot));
  console.log("After ", count(next));
  console.log("Orders now in BTP:", next.data.orders.filter((order) => order.unitId === btp.id).length, "of", next.data.orders.length);
  if (!apply) { console.log("Dry run: nothing saved. Re-run with --apply."); process.exit(0); }
  const saved = await repository.save(next, revision, `merge-units-${randomUUID()}`, {
    actor: { name: "Data migration" },
    review: () => ({ denied: [], summary: ["Merged Manufacturing (Sample) into BTP - Production (processes, machines, activities, bookings, results, access)", "Removed the empty BTB - Production unit", "Set every PO's production unit to BTP - Production"] })
  });
  console.log(`Saved as revision ${saved}.`);
} finally {
  await db.$client.end();
}
