/**
 * The bearer credential on a request — parsed in ONE place.
 *
 * Its own module, with no imports, because two runtimes need it: the route
 * (auth.ts, which looks the credential up in Postgres) and the edge middleware,
 * which keys the machine-route rate limit by the credential presented (P0.5)
 * and cannot import Prisma. Two parsers would disagree on some header, and the
 * edge would then count one credential under a key the route never sees.
 */

/** Pull the bearer credential out of an Authorization header. */
export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}
