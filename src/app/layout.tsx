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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = coreClerkKey();
  return (
    <html lang="en">
      <body>{publishableKey ? <ClerkProvider publishableKey={publishableKey} signInUrl={process.env.BIO_TREE_CORE_SIGN_IN_URL || undefined}>{children}</ClerkProvider> : children}</body>
    </html>
  );
}
