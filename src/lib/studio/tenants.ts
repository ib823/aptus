/**
 * Which SAP tenants can Studio see?
 *
 * Two mechanisms reach SAP in this codebase, and Studio should use both rather
 * than pretending only the newer one exists:
 *
 *   1. `SapConnection` rows — per-organization, secrets sealed at rest. What the
 *      keystone added, and what a real client deployment uses.
 *   2. `{PREFIX}_*` environment variables — ONE tenant shared by the whole
 *      deployment. What the existing SAP Explorer has run on for months.
 *
 * The resolver already implements "prefer the stored connection, fall back to
 * env" (that is why `resolveSapConnections` returns `[]` rather than throwing).
 * Studio's UI simply was not wired to the fallback, so a deployment with a
 * perfectly good env tenant reported "No SAP tenant connected" and disabled its
 * own Test Console.
 *
 * THE SOURCE IS CARRIED, NOT HIDDEN. An env tenant is shared across every
 * organization on the deployment — it is emphatically not "this client's SAP" —
 * so callers get `source` and the UI says so. Silently presenting a shared demo
 * tenant as a tenant connection would be exactly the kind of comfortable
 * fiction honest status exists to prevent.
 */

/**
 * The cookie remembering which tenant you were last looking at.
 *
 * IT LIVED IN StudioTopBar, WHICH IS `"use client"`. Every server that reads it —
 * three layouts, two pages, and the switch route — imported it from there, and a
 * server importing a value from a client module does not get the value: it gets
 * a client REFERENCE. Stringified into a cookie name, that produced
 *
 *     set-cookie: function(){throw Error("Attempted to call
 *     STUDIO_TENANT_COOKIE() from the server but ...")}=x5m080-development
 *
 * on a live deployment. It WORKED, which is why nobody noticed: writer and
 * readers all import the same broken reference, so they all agree on the same
 * 200-character garbage name. Symmetric corruption is indistinguishable from
 * correctness until something reads the cookie by its literal name.
 *
 * This is the same defect that broke the build in #192, where the manual read
 * the rail's section arrays out of a client module. A guard was added then and
 * scoped to `src/lib` — a route handler in `src/app/api` was outside it.
 *
 * NOW RE-EXPORTED from lib/studio/tenant-cookie: the constant is shared with
 * client components, and a client re-export of THIS module dragged Prisma (and
 * the tenant-scope guard's node:async_hooks) into the browser bundle.
 */
export { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenant-cookie";

import { prisma } from "@/lib/db/prisma";
import { getConfiguredSapTenants, SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";

export interface StudioTenant {
  /** Tenant key — also the key stored probes are recorded under. */
  key: string;
  label: string;
  product: string;
  /** "connection" = this organization's own row; "environment" = shared. */
  source: "connection" | "environment";
  /**
   * Which SAP environment this tenant is — "DEV" | "TEST" | "PROD", or whatever
   * the landscape calls it. NULL means unknown, and unknown must render as no
   * chip rather than a guess: this is the control that stops someone writing to
   * production by mistake, so a fabricated label here is worse than silence.
   */
  environment: string | null;
}

/**
 * Tenants this caller may use, preferring their organization's own connections.
 *
 * Returns `[]` only when there is genuinely nothing configured anywhere — which
 * is then an honest "no SAP tenant connected", not an artefact of looking in one
 * place.
 */
export async function resolveStudioTenants(
  organizationId: string | null,
  product?: string,
): Promise<StudioTenant[]> {
  if (organizationId) {
    const rows = await prisma.sapConnection.findMany({
      where: { organizationId, isActive: true, ...(product ? { product } : {}) },
      select: { key: true, label: true, product: true, environment: true },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        key: r.key,
        label: r.label,
        product: r.product,
        source: "connection" as const,
        environment: r.environment,
      }));
    }
  }

  // Nothing stored for this organization — fall back to the deployment's own
  // configured tenants, exactly as every existing SAP route already does.
  const products = product
    ? SAP_ODATA_PRODUCTS.filter((p) => p.key === product)
    : SAP_ODATA_PRODUCTS;

  return products.flatMap((p) => {
    // getConfiguredSapTenants THROWS on malformed *_TENANTS_JSON or a tenant with
    // no baseUrl. That is right for an API route answering about one product, but
    // this runs in the Studio layout — one bad env var must not take down every
    // page. A product we cannot read is a product with no tenants.
    let configured;
    try {
      configured = getConfiguredSapTenants(p.envPrefix);
    } catch {
      return [];
    }
    return configured.map((t) => ({
      key: t.key,
      label: t.label,
      product: p.key,
      source: "environment" as const,
      environment: t.environment ?? null,
    }));
  });
}

/**
 * Pick the active tenant from a remembered cookie value.
 *
 * The remembered key is honoured ONLY if it is one the caller can actually use,
 * so a tampered cookie cannot select someone else's tenant — it just falls back.
 */
export function pickActiveTenant(
  tenants: readonly StudioTenant[],
  remembered: string | null,
): string | null {
  if (remembered && tenants.some((t) => t.key === remembered)) return remembered;
  return tenants[0]?.key ?? null;
}

/** True when Studio is running on the shared deployment tenant, not a client's. */
export function isSharedEnvironmentTenant(
  tenants: readonly StudioTenant[],
  activeKey: string | null,
): boolean {
  if (!activeKey) return false;
  return tenants.find((t) => t.key === activeKey)?.source === "environment";
}

/**
 * The tenants this DEPLOYMENT falls back to when an organization has stored none.
 *
 * WHY THIS EXISTS SEPARATELY FROM `resolveStudioTenants`. That function answers
 * "what may this caller use", preferring stored connections and falling back
 * silently — which is right for a picker. The Operations Center and Control
 * Tower need the opposite: to distinguish the two sources and say which is
 * actually serving traffic, because "this organization has no connection" and
 * "nothing is reaching SAP" are different statements and only the first is true
 * on an env-only deployment.
 *
 * That distinction was lost once already. `tenants.ts` exists because Studio
 * reported "No SAP tenant connected" on a deployment with a perfectly good env
 * tenant and disabled its own Test Console. The Ops and Control Tower connection
 * views reintroduced exactly that: they counted `SapConnection` rows, found
 * none, and said "No active SAP connection" while SAP Explorer was reaching the
 * TDD tenant on the next screen.
 *
 * Returns `[]` when the deployment genuinely has no env tenant configured — at
 * which point "nothing is reaching SAP" is finally the honest sentence.
 */
export function deploymentFallbackTenants(product?: string): StudioTenant[] {
  const products = product
    ? SAP_ODATA_PRODUCTS.filter((p) => p.key === product)
    : SAP_ODATA_PRODUCTS;

  return products.flatMap((p) => {
    // Same defensive read as above: one malformed *_TENANTS_JSON must not take
    // down a whole console screen.
    let configured;
    try {
      configured = getConfiguredSapTenants(p.envPrefix);
    } catch {
      return [];
    }
    return configured.map((t) => ({
      key: t.key,
      label: t.label,
      product: p.key,
      source: "environment" as const,
      environment: t.environment ?? null,
    }));
  });
}
