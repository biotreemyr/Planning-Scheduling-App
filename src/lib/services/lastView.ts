// Where each person last was: the page, Calendar or List, Month, Week or Day, and the QA/QC and
// Reports section. Kept in this browser per person, so the app reopens where they left it and
// nobody else's view changes.
export type LastView = {
  tab?: string;
  planningView?: "calendar" | "list";
  calendarView?: "month" | "week" | "day";
  statusSection?: string;
  reportSection?: string;
};

export const lastViewKey = (personId: string) => `scheduler.lastView.${personId}`;

const text = (value: unknown) => typeof value === "string" && value ? value : undefined;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) => allowed.includes(value as T) ? value as T : undefined;

export function readLastView(personId: string, storage: Pick<Storage, "getItem"> = localStorage): LastView {
  try {
    const saved = JSON.parse(storage.getItem(lastViewKey(personId)) ?? "null");
    if (!saved || typeof saved !== "object") return {};
    return {
      tab: text(saved.tab),
      planningView: oneOf(saved.planningView, ["calendar", "list"] as const),
      calendarView: oneOf(saved.calendarView, ["month", "week", "day"] as const),
      statusSection: text(saved.statusSection),
      reportSection: text(saved.reportSection)
    };
  } catch {
    return {};
  }
}

export function saveLastView(personId: string, view: LastView, storage: Pick<Storage, "setItem"> = localStorage) {
  try { storage.setItem(lastViewKey(personId), JSON.stringify(view)); } catch { /* not remembered */ }
}
