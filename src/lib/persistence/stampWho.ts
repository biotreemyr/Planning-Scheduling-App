import type { WorkspaceSnapshot } from "@/lib/domain/workspace";

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain => !!value && typeof value === "object" && !Array.isArray(value);
// Records are matched by their ID (production results by their activity); other lists by position.
const keyOf = (item: unknown) => isPlain(item) ? (typeof item.id === "string" ? item.id : typeof item.planLineId === "string" ? item.planLineId : undefined) : undefined;

function stamp(before: unknown, after: unknown, who: string): unknown {
  if (Array.isArray(after)) {
    const old = Array.isArray(before) ? before : [];
    const keyed = after.length > 0 && after.every((item) => keyOf(item) !== undefined);
    const byKey = keyed ? new Map(old.map((item) => [keyOf(item), item])) : undefined;
    return after.map((item, index) => stamp(byKey ? byKey.get(keyOf(item)) : old[index], item, who));
  }
  if (!isPlain(after)) return after;
  const old = isPlain(before) ? before : {};
  return Object.fromEntries(Object.entries(after).map(([key, value]) =>
    [key, key.endsWith("By") && typeof value === "string" && value !== old[key] ? who : stamp(old[key], value, who)]));
}

/**
 * The browser types the "who" fields (createdBy, testedBy, releasedBy, changedBy...). Every one a save
 * sets or changes is replaced with the signed-in person, so a record can't show someone else's name.
 * Names a save leaves as they were stay as recorded.
 */
export function stampWho(before: WorkspaceSnapshot, after: WorkspaceSnapshot, who: string): WorkspaceSnapshot {
  return { ...after, data: stamp(before.data, after.data, who) as WorkspaceSnapshot["data"] };
}
