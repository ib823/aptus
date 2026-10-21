/**
 * Interfaces — /studio/interfaces
 *
 * Schema presence is reported as a boolean rather than shipping the schemas
 * themselves to the browser: the list only needs to say whether a contract has
 * been captured, and an unread JSON blob per row is payload nobody asked for.
 * The request schema's presence is asked of the database by id, so the column
 * is never read for a list (hostile-input review round 2).
 *
 * "Register your own API" needs the organization's solutions, the OData
 * products, and which declared connections Verify may ask — connection
 * METADATA only (product, label, environment, client), never a secret.
 * `?register=1` (the link on Discover) opens the dialog on arrival.
 */

import type { Metadata } from "next";

import {
  InterfacesClient,
  type StudioInterface,
  type VerifyTarget,
} from "@/components/studio/InterfacesClient";
import { getCurrentUser } from "@/lib/auth/session";
import { idsWithRequestSchema } from "@/lib/contracts/record";
import { prisma } from "@/lib/db/prisma";
import { normalizeEnvironment } from "@/lib/sap-public/connection-resolver";
import { serviceApiId } from "@/lib/sap-public/hub-content";
import {
  toCurrentConnection,
  verifiedEnvironmentsForCredentials,
  writesDisabledEnvironmentsForCredentials,
  type CurrentProductConnection,
} from "@/lib/sap-public/current-connections";
import { verifiedEnvironmentsForDisplay } from "@/lib/sap-public/service-verifications";
import { getSapProduct, getSapServices, SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";
import { responseSchemaState } from "@/lib/studio/contract-provenance";
import { canMutateStudio } from "@/lib/studio/rbac";
import { writeReadinessByEnvironment, type WriteReadinessRow } from "@/lib/studio/write-readiness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Interfaces" };

