import type { PlanLine } from "@/lib/domain/types";
import { canViewCalendar, type CalendarDirectory, type CalendarPerson } from "@/lib/domain/calendarAccess";

// Completing an activity: the actual quantity, the day it finished, and where the output goes:
// straight to the next process, or held in the WIP room for it, or nowhere (final output).
export type CompletionInput = { quantity: number; destinationId: string; notes: string; completedDate?: string; wipRoom?: boolean; uom?: string };
export type WipTransfer = {
  id: string; sourceLineId: string; sourceCalendarId: string; calendarId: string;
  productId: string; quantity: number; uom: string; orderReference?: string; notes: string;
  createdAt: string; createdBy: string; receivedAt?: string; receivedBy?: string; plannedLineId?: string;
  // Held in the WIP room until the receiving process takes it.
  wipRoom?: boolean;
};

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
export type CorrectionInput = CompletionInput & { startedAt: string };

/**
 * Check a correction to a completed production update. Dates and notes can always be corrected;
 * the actual quantity, its unit and where the output went only until the receiving process has
 * acknowledged the handover (or planning has added it to the plan), so its stock stays true.
 */
export function validateCorrection(line: PlanLine, input: CorrectionInput, outgoing: WipTransfer | undefined, person: CalendarPerson, directory: CalendarDirectory, requireReceivingTeam = true) {
  if (!line.completedAt) return ["This activity is not complete yet."];
  const errors = validateCompletion({ ...line, completedAt: undefined, startedAt: input.startedAt || undefined }, input, person, directory, requireReceivingTeam);
  if (!input.completedDate) errors.push("Choose the date production completed.");
  if (input.startedAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.startedAt)) errors.push("Choose the date production started.");
  const handedOver = outgoing && (outgoing.receivedAt || outgoing.plannedLineId);
  const destinationChanged = (outgoing?.calendarId ?? "") !== input.destinationId || !!outgoing?.wipRoom !== !!input.wipRoom;
  const quantityChanged = input.quantity !== line.yieldQuantity || (input.uom || line.uom) !== (line.yieldUom ?? line.uom);
  if (handedOver && (destinationChanged || quantityChanged)) errors.push(`${outgoing.receivedBy ?? "The next process"} has already received this output, so its quantity and destination stay as they are. Dates and notes can still be corrected.`);
  return errors;
}
