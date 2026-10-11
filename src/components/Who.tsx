import { formatDateTime } from "@/lib/services/dates";

// Who changed something and when, in small print under it: "Planned by Angeline · 11/10/2026 14:02".
export function Who({ verb, who, at }: { verb: string; who?: string; at?: string }) {
  return who ? <small className="who">{verb} by {who}{at ? ` · ${formatDateTime(at)}` : ""}</small> : null;
}
