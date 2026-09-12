import type { Machine, Product, ScheduleConflict, ScheduleEntry } from "@/lib/domain/types";

const conflictStatuses = new Set(["Confirmed", "In Progress"]);

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
  const machineNames = new Map(machines.map((machine) => [machine.id, machine.name]));
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const confirmedEntries = entries
    .filter((entry) => entry.machineId && conflictStatuses.has(entry.status))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  for (let index = 0; index < confirmedEntries.length; index += 1) {
    const first = confirmedEntries[index];

    for (let nextIndex = index + 1; nextIndex < confirmedEntries.length; nextIndex += 1) {
      const second = confirmedEntries[nextIndex];

      if (first.machineId !== second.machineId) {
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
