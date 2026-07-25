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
import { canMutateStudio } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Interfaces" };

export default async function StudioInterfacesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;
  const rows = organizationId
    ? await prisma.interface.findMany({
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
    : [];

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
