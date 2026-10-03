import "server-only";

export type AuthEnv = {
  NODE_ENV?: string;
  SCHEDULER_AUTH_MODE?: string;
  SCHEDULER_APP_URL?: string;
  BIO_TREE_CORE_SIGN_IN_URL?: string;
  BIO_TREE_CORE_DATABASE_URL?: string;
  BIO_TREE_CORE_APP_KEY?: string;
  BIO_TREE_CORE_CACHE_TTL_MS?: string;
};

export function getAuthMode(env: AuthEnv = process.env): "demo" | "core" {
  const mode = env.SCHEDULER_AUTH_MODE ?? (env.NODE_ENV === "development" ? "demo" : "core");
  if (mode !== "demo" && mode !== "core") throw new Error("Invalid SCHEDULER_AUTH_MODE");
  if (mode === "demo" && env.NODE_ENV === "production") throw new Error("Demo access is disabled in production");
  return mode;
}

function assertTrustedUrl(value: string, env: AuthEnv) {
  const url = new URL(value);
  const localDev = env.NODE_ENV === "development" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDev) throw new Error("Core URLs must use HTTPS");
  return url;
}

// Where this deployment is served, used to build the return URL Core sends the
// user back to. It comes from configuration, never from the request, so a
// forged Host header cannot turn Core's sign-in into an open redirect.
export function getAppUrl(env: AuthEnv = process.env): URL | null {
  if (!env.SCHEDULER_APP_URL) return null;
  return assertTrustedUrl(env.SCHEDULER_APP_URL, env);
}

/**
 * Core's Clerk sign-in URL. When `returnPath` is a same-app absolute path and
 * SCHEDULER_APP_URL is configured, Clerk is asked to send the user back here
 * after sign-in; otherwise Core falls back to its own dashboard.
 */
export function getSignInUrl(env: AuthEnv = process.env, returnPath?: string | null): string | null {
  if (!env.BIO_TREE_CORE_SIGN_IN_URL) return null;
  const url = assertTrustedUrl(env.BIO_TREE_CORE_SIGN_IN_URL, env);
  const appUrl = getAppUrl(env);
  // Reject protocol-relative ("//evil.example") and absolute paths outright.
  if (appUrl && returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//")) {
    url.searchParams.set("redirect_url", new URL(returnPath, appUrl).toString());
  }
  return url.toString();
}

export type CoreDirectoryConfig = { databaseUrl: string; appKey: string; cacheTtlMs: number };

export function getCoreDirectoryConfig(env: AuthEnv = process.env): CoreDirectoryConfig | null {
  if (!env.BIO_TREE_CORE_DATABASE_URL) return null;
  const parsed = Number(env.BIO_TREE_CORE_CACHE_TTL_MS);
  return {
    databaseUrl: env.BIO_TREE_CORE_DATABASE_URL,
    appKey: env.BIO_TREE_CORE_APP_KEY || "scheduler",
    cacheTtlMs: Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000
  };
}
