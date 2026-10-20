/**
 * How a tenant key is normalized.
 *
 * SEPARATE MODULE ON PURPOSE, like api-key-header.ts. The connector normalizes
 * every key it stores, and the Connections form has to know whether the key
 * being typed is a NEW connection or the re-save of an existing one (the
 * SuccessFactors Basic-auth notice applies only to new ones). The form is a
 * client component and tdd-connector reads env and performs fetches, so the
 * rule lives here, once, and both import it.
 */

/**
 * Normalize a tenant key. A DB-backed connection's key must be normalized the
 * SAME way an env tenant's is: the key is what stored probes are recorded
 * under, so "X5M/100" and "x5m-100" resolving differently would split one
 * tenant's probe history in two.
 */
export function sanitizeTenantKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