export default async function StudioInterfacesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = (await searchParams) ?? {};
  const openRegister = sp.register === "1";

  const organizationId = user.organizationId;
  const [rows, liveCredentials, writeKeyHolders, writeGrants, solutionRows, connectionRows, withRequestSchema] = await Promise.all([
    organizationId
      ? prisma.interface.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            version: true,
            sapProduct: true,
            externalId: true,
            operation: true,
            entitySet: true,
            mode: true,
            status: true,
            mappingVersion: true,
            // Not requestSchema: whether there is one is asked below, by id.
            responseSchema: true,
            solutionId: true,
            servicePath: true,
            odataVersion: true,
            serviceVerifiedAt: true,
            serviceVerifiedEnvironment: true,
            serviceVerifiedEntitySets: true,
            serviceVerifications: true,
            solution: { select: { name: true } },
          },
          orderBy: [{ updatedAt: "desc" }],
        })
      : Promise.resolve([]),
    // The write chain, per solution and environment. A CREATE/UPDATE interface
    // cannot be activated until some environment holds a live credential WITH
    // a write key AND a live approved write grant for it (the route refuses),
    // and the Contract card should show that table before the click, not
    // after. Metadata only — the sealed secret is filtered on, never selected.
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId, isActive: true, revokedAt: null },
          select: { id: true, solutionId: true, environment: true, expiresAt: true, sapClient: true },
        })
      : Promise.resolve([]),
    // By id: the credential holding the write key is the one whose binding
    // must be verified, the same join the activation gate makes (review round 4).
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId, isActive: true, revokedAt: null, NOT: { secretsCiphertext: null } },
          select: { id: true },
        })
      : Promise.resolve([]),
    organizationId
      ? prisma.apiAccessGrant.findMany({
          where: { organizationId, operation: { in: ["CREATE", "UPDATE"] } },
          select: { solutionId: true, externalId: true, operation: true, environment: true, decision: true, expiresAt: true, revokedAt: true },
        })
      : Promise.resolve([]),
    organizationId
      ? prisma.solution.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // What Verify may ask: each active connection's product, label, declared
    // environment and SAP client. Metadata only — no secret is selected. The
    // id and host stay on the server: they say whether a stored verification
    // still describes the connection (an edited host or client keeps the id).
    organizationId
      ? prisma.sapConnection.findMany({
          where: { organizationId, isActive: true },
          select: { id: true, product: true, label: true, environment: true, client: true, baseUrl: true, writeEnabled: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // Which interfaces have a request schema, without reading one (record.ts).
    organizationId ? idsWithRequestSchema({ organizationId }) : Promise.resolve(new Set<string>()),
  ]);

  // An undeclared connection cannot be chosen by environment, so it is not a
  // Verify target (the binding refuses it the same way). One entry per
  // product + environment + client: that triple is what the binding selects on.
  const verifyTargets: VerifyTarget[] = [];
  const seenTargets = new Set<string>();
  for (const c of connectionRows) {
    const environment = normalizeEnvironment(c.environment);
    if (environment === null) continue;
    const key = `${c.product}::${environment}::${c.client ?? ""}`;
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);
    verifyTargets.push({ product: c.product, environment, sapClient: c.client ?? null, label: c.label });
  }

  const currentConnections = connectionRows.map(toCurrentConnection);
  const connectionsFor = (product: string) => currentConnections.filter((c) => c.product === product);

  // `connected`: a declared connection exists for the product (a Verify
  // target), so an interface on it can bind. The product is fixed at
  // registration, so the dialog opens on a connected one (review round 4).
  const products = SAP_ODATA_PRODUCTS.map((p) => ({
    key: p.key,
    label: p.label,
    addressesClient: p.addressesClient,
    connected: verifyTargets.some((t) => t.product === p.key),
  }));

  const now = new Date();
  const withWriteKey = new Set(writeKeyHolders.map((c) => c.id));
  const writeReadinessFor = (
    solutionId: string,
    externalId: string,
    operation: string,
    /**
     * Your own API: its stored verifications and its product's current
     * connections, or null for a catalogue interface. Readiness asks the
     * write gate's question per credential — the connection that credential's
     * environment AND SAP client select — not "verified somewhere in this
     * environment" (review round 3), the same as the activation gate.
     */
    custom: { serviceVerifications: unknown; connections: readonly CurrentProductConnection[] } | null,
  ): WriteReadinessRow[] => {
    const credentials = liveCredentials.filter(
      (c) => c.solutionId === solutionId && (c.expiresAt === null || c.expiresAt.getTime() > now.getTime()),
    );
    // Every live credential, with its write key — the same rows the
    // activation gate passes: a read-only credential's binding is the one its
    // write key will be sealed onto (review round 5), and where a write-key
    // holder exists only its binding decides (review round 4).
    const readinessCredentials = credentials.map((c) => ({
      environment: c.environment,
      sapClient: c.sapClient ?? null,
      hasWriteKey: withWriteKey.has(c.id),
    }));
    return writeReadinessByEnvironment({
      credentials: readinessCredentials,
      grants: writeGrants.filter((g) => g.solutionId === solutionId && g.externalId === externalId && g.operation === operation),
      serviceVerifiedEnvironments: custom
        ? verifiedEnvironmentsForCredentials(custom.serviceVerifications, custom.connections, readinessCredentials)
        : null,
      writesDisabledEnvironments: custom
        ? writesDisabledEnvironmentsForCredentials(custom.connections, readinessCredentials)
        : null,
      now,
    });
  };

  /**
   * The entity set the curated registry names for a service, when it names
   * one. The interface's externalId is the Hub apiId; a curated service maps
   * to the same apiId (serviceApiId), and its dashboard operation carries the
   * entity set the connector already reads. Offered as a placeholder, never
   * written: the developer still confirms it, because a tenant can expose a
   * service whose $metadata differs from the registry's expectation.
   */
  const suggestEntitySet = (sapProduct: string, externalId: string): string | null => {
    const product = getSapProduct(sapProduct);
    if (!product) return null;
    const service = getSapServices(product).find((svc) => serviceApiId(svc) === externalId);
    if (!service) return null;
    const op = product.operations.find((o) => o.serviceKey === service.key);
    return op?.entitySet ?? null;
  };

  const interfaces: StudioInterface[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    version: r.version,
    sapProduct: r.sapProduct,
    externalId: r.externalId,
    operation: r.operation as StudioInterface["operation"],
    entitySet: r.entitySet,
    mode: r.mode,
    status: r.status as StudioInterface["status"],
    mappingVersion: r.mappingVersion,
    hasRequestSchema: withRequestSchema.has(r.id),
    responseSchemaState: responseSchemaState(r.responseSchema, r),
    solutionId: r.solutionId,
    solutionName: r.solution.name,
    // Your own API has no curated suggestion — Verify lists its real datasets.
    suggestedEntitySet: r.entitySet || r.servicePath ? null : suggestEntitySet(r.sapProduct, r.externalId),
    servicePath: r.servicePath,
    odataVersion: r.odataVersion,
    serviceVerifiedAt: r.serviceVerifiedAt ? r.serviceVerifiedAt.toISOString() : null,
    serviceVerifiedEnvironment: r.serviceVerifiedEnvironment,
    serviceVerifiedEnvironments: verifiedEnvironmentsForDisplay(r.serviceVerifications, connectionsFor(r.sapProduct)),
    serviceVerifiedEntitySets: Array.isArray(r.serviceVerifiedEntitySets)
      ? r.serviceVerifiedEntitySets.filter((n): n is string => typeof n === "string")
      : null,
    ...(r.operation === "READ"
      ? {}
      : {
          // The same three halves the activation gate and the broker check —
          // for your own API, verification in that environment too.
          writeReadiness: writeReadinessFor(
            r.solutionId,
            r.externalId,
            r.operation,
            r.servicePath
              ? { serviceVerifications: r.serviceVerifications, connections: connectionsFor(r.sapProduct) }
              : null,
          ),
        }),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Interfaces
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          Governed configuration: which SAP service each solution consumes (a catalogue service
          or your own API), at which operation. This is config, never code — and defining one
          grants no access.
        </p>
      </div>

      <InterfacesClient
        interfaces={interfaces}
        canAuthor={canMutateStudio(user.role)}
        solutions={solutionRows}
        products={products}
        verifyTargets={verifyTargets}
        openRegister={openRegister}
      />
    </div>
  );
}
