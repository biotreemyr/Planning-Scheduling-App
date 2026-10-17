import type { NextConfig } from "next";

// Clerk's frontend API (where its script and session renewals come from), named in the publishable key.
function clerkOrigin() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try { return key ? `https://${Buffer.from(key.split("_")[2], "base64").toString("utf8").replace(/\$$/, "")}` : ""; } catch { return ""; }
}

// What the page may load and who may frame it. Next's own inline scripts need 'unsafe-inline';
// next dev also needs 'unsafe-eval'. Clerk may show a Cloudflare bot check in a frame.
function contentSecurityPolicy() {
  const clerk = clerkOrigin();
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${clerk} https://challenges.cloudflare.com`,
    `connect-src 'self' ${clerk}`,
    "img-src 'self' data: blob: https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].map((rule) => rule.replace(/\s+/g, " ").trim()).join("; ");
}

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  // Lets a second local dev server (e.g. a demo-mode preview) build without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ]
    }];
  }
};

export default nextConfig;
