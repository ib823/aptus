/**
 * Resolving "tenant" on the live-read path — across BOTH registries that word names.
 *
 * THE DEFECT THIS EXISTS FOR. "Tenant" named two disjoint sets of keys and
 * nothing said so:
 *
 *   · the DECLARED CONNECTIONS of an organization — `SapConnection.key`, e.g.
 *     "qa-conn-verify" — which is what the Studio tenant switcher lists, because
 *     `resolveStudioTenants` reads those rows;
 *   · the DEPLOYMENT'S CONFIGURED TENANTS — env-derived, e.g. "customizing" —
 *     which is what `getSapTenant` validates against.
 *
 * The switcher offered the first. The read endpoints accepted only the second.
 * So a consultant selected the connection they had just created, pressed Run,
 * and got 400 "Valid tenant and service are required" — while the identical call
 * with a deployment key returned 200. Every connection a user could create was
 * unusable on the one screen whose stated purpose is proving an interface
 * against the real tenant before writing code against it.
 *
 * WHY NOBODY SAW IT FOR SO LONG, which is the part worth keeping. Until
 * connection creation was repaired, no organization had any connection at all,
 * so `resolveStudioTenants` always fell through to the deployment tenants and
 * the switcher offered exactly the keys the read path expected. The two
 * registries agreed BECAUSE one of them was permanently empty. Fixing the create
 * path is what pulled them apart: the first successful connection an
 * organization declares is the moment its Test Console stops working.
 *
 * A latent disagreement between two sources of truth stays invisible while one
 * of them has no rows. That is worth remembering the next time something is
 * "already handled".
 *
 * RESOLUTION ORDER IS DELIBERATE. Deployment tenants are tried FIRST so that
 * /sap-explorer and every existing caller behave exactly as before, then the
 * caller's own connections. An organization that has declared a connection whose
 * key happens to collide with a deployment key keeps the old meaning, which is
 * the conservative choice: this function may add reach, never silently
 * redirect an existing one somewhere new.
 */

import { getSapTenant, type SapTenant } from "./tdd-connector";
import { resolveSapConnection, toSapTenant } from "./connection-resolver";

export type TenantSource = "deployment" | "connection";

export interface ResolvedReadTenant {
  tenant: SapTenant;
  source: TenantSource;
}

/**
 * Find the tenant a live read should run against, from either registry.
 *
 * `organizationId` may be null — an unauthenticated public-catalogue caller has
 * no organization, and for them only deployment tenants exist. Returns null when
 * neither registry knows the key, which the caller renders as a 400.
 */
export async function resolveReadTenant(
  envPrefix: string,
  product: string,
  organizationId: string | null,
  key: string,
): Promise<ResolvedReadTenant | null> {
  if (!key) return null;

  const configured = getSapTenant(envPrefix, key);
  if (configured) return { tenant: configured, source: "deployment" };

  if (!organizationId) return null;

  const connection = await resolveSapConnection(organizationId, product, key);
  if (!connection) return null;

  return { tenant: toSapTenant(connection), source: "connection" };
}

/**
 * The message for a key neither registry knows.
 *
 * NAMES BOTH PLACES IT LOOKED. "Valid tenant and service are required" told a
 * consultant nothing about which of the two things they had got wrong, on a
 * screen where the value had been chosen from a dropdown the product itself
 * populated.
 */
export function unknownTenantMessage(key: string): string {
  return (
    `No tenant named "${key}" is available. It matches neither a tenant configured ` +
    `on this deployment nor an active connection declared by your organization — ` +
    `check the connection is active on the Connections screen.`
  );
}
