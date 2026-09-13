export function localPersistenceAllowed(host: string | null, env: { NODE_ENV?: string; SCHEDULER_PERSISTENCE?: string; SCHEDULER_AUTH_MODE?: string }) {
  return env.NODE_ENV === "development" && env.SCHEDULER_PERSISTENCE === "local" && (env.SCHEDULER_AUTH_MODE === undefined || env.SCHEDULER_AUTH_MODE === "demo") && !!host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

export function sameLocalOrigin(host: string | null, origin: string | null) {
  if (!host || !origin) return false;
  try { const url = new URL(origin); return url.host === host && ["http:", "https:"].includes(url.protocol); } catch { return false; }
}
