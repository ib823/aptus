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
 * `machine-authfail:<ip>` on every 401 for a presented key that matches no
 * row, and the EDGE reads that bucket without spending it before anything else
 * (middleware.ts, machineRouteLimit). Once it is empty the address is refused
 * at the edge, before any lookup, until the window frees room.
 *
 * ONLY A KEY THAT MATCHES NO ROW (wave 1a integration review). A key whose row
 * is found and refuses — expired at its P0.11 deadline, its rotation overlap
 * closed, revoked, deactivated, on a retired solution, or dropped from the row
 * altogether by a re-issue or a second rotation (RetiredClientToken, wave 1a
 * final review) — is one fixed value, so
 * its own `machine:cred:<hash>` edge bucket already bounds what its lookups
 * cost, and touches nobody else. Counted against the ADDRESS, one tenant's dead
 * key still retrying behind a shared egress refused every other tenant's valid
 * key there: P0.11 makes an expired key or a closed overlap a routine event,
 * and P0.5 promises that a flooding key cannot throttle another key.
 *
 * Its own module, importing only the limiter and the address parser: the edge
 * reads the key from here, and route tests that stub the limiter with two names
 * still load it.
 */

import type { ClientAuthFailure } from "@/lib/northbound/auth";
import { getClientIp } from "@/lib/security/client-ip";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/** The bucket a caller address's failed credential lookups spend. */
export function machineAuthFailureKey(clientIp: string): string {
  return `machine-authfail:${clientIp}`;
}

/**
 * Count one failed lookup of a PRESENTED credential against its caller's
 * address, when that credential matched no row (`UNKNOWN_TOKEN`). A call with
 * no credential is not counted: it never reaches the database, and it keeps
 * the per-IP bucket it always had at the edge. A credential that matched a row
 * is not counted either: see the header.
 *
 * The answer is ignored: the call is already a 401. During a limiter outage
 * nothing is counted, and the edge is refusing machine calls with 503 anyway.
 */
export async function noteFailedCredential(
  headers: Headers,
  presented: string | null,
  reason: ClientAuthFailure,
): Promise<void> {
  if (!presented || reason !== "UNKNOWN_TOKEN") return;
  await checkRateLimit(machineAuthFailureKey(getClientIp(headers)), RATE_LIMITS.machineAuthFailure);
}
