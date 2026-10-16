// The demo has no sign-in and every right, so it may only save to a copy: a database whose name says so
// (bio_tree_scheduler_scratch, …_preview, …_test, …_dev). The live database is never one of them.
export function copyDatabase(url: string | undefined) {
  try { return !!url && /(^|_)(scratch|preview|test|dev)(_|$)/.test(decodeURIComponent(new URL(url).pathname.slice(1))); } catch { return false; }
}

export function localPersistenceAllowed(host: string | null, env: { NODE_ENV?: string; SCHEDULER_PERSISTENCE?: string; SCHEDULER_AUTH_MODE?: string; DATABASE_URL?: string }) {
  return env.NODE_ENV === "development" && env.SCHEDULER_PERSISTENCE === "local" && (env.SCHEDULER_AUTH_MODE === undefined || env.SCHEDULER_AUTH_MODE === "demo") && copyDatabase(env.DATABASE_URL) && !!host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

export function sameLocalOrigin(host: string | null, origin: string | null) {
  if (!host || !origin) return false;
  try { const url = new URL(origin); return url.host === host && ["http:", "https:"].includes(url.protocol); } catch { return false; }
}
