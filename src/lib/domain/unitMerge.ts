import { parseWorkspace, type WorkspaceSnapshot } from "./workspace";
import { SAMPLE_PREFIX, alignSampleQuantities, isSample, sampleMeasures } from "./sampleData";

/**
 * Fold a sample unit into a real one: its processes, machines and work centres, every activity,
 * booking, result and handover planned in it, and people's access all move to the real unit, then
 * the sample unit goes. The moved set-up records lose their sample prefix, so removing sample data
 * later can never take the real unit's processes or machines with it. Sample orders, products,
 * job orders and people keep theirs and can still be removed. Every PO without a unit is given the
 * real unit; sample job orders get per-process quantities and their activities follow them.
 */
export function mergeSampleUnit(state: WorkspaceSnapshot, sampleUnitId: string, intoUnitId: string): WorkspaceSnapshot {
  const into = state.directory.units.find((unit) => unit.id === intoUnitId);
  if (!into) throw new Error(`Unit ${intoUnitId} not found`);
  if (!state.directory.units.some((unit) => unit.id === sampleUnitId)) throw new Error(`Unit ${sampleUnitId} not found`);
  if (!isSample(sampleUnitId) || isSample(intoUnitId)) throw new Error("Merge a sample unit into a real one");
  if (state.directory.calendars.some((calendar) => calendar.unitId === intoUnitId)) throw new Error(`${into.name} already has processes; merge them by hand`);

  const unprefix = (id: string) => id.slice(SAMPLE_PREFIX.length);
  const calendars = state.directory.calendars.filter((calendar) => calendar.unitId === sampleUnitId);
  const machines = state.machines.filter((machine) => machine.unitId === sampleUnitId);
  const renames = new Map<string, string>([[sampleUnitId, intoUnitId]]);
  for (const calendar of calendars) {
    renames.set(calendar.id, `${intoUnitId}-${unprefix(calendar.id).replace(/^cal-[a-z]+-/, "cal-")}`);
    if (isSample(calendar.processId)) renames.set(calendar.processId, unprefix(calendar.processId));
  }
  for (const machine of machines) {
    if (isSample(machine.id)) renames.set(machine.id, unprefix(machine.id));
    if (isSample(machine.workCentreId)) renames.set(machine.workCentreId, unprefix(machine.workCentreId));
  }
  // Every reference is a whole JSON string (an ID, or a key of an order's expected dates).
  let json = JSON.stringify(state);
  for (const [from, to] of renames) json = json.split(JSON.stringify(from)).join(JSON.stringify(to));
  const next: WorkspaceSnapshot = JSON.parse(json);

  const d = next.directory;
  const index = d.units.findIndex((unit) => unit.id === intoUnitId && unit.name !== into.name);
  d.units.splice(index, 1);
  d.people = d.people.map((person) => ({ ...person, unitIds: [...new Set(person.unitIds)] }));
  next.data.orders = next.data.orders.map((order) => order.unitId ? order : { ...order, unitId: intoUnitId });
  next.data.jobOrders = next.data.jobOrders.map((job) => isSample(job.id) && !job.packQuantity && !job.boxQuantity ? { ...job, ...sampleMeasures(job.quantity, job.uom) } : job);
  return parseWorkspace(alignSampleQuantities(next));
}
