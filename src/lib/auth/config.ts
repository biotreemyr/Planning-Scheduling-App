import "server-only";

export function getAuthMode(env = process.env): "demo" | "core" {
  const mode = env.SCHEDULER_AUTH_MODE ?? (env.NODE_ENV === "development" ? "demo" : "core");
  if (mode !== "demo" && mode !== "core") throw new Error("Invalid SCHEDULER_AUTH_MODE");
  if (mode === "demo" && env.NODE_ENV === "production") throw new Error("Demo access is disabled in production");
  return mode;
}

export function getSignInUrl(env = process.env): string | null {
  if (!env.BIO_TREE_CORE_SIGN_IN_URL) return null;
  const url = new URL(env.BIO_TREE_CORE_SIGN_IN_URL);
  if (url.protocol !== "https:" && !(env.NODE_ENV === "development" && url.protocol === "http:" && url.hostname === "localhost")) {
    throw new Error("Core sign-in URL must use HTTPS");
  }
  return url.toString();
}
