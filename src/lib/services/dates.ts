// Every date the scheduler shows is DD/MM/YYYY in numbers.
const pad = (value: number) => String(value).padStart(2, "0");

// A plain day ("2026-10-04") is shown as written; a timestamp is shown in local time.
export function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// DD/MM/YYYY HH:MM, local time.
export function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Short weekday for a plain day, e.g. "Thu".
export const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
