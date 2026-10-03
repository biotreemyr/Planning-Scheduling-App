import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Attaches the Bio Tree Core Clerk session to the request so server components
 * can read it with `auth()`. It deliberately does not call `auth.protect()`:
 * this app owns no sign-in screen, so an unauthenticated visitor is redirected
 * to Core by the page itself, which can also say why access was refused.
 *
 * With no Clerk keys configured the request passes through unauthenticated and
 * the guards deny it, rather than the whole app failing to boot in demo mode.
 */
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const withClerk = clerkMiddleware();

export default function middleware(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  if (!clerkConfigured) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/(api|trpc)(.*)",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|ttf|woff2?|csv|docx?|xlsx?|zip|webmanifest)).*)"
  ]
};
