// One-off: add a process to a unit, placed right after another of its processes (Admin adds new
// processes at the end). Dry run by default; pass --apply to save. Take a backup first.
//   npx vite-node --config vitest.config.ts scripts/add-process.ts "BTP - Production" Granulation Dispensing [--apply]
import { randomUUID } from "node:crypto";
import { createDatabase } from "@/lib/persistence/client";
import { workspaceRepository } from "@/lib/persistence/repository";
import { parseWorkspace } from "@/lib/domain/workspace";

const [unitName, processName, afterName] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!unitName || !processName || !afterName) throw new Error("Usage: add-process.ts <unit> <process> <after process> [--apply]");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

const db = createDatabase();
const repository = workspaceRepository(db);
try {
  const { revision, snapshot } = await repository.load();
  const d = snapshot.directory;
  const unit = d.units.find((item) => same(item.name, unitName));
  if (!unit) throw new Error(`No unit ${unitName}`);
  const unitCalendars = d.calendars.filter((item) => item.unitId === unit.id);
  if (unitCalendars.some((item) => same(item.name, processName))) throw new Error(`${unit.name} already has ${processName}`);
  const after = unitCalendars.find((item) => same(item.name, afterName));
  if (!after) throw new Error(`${unit.name} has no ${afterName}`);
  const added = d.processes.find((item) => same(item.name, processName)) ?? { id: `process-${slug(processName)}`, name: processName.trim() };
  const calendar = { id: `${unit.id}-cal-${slug(processName)}`, unitId: unit.id, processId: added.id, name: added.name };
  const next = structuredClone(snapshot);
  if (!next.directory.processes.some((item) => item.id === added.id)) next.directory.processes.push(added);
  next.directory.calendars.splice(next.directory.calendars.findIndex((item) => item.id === after.id) + 1, 0, calendar);
  const parsed = parseWorkspace(next);
  console.log(`Revision ${revision}. ${unit.name} processes after:`, parsed.directory.calendars.filter((item) => item.unitId === unit.id).map((item) => item.name).join(" → "));
  if (!apply) { console.log("Dry run: nothing saved. Re-run with --apply."); process.exit(0); }
  const saved = await repository.save(parsed, revision, `add-process-${randomUUID()}`, {
    actor: { name: "Data migration" },
    review: () => ({ denied: [], summary: [`Added the ${added.name} process to ${unit.name}, after ${after.name}`] })
  });
  console.log(`Saved as revision ${saved}.`);
} finally {
  await db.$client.end();
}
