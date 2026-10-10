import { formatDate } from "./dates";

/**
 * A date column's filter, as a string so it sits with the table's other filters:
 * "d:2026-10-09" one day, "r:2026-10-01..2026-10-09" a range of days, "m:2026-10" a month,
 * "y:2026" a year, "none" rows with no date, "" everything.
 */
export type DateFilter = string;

export const dayFilter = (day: string) => `d:${day}`;
export const rangeFilter = (a: string, b: string) => a === b ? dayFilter(a) : `r:${a < b ? a : b}..${a < b ? b : a}`;
export const monthFilter = (month: string) => `m:${month}`;
export const yearFilter = (year: string) => `y:${year}`;

/** The first and last day a filter covers, for highlighting it on a calendar. */
export function filterSpan(filter: DateFilter): [string, string] | null {
  if (filter.startsWith("d:")) return [filter.slice(2), filter.slice(2)];
  if (filter.startsWith("r:")) { const [a, b] = filter.slice(2).split(".."); return a && b ? [a, b] : null; }
  if (filter.startsWith("m:")) return [`${filter.slice(2)}-01`, `${filter.slice(2)}-31`];
  if (filter.startsWith("y:")) return [`${filter.slice(2)}-01-01`, `${filter.slice(2)}-12-31`];
  return null;
}

export function matchesDateFilter(date: string | undefined, filter: DateFilter) {
  if (!filter) return true;
  if (filter === "none") return !date;
  const span = filterSpan(filter);
  const day = date?.slice(0, 10);
  return !!span && !!day && day >= span[0] && day <= span[1];
}

export const monthName = (month: string, style: "short" | "long" = "short") =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleString("en-GB", { month: style, year: "numeric" });

export function dateFilterLabel(filter: DateFilter) {
  if (!filter) return "All dates";
  if (filter === "none") return "No date";
  if (filter.startsWith("d:")) return formatDate(filter.slice(2));
  if (filter.startsWith("m:")) return monthName(filter.slice(2));
  if (filter.startsWith("y:")) return filter.slice(2);
  const span = filterSpan(filter);
  if (!span) return "All dates";
  // Within one year the first date drops its year: 01/10 – 09/10/2026.
  const [from, to] = span.map(formatDate);
  return span[0].slice(0, 4) === span[1].slice(0, 4) ? `${from.slice(0, 5)} – ${to}` : `${from} – ${to}`;
}
