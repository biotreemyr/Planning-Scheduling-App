import { orderColor } from "@/lib/services/orders";

// The order's running number in a black box; its tab colour comes from the same number.
export function OrderBadge({ number, poNumber }: { number?: number; poNumber?: string }) {
  if (!number) return null;
  return <span className="order-badge" title={poNumber ? `Order ${number} · ${poNumber}` : `Order ${number}`} style={{ "--order-color": orderColor(number) } as React.CSSProperties}>{number}</span>;
}

export function PriorityMark({ priority }: { priority: string }) {
  if (priority !== "High" && priority !== "Urgent") return null;
  return <span className={`priority-mark ${priority.toLowerCase()}`} title={`${priority} priority`} aria-label={`${priority} priority`}>!</span>;
}
