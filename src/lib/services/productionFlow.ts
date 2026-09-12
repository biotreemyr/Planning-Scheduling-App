import type { PlanLine } from "@/lib/domain/types";
import { canViewCalendar, type CalendarDirectory, type CalendarPerson } from "@/lib/domain/calendarAccess";

export type CompletionInput = { quantity: number; destinationId: string; notes: string };
export type WipTransfer = {
  id: string; sourceLineId: string; sourceCalendarId: string; calendarId: string;
  productId: string; quantity: number; uom: string; orderReference?: string; notes: string;
  createdAt: string; createdBy: string; receivedAt?: string; receivedBy?: string; plannedLineId?: string;
};

export function validateCompletion(line: PlanLine, input: CompletionInput, person: CalendarPerson, directory: CalendarDirectory) {
  const source = directory.calendars.find((calendar) => calendar.id === line.calendarId);
  const errors: string[] = [];
  if (!source || person.role !== "production" || !canViewCalendar(person, source, directory)) errors.push("Production access to this calendar is required.");
  if (line.completedAt) errors.push("This activity is already complete.");
  if (!Number.isFinite(input.quantity) || input.quantity < 0) errors.push("Yield must be zero or greater.");
  if (input.destinationId) {
    const destination = directory.calendars.find((calendar) => calendar.id === input.destinationId);
    if (!destination || destination.processId === source?.processId) errors.push("Choose a different receiving process.");
    if (!(input.quantity > 0)) errors.push("Only a positive yield can be transferred.");
    if (destination && !directory.people.some((member) => member.role === "production" && canViewCalendar(member, destination, directory))) errors.push("Assign a production team to the receiving calendar first.");
  }
  return errors;
}
