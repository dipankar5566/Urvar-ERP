// Machine-to-machine auth for the /api/integration/** surface — a single
// trusted local caller (the integration service), not a public API with
// many consumers, so a static shared secret compared with timingSafeEqual
// is proportionate (same crypto primitive src/lib/session.ts already uses
// for its cookie HMAC). Not a Better-Auth-style API-key system; that's
// unnecessary surface area for one caller.
//
// Note on network-layer restriction: the plan called for also rejecting
// non-loopback requests as defense in depth, but Next.js Route Handlers
// don't expose the underlying TCP remote address (no reverse proxy is in
// front of this app), so that can't be enforced in application code
// without a custom server. In this single-machine deployment, restrict
// exposure at the OS/firewall level instead; the shared secret below is
// the real boundary.
import { timingSafeEqual } from "crypto";

export function verifyIntegrationRequest(request: Request): boolean {
  const secret = process.env.INTEGRATION_SECRET;
  if (!secret) return false;

  const provided = request.headers.get("x-integration-secret");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
