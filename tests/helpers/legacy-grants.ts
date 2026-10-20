/**
 * Mocked-Prisma rows as the P0.1 deploy leaves them, for broker and Studio
 * tests whose fixtures predate grant binding.
 *
 * Those fixtures write a grant as `{ decision, expiresAt }`: no interface, so
 * an unbound legacy grant, which legacy mode honours on the old tuple only for
 * an interface that existed by the grant's cut-off (grant-binding.ts,
 * `isUsableUnder`). The fixtures mean "a grant that worked before the deploy",
 * so these wrappers fill in what the real rows would carry: the cut-off the
 * P0.1 migration stamps on every grant it left unbound, and an interface
 * created before it. A field a fixture sets itself is kept.
 */

/** When the P0.1 migration ran, in these fixtures. */
export const DEPLOYED_AT = new Date("2026-06-01T00:00:00Z");
/** Before the deploy: when every fixture grant and interface was created. */
export const BEFORE_DEPLOY = new Date("2026-01-01T00:00:00Z");

type Row = Record<string, unknown>;

function fill(row: unknown, defaults: Row): unknown {
  if (row === null || typeof row !== "object") return row;
  return { ...defaults, ...(row as Row) };
}

/** Grant rows (one, or an array) as the deploy left them. */
export function deployedGrantRows<T>(rows: T): T {
  const defaults = { createdAt: BEFORE_DEPLOY, unboundCutoffAt: DEPLOYED_AT };
  return (Array.isArray(rows) ? rows.map((r) => fill(r, defaults)) : fill(rows, defaults)) as T;
}

/** Interface rows (one, or an array) created before the deploy. */
export function preDeployInterfaceRows<T>(rows: T): T {
  const defaults = { createdAt: BEFORE_DEPLOY };
  return (Array.isArray(rows) ? rows.map((r) => fill(r, defaults)) : fill(rows, defaults)) as T;
}
