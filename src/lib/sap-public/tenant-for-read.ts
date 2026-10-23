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
 * caller's own connections. This function may add reach, never silently
 * redirect an existing one somewhere new.
 *
 * A KEY BOTH REGISTRIES KNOW IS REFUSED, NOT GUESSED. This comment used to say
 * the deployment tenant simply won such a collision, and called that the
 * conservative choice. It was the opposite. The tenant switcher lists the
 * organization's OWN rows, so it showed "Org A PROD system" while every read
 * went to the shared demo host with the deployment's credentials. Because no
 * connection had resolved, the PROD ceiling was skipped too, and stored probes
 * were filed under the shared bare key. That is a shared demo tenant silently
 * presented as the organization's own connection, which tenants.ts names as
 * the fiction honest status exists to prevent. Picking the connection instead
 * would silently move every existing reader of that deployment key, which is
 * the redirect this function promises never to make. So neither is picked: the
 * read is refused with a sentence that says how to fix it. Creating such a
 * connection is refused at /api/studio/connections; this check still covers
 * rows saved before that, and a deployment tenant added to env later.
 *
 * A CONNECTION THAT WILL NOT OPEN IS A REFUSAL, NOT A CRASH. The resolver
 * throws when a row's secrets fail to decrypt or its auth type is unknown.
 * Every route that calls this one called it outside its try block, so the
 * throw became a 500 with an empty body. The client's `response.json()` then
 * failed and the screen showed a JSON parse error instead of a reason. The
 * northbound binding path catches the same throw as CONNECTION_UNREADABLE;
 * this is the same treatment for the console.
 */

import { NextResponse } from "next/server";

import type { CeilingGrantRow } from "@/lib/governed/call-loads";
import { ERROR_CODES } from "@/types/api";

import type { SapEnvironment } from "./environment";
import { getSapTenant, type SapTenant } from "./tdd-connector";
import {
  connectionRefusalMessage,
  hasActiveSapConnection,
  resolveSapConnection,
  toSapTenant,
} from "./connection-resolver";

export type TenantSource = "deployment" | "connection";

export interface ResolvedReadTenant {
  tenant: SapTenant;
  source: TenantSource;
  /**
   * The stored connection this tenant came from, when it came from one.
   *
   * NULL FOR A DEPLOYMENT TENANT, which has no row and belongs to no
   * organization. The console read guard needs both fields: the id to record
   * which system a read actually reached, and the environment to decide whether
   * reading it needs an approved grant. `toSapTenant` carries the environment
   * onto the projection already, but as an optional STRING (SapTenant is the
   * connector's currency and predates the enum), and the guard must not re-parse
   * a value that has already been parsed once — so the row's own typed value is
   * carried here instead.
   */
  connection: {
    id: string;
    environment: SapEnvironment | null;
    /**
     * The grants the console's environment ceiling judges, read in the
     * connection's own statement for the organization named here (P0.14b
     * review round 5, governed/call-loads.ts loadConsoleConnection), so the
     * console's authorise step sends no second statement. Absent when they
     * were not read with it; the ceiling then reads them itself.
     */
    ceiling?: { readonly organizationId: string; readonly grants: readonly CeilingGrantRow[] };
    /**
     * SapConnection.transport. The console reads with the platform's own
     * fetch, so it refuses a connection served by the Tenant Twin
     * (governed/console.ts bind; wave 2 integration review round 3).
     */
    transport?: string;
    /**
     * SapConnection.revision when it was read: a stored tenant service listing
     * records it, so a listing of a connection re-pointed since is shown as
     * such (P1.2, tenant-listing.ts).
     */
    revision?: number;
  } | null;
}

/**
 * Why a key that DOES name a tenant still cannot be read.
 *
 *   - CONNECTION_UNREADABLE: the organization's connection under this key
 *     exists, but its secrets will not open or its auth type is unknown. The
 *     same reason the northbound binding gives for the same throw.
 *   - TENANT_KEY_SHADOWED: the key names both a deployment tenant and one of
 *     the organization's own active connections, so which system was meant
 *     cannot be known.
 */
