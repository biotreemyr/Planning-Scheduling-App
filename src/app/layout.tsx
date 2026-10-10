import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "@toast-ui/calendar/dist/toastui-calendar.min.css";
import "./globals.css";
import "./workstation.css";
import { getAuthMode } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Bio Tree Scheduler MVP",
  description: "Production planning and detailed scheduling MVP for Bio Tree"
};

// In Core mode, Clerk runs in the browser too: it renews the short-lived session token
// in the background. Without it the token expires after about a minute and saves, which
// are background requests, fail because they cannot follow Clerk's renewal redirect.
function coreClerkKey() {
  try { return getAuthMode() === "core" ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY : undefined; } catch { return undefined; }
}

/**
 * Where "Bio Tree Core" sends people. Uses BIO_TREE_CORE_URL when set, and
 * otherwise falls back to the origin of the configured sign-in URL so the link
 * works without adding a second variable that could drift out of step.
 */
function coreHomeUrl() {
  const explicit = process.env.BIO_TREE_CORE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  try {
    const signIn = process.env.BIO_TREE_CORE_SIGN_IN_URL;
    return signIn ? new URL(signIn).origin : null;
  } catch {
    return null;
  }
}

/** Lets someone who arrived from a Core tile get back to it. */
function CoreBar() {
  const href = coreHomeUrl();
  if (!href) return null;
  return (
    <div className="core-bar">
      <a className="core-bar-link" href={`${href}/dashboard`}>
        <span aria-hidden="true">←</span> Bio Tree Core
      </a>
      <span className="core-bar-app">Production Scheduling</span>
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = coreClerkKey();
  const shell = (
    <>
      <CoreBar />
      {children}
    </>
  );
  return (
    <html lang="en">
      <body>{publishableKey ? <ClerkProvider publishableKey={publishableKey} signInUrl={process.env.BIO_TREE_CORE_SIGN_IN_URL || undefined}>{shell}</ClerkProvider> : shell}</body>
    </html>
  );
}
