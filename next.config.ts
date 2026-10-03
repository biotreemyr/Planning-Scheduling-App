import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Lets a second local dev server (e.g. a demo-mode preview) build without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || ".next"
};

export default nextConfig;
