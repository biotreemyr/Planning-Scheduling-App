// Quick periods for a print or Excel window, worked out from today; Custom shows its own dates.
export type PrintPeriod = "this-month" | "last-month" | "last-3" | "this-year" | "all" | "custom";
export const PRINT_PERIODS: { key: PrintPeriod; label: string }[] = [
  { key: "this-month", label: "This month" }, { key: "last-month", label: "Last month" }, { key: "last-3", label: "Last 3 months" },
  { key: "this-year", label: "This year" }, { key: "all", label: "All dates" }, { key: "custom", label: "Custom" }
];
export function periodRange(period: PrintPeriod, today: string): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (period === "last-month") return { from: iso(new Date(year, month - 2, 1)), to: iso(new Date(year, month - 1, 0)) };
  if (period === "last-3") return { from: iso(new Date(year, month - 3, 1)), to: iso(new Date(year, month, 0)) };
  if (period === "this-year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === "all") return { from: "", to: "" };
  return { from: iso(new Date(year, month - 1, 1)), to: iso(new Date(year, month, 0)) };
}
