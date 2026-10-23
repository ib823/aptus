/**
 * Who states X-RateLimit-Remaining on a query's answer (P1.4, D23).
 *
 * TWO LAYERS COUNTED THE SAME CALL, AND THE EDGE'S FIGURE WON. The edge
 * (middleware.ts) sets X-RateLimit-Remaining from its machine-credential
 * bucket (600 a minute, with the address's backstop) on the pass-through
 * response, and Next applies that header before the route answers; it then
 * adds a route header only when it is absent. So the route's
 * x-ratelimit-remaining, from the key's 60-a-minute bucket, was dropped, and
 * a caller pacing a paging run by it saw about 590 left beside a limit of 60,
 * and met 429 after 60 calls.
 *
 * So, on a data read that carries a query-surface name (exactly the requests
 * whose answers the route gives x-ratelimit-*), the edge does not set the
 * header. It hands its figure to the route in a request header instead, and
 * the route states the smaller of the two: whichever bucket refuses first. A
 * `?limit` read, and every other path, keeps the edge's header as before.
 *
 * Edge-safe: no Node API, so middleware can import it.
 */

import { isReservedName } from "@/lib/odata/params";

/** The edge's remaining calls, from middleware to the route. Never taken from the caller: middleware removes it first. */
export const EDGE_RATE_REMAINING_HEADER = "x-coreedge-edge-ratelimit-remaining";

const DATA_READ_PATH = /^\/api\/northbound(?:\/v1)?\/interfaces\/[^/]+\/data$/;

/** Whether the route, not the edge, states X-RateLimit-Remaining on this request's answer. */
export function routeStatesRateRemaining(method: string, pathname: string, searchParams: URLSearchParams): boolean {
  if (method !== "GET" || !DATA_READ_PATH.test(pathname)) return false;
  for (const name of searchParams.keys()) if (isReservedName(name)) return true;
  return false;
}

/** What a query's answer states: the key's own remaining calls, or the edge's when fewer. */
export function rateRemaining(own: number, edge: string | null): number {
  const left = Math.max(0, own);
  if (edge === null || !/^[0-9]{1,9}$/.test(edge)) return left;
  return Math.min(left, Number(edge));
}
