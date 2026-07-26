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
