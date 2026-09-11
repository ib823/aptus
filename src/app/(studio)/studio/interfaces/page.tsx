/**
 * Interfaces — /studio/interfaces
 *
 * Schema presence is reported as a boolean rather than shipping the schemas
 * themselves to the browser: the list only needs to say whether a contract has
 * been captured, and an unread JSON blob per row is payload nobody asked for.
 */

import type { Metadata } from "next";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { serviceApiId } from "@/lib/sap-public/hub-content";
import { getSapProduct, getSapServices } from "@/lib/sap-public/tdd-connector";
import { canMutateStudio } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Interfaces" };

export default async function StudioInterfacesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;
  const [rows, writeHolders] = await Promise.all([
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
            requestSchema: true,
            responseSchema: true,
            solutionId: true,
            solution: { select: { name: true } },
          },
          orderBy: [{ updatedAt: "desc" }],
        })
      : Promise.resolve([]),
    // Which solutions hold a live write credential. A CREATE/UPDATE interface
    // cannot be activated without one (the route refuses), and the button
    // should say so before the click, not after. Metadata only — the sealed
    // secret is never selected.
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId, isActive: true, revokedAt: null, NOT: { secretsCiphertext: null } },
          select: { solutionId: true },
        })
      : Promise.resolve([]),
  ]);
  const writeCredentialSolutions = new Set(writeHolders.map((c) => c.solutionId));

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
    hasRequestSchema: r.requestSchema !== null,
    hasResponseSchema: r.responseSchema !== null,
    solutionId: r.solutionId,
    solutionName: r.solution.name,
    suggestedEntitySet: r.entitySet ? null : suggestEntitySet(r.sapProduct, r.externalId),
    writeCredentialIssued: writeCredentialSolutions.has(r.solutionId),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Interfaces
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          Governed configuration: which catalogue service each solution consumes, at which
          operation. This is config, never code — and defining one grants no access.
        </p>
      </div>

      <InterfacesClient interfaces={interfaces} canAuthor={canMutateStudio(user.role)} />
    </div>
  );
}
