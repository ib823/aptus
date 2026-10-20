/**
 * Failed credential lookups, counted per caller address (P0.5 review).
 *
 * WHY. The edge keys a machine route by the credential PRESENTED (A43), so a
 * new made-up bearer on every call is a new, empty bucket every time. The
 * per-address backstop behind it is set for a vendor serving many customers
 * from one egress (6,000 a minute), not for a client that cannot authenticate
 * at all, and each call it admitted cost the route a Postgres lookup of the
 * token hash. The old per-IP bucket had held that to 120 writes or 300 reads a
 * minute; credential keying had made it 50 times cheaper.
 *
 * So the ROUTE, which is the only place that knows a credential failed, spends
 * `machine-authfail:<ip>` on every 401 for a presented key, and the EDGE reads
 * that bucket without spending it before anything else (middleware.ts,
 * machineRouteLimit). Once it is empty the address is refused at the edge,
 * before any lookup, until the window frees room.
 *
 * Its own module, importing only the limiter and the address parser: the edge
 * reads the key from here, and route tests that stub the limiter with two names
 * still load it.
 */

import { getClientIp } from "@/lib/security/client-ip";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/** The bucket a caller address's failed credential lookups spend. */
export function machineAuthFailureKey(clientIp: string): string {
  return `machine-authfail:${clientIp}`;
}

/**
 * Count one failed lookup of a PRESENTED credential against its caller's
 * address. A call with no credential is not counted: it never reaches the
 * database, and it keeps the per-IP bucket it always had at the edge.
 *
 * The answer is ignored: the call is already a 401. During a limiter outage
 * nothing is counted, and the edge is refusing machine calls with 503 anyway.
 */
export async function noteFailedCredential(headers: Headers, presented: string | null): Promise<void> {
  if (!presented) return;
  await checkRateLimit(machineAuthFailureKey(getClientIp(headers)), RATE_LIMITS.machineAuthFailure);
}
