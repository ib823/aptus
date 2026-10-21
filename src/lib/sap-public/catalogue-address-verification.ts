/**
 * P0.8 — "unverified" until a recorded live 200: the record behind a catalogue
 * OData V4 address.
 *
 * WHY. SAP does not publish OData V4 service bindings in the Hub catalogue, so
 * every non-curated V4 address CoreEdge shows is derived from the Hub id
 * (deriveV4Path). The one this repo checked against a real system,
 * CE_PURCHASEORDER_0001, was wrong. A derived address presented like a known
 * one tells a developer the service lives somewhere it may not. So a V4 address
 * reads "unverified" until a probe of EXACTLY that address answers 200 on the
 * system being viewed — and that answer is recorded here, per connection, with
 * when and by whom.
 *
 * PER CONNECTION, LIKE P1.1's SERVICE VERIFICATIONS. A 200 on one system says
 * nothing about another, so an entry names the tenant it was observed on and
 * the binding that answered (connection id and host). An entry stops counting
 * when the connection, its host or the derived path changes — an edited host
 * keeps its connection id, and a changed derivation rule must not inherit an
 * old proof.
 *
 * WHAT CLEARS IT. A later 404 for the same path on the same tenant removes the
 * entry: the service is gone from that address. Any other answer (401/403, 5xx,
 * a timeout) leaves it — those say nothing about whether the path exists.
 *
 * BEST-EFFORT WRITES. A verification that cannot be written leaves the address
 * "unverified", which is the safe direction; the probe that produced it must
 * not fail because of it.
 */

import { prisma } from "@/lib/db/prisma";
import { DEPLOYMENT_AUDIT_SCOPE } from "@/lib/sap-public/console-read-guard";
import { trimTrailingSlashes } from "@/lib/sap-public/service-verifications";
import type { SapServiceDefinition } from "@/lib/sap-public/tdd-connector";
import type { TenantSource } from "@/lib/sap-public/tenant-for-read";

export type AddressVerificationMethod = "probe-all" | "detail-probe" | "catalogue-overlay";

/** Which system an observation is about — the key a verification is filed under. */
export interface AddressVerificationScope {
  /** The tenant's owner, or DEPLOYMENT_AUDIT_SCOPE for a deployment tenant. */
  organizationId: string;
  product: string;
  tenantKey: string;
  /** The connection that answers for this tenant now; null for a deployment tenant. */
  connectionId: string | null;
  /** Normalized (no trailing slash). */
  baseUrl: string;
}

/**
 * The scope for a resolved read tenant, or null when it cannot be attributed
 * (a connection-backed tenant with no organization cannot exist; if one is
 * passed it is not filed anywhere rather than in the shared deployment slot).
 */
export function addressVerificationScope(input: {
  source: TenantSource;
  organizationId: string | null;
  product: string;
  tenantKey: string;
  connectionId: string | null;
  baseUrl: string;
}): AddressVerificationScope | null {
  const owner = input.source === "deployment" ? DEPLOYMENT_AUDIT_SCOPE : input.organizationId;
  if (!owner) return null;
  return {
    organizationId: owner,
    product: input.product,
    tenantKey: input.tenantKey,
    connectionId: input.source === "deployment" ? null : input.connectionId,
    baseUrl: trimTrailingSlashes(input.baseUrl),
  };
}

/** Only OData V4 catalogue addresses carry a verification (see the header). */
export function needsAddressVerification(service: Pick<SapServiceDefinition, "protocol">): boolean {
  return service.protocol === "ODATAV4";
}

export interface StoredAddressVerification {
  externalId: string;
  servicePath: string;
  verifiedAt: Date;
  connectionId: string | null;
  baseUrl: string;
}

/**
 * When the address was verified on this system, or null when it is unverified
 * here: no entry, or an entry about another path, connection or host. Pure.
 */
export function currentAddressVerification(
  entry: StoredAddressVerification | undefined,
  current: { path: string; scope: AddressVerificationScope },
): Date | null {
  if (!entry) return null;
  if (entry.servicePath !== current.path) return null;
  if ((entry.connectionId ?? null) !== (current.scope.connectionId ?? null)) return null;
  if (trimTrailingSlashes(entry.baseUrl) !== current.scope.baseUrl) return null;
  return entry.verifiedAt;
}

/** Every verification filed for one system, keyed by externalId. */
export async function readAddressVerifications(
  scope: AddressVerificationScope,
  externalIds?: readonly string[],
): Promise<Map<string, StoredAddressVerification>> {
  const rows = await prisma.catalogueAddressVerification.findMany({
    where: {
      organizationId: scope.organizationId,
      product: scope.product,
      tenantKey: scope.tenantKey,
      ...(externalIds ? { externalId: { in: [...externalIds] } } : {}),
    },
    select: { externalId: true, servicePath: true, verifiedAt: true, connectionId: true, baseUrl: true },
  });
  return new Map(rows.map((r) => [r.externalId, r]));
}

/**
 * Record what a live probe of a catalogue V4 address found. 200 files (or
 * renews) the verification; 404 for the same path removes it; anything else
 * changes nothing. Never throws.
 */
export async function recordAddressProbe(
  scope: AddressVerificationScope | null,
  probe: {
    service: Pick<SapServiceDefinition, "path" | "protocol" | "hubApiId" | "key">;
    status: number;
    actorUserId: string | null;
    method: AddressVerificationMethod;
    at?: Date;
  },
): Promise<void> {
  if (!scope || !needsAddressVerification(probe.service)) return;
  const externalId = probe.service.hubApiId ?? probe.service.key;
  const key = {
    organizationId: scope.organizationId,
    product: scope.product,
    tenantKey: scope.tenantKey,
    externalId,
  };
  try {
    if (probe.status === 200) {
      const data = {
        connectionId: scope.connectionId,
        baseUrl: scope.baseUrl,
        servicePath: probe.service.path,
        verifiedAt: probe.at ?? new Date(),
        verifiedByUserId: probe.actorUserId,
        method: probe.method,
      };
      // The organization is named in each where, not only through `key`, so
      // the write re-asserts the tenant (tenant-scope-coverage.test.ts).
      await prisma.catalogueAddressVerification.upsert({
        where: {
          organizationId_product_tenantKey_externalId: {
            organizationId: scope.organizationId,
            product: key.product,
            tenantKey: key.tenantKey,
            externalId,
          },
        },
        create: { ...key, ...data },
        update: data,
      });
    } else if (probe.status === 404) {
      await prisma.catalogueAddressVerification.deleteMany({
        where: {
          organizationId: scope.organizationId,
          product: key.product,
          tenantKey: key.tenantKey,
          externalId,
          servicePath: probe.service.path,
        },
      });
    }
  } catch (err) {
    console.warn("[catalogue-address-verification] could not record a probe outcome", {
      product: scope.product,
      externalId,
      status: probe.status,
      reason: err instanceof Error ? err.name : "unknown",
    });
  }
}
