import { orderColor } from "@/lib/services/orders";

// The order's running number in a black box; its tab colour comes from the same number.
// trial: an R&D, trial or pilot batch order, numbered on its own count and shown in navy.
export function OrderBadge({ number, poNumber, trial }: { number?: number; poNumber?: string; trial?: boolean }) {
  if (!number) return null;
  const kind = trial ? "R&D/trial order" : "Order";
  return <span className={trial ? "order-badge trial" : "order-badge"} title={poNumber ? `${kind} ${number} · ${poNumber}` : `${kind} ${number}`} style={{ "--order-color": orderColor(number) } as React.CSSProperties}>{number}</span>;
}

export function PriorityMark({ priority }: { priority: string }) {
  if (priority !== "High" && priority !== "Urgent") return null;
  return <span className={`priority-mark ${priority.toLowerCase()}`} title={`${priority} priority`} aria-label={`${priority} priority`}>!</span>;
}