export type ReadTenantRefusalReason = "CONNECTION_UNREADABLE" | "TENANT_KEY_SHADOWED";

export interface ReadTenantRefusal {
  refused: ReadTenantRefusalReason;
}

/**
 * Find the tenant a live read should run against, from either registry.
 *
 * `organizationId` may be null — an unauthenticated public-catalogue caller has
 * no organization, and for them only deployment tenants exist. Returns null when
 * neither registry knows the key, which the caller renders as a 400. Returns a
 * refusal when the key is known but cannot be read, which the caller answers
 * with `readTenantRefusalResponse`.
 *
 * A REFUSAL IS ITS OWN SHAPE, NOT A THROW AND NOT NULL. A throw is what every
 * caller forgot to catch. Null would tell a user their connection does not
 * exist when it does. As its own member of the return type, a refusal a caller
 * does not handle is a compile error rather than a 500.
 */
export async function resolveReadTenant(
  envPrefix: string,
  product: string,
  organizationId: string | null,
  key: string,
): Promise<ResolvedReadTenant | ReadTenantRefusal | null> {
  if (!key) return null;

  const configured = getSapTenant(envPrefix, key);
  if (configured) {
    // Existence only: whether the row would decrypt does not change that the
    // key is ambiguous, so its secrets are not opened to find out.
    if (organizationId && (await hasActiveSapConnection(organizationId, product, key))) {
      return { refused: "TENANT_KEY_SHADOWED" };
    }
    return { tenant: configured, source: "deployment", connection: null };
  }

  if (!organizationId) return null;

  let connection;
  try {
    connection = await resolveSapConnection(organizationId, product, key, { withCeilingGrants: true });
  } catch (err) {
    // The response says only what the user must fix. The log keeps enough to
    // find the row, and never the error text, which can describe the secret.
    console.warn("[sap/tdd] connection could not be opened", {
      organizationId,
      product,
      key,
      reason: err instanceof Error ? err.name : "unknown",
    });
    return { refused: "CONNECTION_UNREADABLE" };
  }
  if (!connection) return null;

  return {
    tenant: toSapTenant(connection),
    source: "connection",
    connection: {
      id: connection.id,
      environment: connection.environment,
      ...(connection.transport ? { transport: connection.transport } : {}),
      ...(connection.revision !== undefined ? { revision: connection.revision } : {}),
      ...(connection.ceilingGrants ? { ceiling: { organizationId, grants: connection.ceilingGrants } } : {}),
    },
  };
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

/**
 * The answer to a refused read: a 409 with one sentence the user can act on.
 *
 * 409 CONFLICT is what the connection test route answers for a row whose
 * secrets will not open. The request was well formed and the caller may make
 * it; the stored configuration is what conflicts with it. Nothing was sent to
 * SAP, so there is no read to audit, the same as the 400 for an unknown key.
 *
 * DEACTIVATE FIRST, THEN SAVE AGAIN. The steps used to come the other way
 * round, and the first one could not be done: /api/studio/connections refuses
 * a second active connection on the same declared environment, whatever its
 * key, so saving "the same connection under a different key" while this one
 * was still active was refused as its twin. Deactivated, this row no longer
 * shadows the key or collides with the new one.
 */
export function readTenantRefusalResponse(refusal: ReadTenantRefusal, key: string): NextResponse {
  const message =
    refusal.refused === "CONNECTION_UNREADABLE"
      ? connectionRefusalMessage("CONNECTION_UNREADABLE", "")
      : `"${key}" names both a tenant configured on this deployment and an active connection ` +
        `declared by your organization, so it is not clear which system to read, and neither was read. ` +
        `Deactivate this connection on the Connections screen, then save it again under a different key.`;
  return NextResponse.json({ error: { code: ERROR_CODES.CONFLICT, message } }, { status: 409 });
}
