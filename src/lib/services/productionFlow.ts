import type { PlanLine } from "@/lib/domain/types";
import { canViewCalendar, type CalendarDirectory, type CalendarPerson } from "@/lib/domain/calendarAccess";

// Completing an activity: the actual quantity, the day it finished, and where the output goes:
// straight to the next process, or held in the WIP room for it, or nowhere (final output).
// machineIds: the machines production ran it on, when chosen in the update (none ticked for none).
// weighed: the output was weighed (kg, g) or measured (L, mL) and converted to a count with the size of
// one unit; unitWeightMg then holds mg per unit for a weight, or mL per unit for a volume.
// Saved with progress: the amount run so far as keyed in (none when left empty), with one unit's weight
// or volume when weighed, and where the output is to go.
export type Progress = { quantity?: number; uom?: string; unitSize?: number; destination?: string };
// An activity without its amount-so-far, once completed or when production clears it.
export function withoutProgress<T extends { progressQuantity?: number; progressUom?: string; progressUnitSize?: number; progressDestination?: string }>(line: T) {
  const { progressQuantity: _q, progressUom: _u, progressUnitSize: _s, progressDestination: _d, ...rest } = line;
  return rest;
}
export type CompletionInput = { quantity: number; destinationId: string; notes: string; completedDate?: string; wipRoom?: boolean; uom?: string; machineIds?: string[];
  // Production's deviation note, needed when the yield (% of theoretical) is outside QA's limits.
  deviation?: string;
  weighed?: { quantity: number; uom: string; unitWeightMg: number; shellWeightMg?: number } };
export type WipTransfer = {
  id: string; sourceLineId: string; sourceCalendarId: string; calendarId: string;
  productId: string; quantity: number; uom: string; orderReference?: string; notes: string;
  createdAt: string; createdBy: string; receivedAt?: string; receivedBy?: string; plannedLineId?: string;
  // Held in the WIP room until the receiving process takes it.
  wipRoom?: boolean;
};

/**
 * Handovers into an activity not yet received: output of the same job order sent to this activity's
 * process. The next process may start only once it is received, so who took over the material is recorded.
 */
export function awaitingReceipt(line: PlanLine, lines: PlanLine[], transfers: WipTransfer[]) {
  if (!line.jobOrderId) return [];
  return transfers.filter((item) => !item.receivedAt && !item.plannedLineId && item.calendarId === line.calendarId && item.sourceLineId !== line.id
    && lines.some((source) => source.id === item.sourceLineId && source.jobOrderId === line.jobOrderId && (!source.productionOrderId || !line.productionOrderId || source.productionOrderId === line.productionOrderId)));
}

// Core has no team model, so in Core mode the receiving process need not have a named production person.
export function validateCompletion(line: PlanLine, input: CompletionInput, person: CalendarPerson, directory: CalendarDirectory, requireReceivingTeam = true) {
  const source = directory.calendars.find((calendar) => calendar.id === line.calendarId);
  const errors: string[] = [];
  if (!source || person.role !== "production" || !canViewCalendar(person, source, directory)) errors.push("Production access to this calendar is required.");
  if (line.completedAt) errors.push("This activity is already complete.");
  if (!Number.isFinite(input.quantity) || input.quantity < 0) errors.push("Actual quantity must be zero or greater.");
  if (input.completedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.completedDate)) errors.push("Choose the date production completed.");
  else if (input.completedDate && line.startedAt && input.completedDate < line.startedAt) errors.push("The completed date cannot be before the start date.");
  if (input.destinationId) {
    const destination = directory.calendars.find((calendar) => calendar.id === input.destinationId);
    if (!destination || destination.processId === source?.processId) errors.push("Choose a different receiving process.");
    if (!(input.quantity > 0)) errors.push("Only a positive yield can be transferred.");
    if (destination && requireReceivingTeam && !directory.people.some((member) => member.role === "production" && canViewCalendar(member, destination, directory))) errors.push("Assign a production team to the receiving calendar first.");
  }
  return errors;
}

// Correcting a completed activity: the same fields as completing it, plus the start date.
// reason: why the dates or quantity of a completed process are corrected (required when they change).
export type CorrectionInput = CompletionInput & { startedAt: string; reason?: string };

// Whether a correction changes what was recorded: the dates or the quantity (count, weight or unit).
export function correctsRecord(line: PlanLine, input: CorrectionInput) {
  const day = (value?: string) => value ? value.slice(0, 10) : "";
  const completedDay = line.completedAt ? new Date(line.completedAt) : undefined;
  const completedLocal = completedDay ? `${completedDay.getFullYear()}-${String(completedDay.getMonth() + 1).padStart(2, "0")}-${String(completedDay.getDate()).padStart(2, "0")}` : "";
  return (input.completedDate ?? "") !== completedLocal || (input.startedAt || input.completedDate || "") !== day(line.startedAt)
    || input.quantity !== line.yieldQuantity || (input.uom || line.uom) !== (line.yieldUom ?? line.uom)
    || (input.weighed?.quantity ?? line.weighedQuantity) !== line.weighedQuantity || (input.weighed ? input.weighed.unitWeightMg !== (line.actualUnitWeightMg ?? line.actualUnitVolumeMl) : false);
}

/**
 * Check a correction to a completed production update. Dates, the actual quantity and notes can
 * always be corrected, with a reason when the dates or quantity change. Once the receiving process
 * has acknowledged the handover (or planning has added it to the plan), where the output went and
 * its unit stay as they are; a corrected quantity then updates the handover too.
 */
export function validateCorrection(line: PlanLine, input: CorrectionInput, outgoing: WipTransfer | undefined, person: CalendarPerson, directory: CalendarDirectory, requireReceivingTeam = true) {
  if (!line.completedAt) return ["This activity is not complete yet."];
  const errors = validateCompletion({ ...line, completedAt: undefined, startedAt: input.startedAt || undefined }, input, person, directory, requireReceivingTeam);
  if (!input.completedDate) errors.push("Choose the date production completed.");
  if (input.startedAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.startedAt)) errors.push("Choose the date production started.");
  const handedOver = outgoing && (outgoing.receivedAt || outgoing.plannedLineId);
  const destinationChanged = (outgoing?.calendarId ?? "") !== input.destinationId || !!outgoing?.wipRoom !== !!input.wipRoom;
  const unitChanged = (input.uom || line.uom) !== (line.yieldUom ?? line.uom);
  if (handedOver && (destinationChanged || unitChanged)) errors.push(`${outgoing.receivedBy ?? "The next process"} has already received this output, so where it went and its unit stay as they are. Dates and the quantity can still be corrected, with a reason.`);
  if (correctsRecord(line, input) && !input.reason?.trim()) errors.push("Give the reason for correcting the dates or quantity of completed production.");
  return errors;
}
