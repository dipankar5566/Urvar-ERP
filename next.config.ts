import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build somewhere other than the live .next by setting NEXT_DIST_DIR.
  // A failed `next build` still overwrites static/chunks before it dies, which
  // takes the running server down while HTTP checks keep returning 200 — so
  // experiments MUST build to a scratch dir and only be swapped in on success.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // The app is reached through a Cloudflare tunnel on this hostname, not
  // localhost. Next blocks cross-origin requests to dev-only assets by
  // default, which silently kills client-side JS when running `next dev`
  // behind the tunnel — pages render but no button, dialog or tab responds.
  // Only affects development; ignored by `next build`/`next start`.
  allowedDevOrigins: ["erp.urvarindia.com"],

  // Hide Next's dev-tools badge (the "N" circle, bottom-left by default).
  // It is only rendered by `next dev`, which is what serves production until
  // the build is fixed — staff should not see a framework debug control on
  // the live ERP. Compile and runtime errors still surface normally.
  devIndicators: false,
};

export default nextConfig;
