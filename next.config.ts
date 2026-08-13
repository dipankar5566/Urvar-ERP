import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is reached through a Cloudflare tunnel on this hostname, not
  // localhost. Next blocks cross-origin requests to dev-only assets by
  // default, which silently kills client-side JS when running `next dev`
  // behind the tunnel — pages render but no button, dialog or tab responds.
  // Only affects development; ignored by `next build`/`next start`.
  allowedDevOrigins: ["erp.urvarindia.com"],
};

export default nextConfig;
