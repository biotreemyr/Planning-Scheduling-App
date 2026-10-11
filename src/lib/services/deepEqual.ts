// Equality for the workspace's plain data (strings, numbers, booleans, arrays, plain objects), usable
// in the browser where node:util is not.
export function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => isDeepStrictEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
