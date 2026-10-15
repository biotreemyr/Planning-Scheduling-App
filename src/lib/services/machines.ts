import type { Machine, PlanLine, Product, ScheduleEntry } from "@/lib/domain/types";
import type { UnitCalendar } from "@/lib/domain/calendarAccess";
import { findMachineConflicts } from "./conflicts";
import { lineEnd } from "./scheduling";
import type { EquipmentCatalog } from "./masterData";

// A machine as people know it: its Equipment ID and name, e.g. "CFM/02 · Automatic Capsule Filling Machine".
export const machineLabel = (machine?: Pick<Machine, "code" | "name">) => machine ? [machine.code, machine.name].filter(Boolean).join(" · ") : "";

// An activity may book several machines (a bottle line books counting, capping, sealing and labelling).
export const bookedMachineIds = (entries: ScheduleEntry[], lineId?: string) =>
  lineId ? [...new Set(entries.filter((entry) => entry.planLineId === lineId && entry.status !== "Cancelled" && entry.machineId).map((entry) => entry.machineId!))] : [];

export const sameMachines = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

export const machineLabels = (machines: Machine[], ids: string[]) => ids.map((id) => machineLabel(machines.find((machine) => machine.id === id))).filter(Boolean).join(", ");

/**
 * Machines as Master Data has them now: a machine chosen from the equipment list shows its current
 * Equipment ID and name, and is inactive when Master Data has it inactive or off for production.
 * Without the list (not configured, or not reachable) the copy kept on the machine is shown.
 */
export function withMasterEquipment(machines: Machine[], catalog?: EquipmentCatalog): Machine[] {
  if (catalog?.status !== "ok") return machines;
  const byId = new Map(catalog.equipment.map((item) => [item.id, item]));
  return machines.map((machine) => {
    const master = machine.masterDataId ? byId.get(machine.masterDataId) : undefined;
    return master ? { ...machine, code: master.code, name: master.name, active: master.active ? machine.active : "Inactive" } : machine;
  });
}

/**
 * Book an activity's machines: the ones chosen stay or are added, the others are let go. Usually one
 * machine; a bottle line books several (counting, capping, sealing, labelling). A booking already made
 * keeps its times: a machine swapped for another takes over its booking, and a machine added copies
 * them. A new booking is a draft for the working day (completed, for a completed activity being
 * corrected). Confirmed bookings are not dropped, and double-booking is refused.
 */
export function bookActivityMachines(current: ScheduleEntry[], line: PlanLine, machineIds: string[], context: {
  calendars: UnitCalendar[]; machines: Machine[]; products: Product[]; who: string; newId: () => string;
}): { entries: ScheduleEntry[] } | { error: string } {
  const { calendars, machines, products, who, newId } = context;
  const own = current.filter((entry) => entry.planLineId === line.id && entry.status !== "Cancelled");
  const wanted = [...new Set(machineIds.filter(Boolean))];
  const calendar = calendars.find((item) => item.id === line.calendarId);
  const chosen: Machine[] = [];
  for (const id of wanted) {
    // A machine already booked may stay even if it was since made inactive.
    const machine = machines.find((item) => item.id === id && item.unitId === calendar?.unitId && item.processIds?.includes(calendar?.processId ?? "") && (item.active === "Active" || own.some((entry) => entry.machineId === id)));
    if (!machine) return { error: "Select active machines set up for this process." };
    chosen.push(machine);
  }
  const kept = own.filter((entry) => entry.machineId && wanted.includes(entry.machineId));
  const freed = own.filter((entry) => !kept.includes(entry));
  const adding = chosen.filter((machine) => !kept.some((entry) => entry.machineId === machine.id));
  // Freed bookings are reused for the new machines first; any left over are let go (drafts only).
  const reused = new Map(freed.slice(0, adding.length).map((entry, index) => [entry.id, adding[index]]));
  const dropped = freed.slice(adding.length);
  if (dropped.some((entry) => entry.status !== "Draft")) return { error: "Confirmed bookings keep their machine. Choose another machine instead." };
  const template = own[0];
  const created: ScheduleEntry[] = adding.slice(reused.size).map((machine) => ({ id: newId(), calendarId: line.calendarId, planLineId: line.id, productId: line.productId, productionOrderId: line.productionOrderId, workCentreId: machine.workCentreId, machineId: machine.id,
    startAt: template?.startAt ?? `${line.plannedDate}T08:00`, endAt: template?.endAt ?? `${lineEnd(line)}T17:00`, status: template?.status ?? (line.completedAt ? "Completed" : "Draft"), changedBy: who }));
  const next = [...current.filter((entry) => !dropped.includes(entry)).map((entry) => {
    const machine = reused.get(entry.id);
    return machine ? { ...entry, machineId: machine.id, workCentreId: machine.workCentreId, changedBy: who } : entry;
  }), ...created];
  const changed = new Set([...reused.keys(), ...created.map((entry) => entry.id)]);
  const clash = findMachineConflicts(next, machines, products).find((conflict) => conflict.entryIds.some((id) => changed.has(id)));
  if (clash) return { error: `${machineLabel(machines.find((item) => item.id === clash.machineId))} is already booked that day.` };
  return { entries: next };
}
