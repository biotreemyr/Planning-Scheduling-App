import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Attaches the Bio Tree Core Clerk session to the request.
 *
 * `auth.protect()` is what triggers Clerk's handshake with its Frontend API.
 * On a development instance that handshake is how a session created on another
 * origin (Core) becomes visible here, because a dev instance tracks the browser
 * per origin rather than with a cookie on the shared registrable domain.
 * Redirecting to Core ourselves before Clerk can handshake produces a loop:
 * this app sees no session, Core sees a signed-in user and sends them back.
 *
 * `unauthenticatedUrl` keeps the previous behaviour for genuinely signed-out
 * visitors -- they still land on Core's sign-in, since this app owns no sign-in
 * screen -- but only after Clerk has had its chance to resolve the session.
 * Authorization is untouched: this only establishes who the visitor is. The
 * page still asks Core whether they may enter, and still explains refusals.
 *
 * With no Clerk keys configured the request passes through unauthenticated and
 * the guards deny it, rather than the whole app failing to boot in demo mode.
 */
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const coreMode = (process.env.SCHEDULER_AUTH_MODE ?? (process.env.NODE_ENV === "development" ? "demo" : "core")) === "core";
const signInUrl = process.env.BIO_TREE_CORE_SIGN_IN_URL || undefined;

const withClerk = clerkMiddleware(async (auth) => {
  if (!coreMode) return;
  await auth.protect({ unauthenticatedUrl: signInUrl });
});

export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  if (!clerkConfigured) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/(api|trpc)(.*)",
    // Clerk's handshake round-trips through this path; Core matches it too.
    "/__clerk/:path*",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|ttf|woff2?|csv|docx?|xlsx?|zip|webmanifest)).*)"
  ]
};
