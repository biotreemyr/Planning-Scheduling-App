import { formatDate } from "./dates";

/**
 * Dates worth a second look before saving, to catch a slip on the calendar (11/09 for 11/10).
 * Nothing is refused: the person confirms and saves anyway when the date is right.
 *   today    - usually the day it is keyed in (PO received, production started/completed): more than
 *              RECENT_DAYS ago is unusual
 *   plan     - planning: a date before today is unusual, and saved only with a reason (keying in past
 *              production, say)
 *   delivery - expected delivery: before today, or before the PO was received, is unusual
 * A date with today's day number in another month or year suggests today, the likely intent.
 */
export const RECENT_DAYS = 7;
export type DateRule = "today" | "plan" | "delivery";
export type DateCheck = { label: string; value?: string; rule: DateRule; was?: string; after?: { label: string; value?: string } };

const isDay = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}/.test(value);
const day = (value: string) => value.slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${day(to)}T12:00:00Z`) - Date.parse(`${day(from)}T12:00:00Z`)) / 86_400_000);
const ago = (days: number) => days === 1 ? "1 day ago" : `${days} days ago`;
const suggestion = (value: string, today: string) => day(value).slice(8, 10) === today.slice(8, 10) && day(value) !== today ? ` Did you mean ${formatDate(today)}?` : "";

/** What looks unusual about one date, or "" when it is fine (or unchanged from what was saved). */
export function dateWarning(check: DateCheck, today: string): string {
  if (!isDay(check.value) || (check.was !== undefined && isDay(check.was) && day(check.was) === day(check.value!))) return "";
  const value = day(check.value!), shown = formatDate(value), past = daysBetween(value, today);
  if (check.rule === "today" && past > RECENT_DAYS) return `${check.label} is ${shown}, ${ago(past)}.${suggestion(value, today)}`;
  if (check.rule === "plan" && past > 0) return `${check.label} is ${shown}, ${ago(past)}: planned in the past.${suggestion(value, today)}`;
  if (check.rule === "delivery") {
    if (past > 0) return `${check.label} is ${shown}, which has already passed.${suggestion(value, today)}`;
    if (check.after && isDay(check.after.value) && value < day(check.after.value!)) return `${check.label} ${shown} is before ${check.after.label} ${formatDate(day(check.after.value!))}.`;
  }
  return "";
}
export const dateWarnings = (checks: DateCheck[], today: string) => checks.map((check) => dateWarning(check, today)).filter(Boolean);
/** A plan date before today is kept only with the planner's reason. */
export const needsPastReason = (checks: DateCheck[], today: string) => checks.some((check) => check.rule === "plan" && !!dateWarning(check, today));
