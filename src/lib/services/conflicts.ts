import type { Machine, Product, ScheduleConflict, ScheduleEntry } from "@/lib/domain/types";
import { machineLabel } from "./machines";

// A booking still to run clashes with any booking that holds the machine, finished ones included:
// a draft over a completed run is as wrong as one over a confirmed run. Two drafts are still being
// planned, and two finished runs are history, so neither pair is flagged.
const open = new Set(["Draft", "Confirmed", "In Progress"]);
const holding = new Set(["Confirmed", "In Progress", "Completed"]);
const clash = (a: ScheduleEntry, b: ScheduleEntry) => (open.has(a.status) && holding.has(b.status)) || (holding.has(a.status) && open.has(b.status));

function overlaps(a: ScheduleEntry, b: ScheduleEntry, setupMinutes: number) {
  const setup = setupMinutes * 60000;
  return new Date(a.startAt).getTime() - setup < new Date(b.endAt).getTime() && new Date(b.startAt).getTime() - setup < new Date(a.endAt).getTime();
}

export function findMachineConflicts(
  entries: ScheduleEntry[],
  machines: Machine[],
  products: Product[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const machineNames = new Map(machines.map((machine) => [machine.id, machineLabel(machine)]));
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const confirmedEntries = entries
    .filter((entry) => entry.machineId && (open.has(entry.status) || holding.has(entry.status)))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (let index = 0; index < confirmedEntries.length; index += 1) {
    const first = confirmedEntries[index];

    for (let nextIndex = index + 1; nextIndex < confirmedEntries.length; nextIndex += 1) {
      const second = confirmedEntries[nextIndex];

      if (first.machineId !== second.machineId || !clash(first, second)) {
        continue;
      }

      if (!overlaps(first, second, machines.find((machine) => machine.id === first.machineId)?.setupMinutes ?? 0)) {
        continue;
      }

      const machineName = machineNames.get(first.machineId ?? "") ?? "Machine";
      const firstProduct = productNames.get(first.productId) ?? "scheduled work";
      const secondProduct = productNames.get(second.productId) ?? "scheduled work";

      conflicts.push({
        id: `${first.id}-${second.id}`,
        machineId: first.machineId ?? "",
        entryIds: [first.id, second.id],
        message: `${machineName} is double-booked for ${firstProduct} and ${secondProduct}.`
      });
    }
  }

  return conflicts;
}

export function hasConflict(entryId: string, conflicts: ScheduleConflict[]) {
  return conflicts.some((conflict) => conflict.entryIds.includes(entryId));
}
