/**
 * Test Console + Scaffold — /studio/test
 *
 * Resolves the caller's interfaces and their active tenant key on the server, so
 * the client has everything it needs to run a read WITHOUT this page having made
 * one. Rendering this page performs no live SAP call.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ScopeNote } from "@/components/studio/ScopeNote";
import { TestConsoleClient, type TestableInterface } from "@/components/studio/TestConsoleClient";
import { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test Console" };

export default async function StudioTestPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;

  const [rows, tenants] = await Promise.all([
    organizationId
      ? prisma.interface.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            externalId: true,
            sapProduct: true,
            entitySet: true,
            operation: true,
            solution: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    resolveStudioTenants(organizationId),
  ]);

  // Honour the remembered tenant only if it is one the caller may actually use —
  // the cookie is a view preference, never an authorization input.
  const remembered = (await cookies()).get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const tenantKey = pickActiveTenant(tenants, remembered);

  const interfaces: TestableInterface[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    externalId: r.externalId,
    sapProduct: r.sapProduct,
    entitySet: r.entitySet,
    operation: r.operation,
    solutionName: r.solution.name,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Test Console
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          Prove an interface against the real tenant before you write code against it, then
          take the contract to your own repository. An empty result is a result — it is not a
          failure, and this console keeps the difference visible.
        </p>
      </div>

      {/* Said next to Scaffold, where someone might expect an editor. */}
      <ScopeNote topic="no-editor" />
      <TestConsoleClient
        interfaces={interfaces}
        tenantKey={tenantKey}
        canSave={canMutateStudio(user.role)}
      />
    </div>
  );
}
