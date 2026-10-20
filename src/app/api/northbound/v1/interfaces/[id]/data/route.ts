/**
 * GET /api/northbound/v1/interfaces/[id]/data — the v1 path of GET /api/northbound/interfaces/[id]/data.
 *
 * AN ALIAS, NOT A COPY (P1.10). This file re-exports the handler that path
 * exports, so the two are one function: edge limits, authentication, the
 * per-credential limits, grant binding, the audit row and the correlation id
 * cannot drift apart, because there is only one of each. The handler reads
 * which path it was called on from the request, for the audit row.
 * tests/unit/northbound/versioned-routes.test.ts fails if a route exists on
 * one path and not the other, or if this stops being the same function.
 */

export { GET } from "@/app/api/northbound/interfaces/[id]/data/route";

// Segment config must be a literal in the route file itself; Next does not
// follow a re-export for it.
export const dynamic = "force-dynamic";
