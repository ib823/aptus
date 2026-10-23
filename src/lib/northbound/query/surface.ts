/**
 * The query surface's switch (P1.4, 3.17).
 *
 *   COREEDGE_QUERY_SURFACE=on    query parameters on /data are served
 *   anything else (the default)  they are REFUSED, QUERY_NOT_AVAILABLE /
 *                                NOT_ENABLED — never ignored
 *
 * OFF REFUSES; IT NEVER IGNORES. An app that filters by customer and is
 * served by a deployment that ignores the filter receives every customer's
 * rows. So the first deployment of this code, with the switch off, is the
 * guard: every later rollback target refuses the reserved names instead of
 * dropping them (threat N14), and a rollback of the switch itself does the
 * same.
 *
 * Only an exact "on" (any case, trimmed) switches it on: a typo leaves the
 * surface refusing, which is the safe side.
 *
 * WITH THE SWITCH ON, THE RING MUST BE READABLE. Cursors and the audit hash
 * need it; a deployment that cannot read it refuses every query-surface call
 * with 500 before authorisation, and legacy reads are unaffected.
 */

import { queryRefusal, type QueryRefusal } from "@/lib/odata/rules";
import { readTokenRing, TokenRingConfigError, type TokenRing } from "@/lib/security/token-ring";

export const ENV_QUERY_SURFACE = "COREEDGE_QUERY_SURFACE";

export type QuerySurfaceMode = "off" | "on";

type Env = Readonly<Record<string, string | undefined>>;

export function querySurfaceMode(env: Env = process.env): QuerySurfaceMode {
  return (env[ENV_QUERY_SURFACE] ?? "").trim().toLowerCase() === "on" ? "on" : "off";
}

export function querySurfaceEnabled(env: Env = process.env): boolean {
  return querySurfaceMode(env) === "on";
}

/**
 * The route's gate for a request on the query surface: the switch, then the
 * ring. A refusal here costs no statement.
 */
export function querySurfaceGate(env: Env = process.env): { readonly ok: true; readonly ring: TokenRing } | QueryRefusal {
  if (!querySurfaceEnabled(env)) {
    return queryRefusal("QUERY_NOT_AVAILABLE", "NOT_ENABLED", "This deployment does not serve query parameters yet.");
  }
  try {
    return { ok: true, ring: readTokenRing(env) };
  } catch (err) {
    if (!(err instanceof TokenRingConfigError)) throw err;
    return queryRefusal("QUERY_SURFACE_MISCONFIGURED", "TOKEN_RING_UNAVAILABLE", "This deployment cannot serve query parameters at the moment.");
  }
}
