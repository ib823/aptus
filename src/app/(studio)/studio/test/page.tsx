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
import {
  TestConsoleClient,
  type CredentialOption,
  type TestableInterface,
} from "@/components/studio/TestConsoleClient";
import { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  connectionRefusalMessage,
  listBindableConnections,
  selectConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { canMutateStudio } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test Console" };

export default async function StudioTestPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;

  const [rows, tenants, clientRows] = await Promise.all([
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
            solutionId: true,
            solution: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    resolveStudioTenants(organizationId),
    /*
     * THE BINDING, BEFORE RUN. A run binds by the solution CREDENTIAL's
     * environment and SAP client — not by the tenant picker in the top bar,
     * which governs Discover. One session showed the picker on X5M/080 DEV
     * while the run reported "Bound to Customizing X5M/100 · TEST", and the
     * only way to learn which system a run would reach was to run it. These
     * reads are metadata only (no secret is selected, nothing is decrypted,
     * no SAP call is made) and feed the same selection function the broker
     * applies, so what the console says before Run is what the run does.
     */
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId, isActive: true, revokedAt: null },
          select: { id: true, solutionId: true, label: true, environment: true, sapClient: true, expiresAt: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Connections per product the interfaces name — through the resolver's own
  // metadata read (no secret is opened), one query per distinct product.
  const products = Array.from(new Set(rows.map((r) => r.sapProduct)));
  const connectionsByProduct = new Map(
    await Promise.all(
      products.map(
        async (p) => [p, organizationId ? await listBindableConnections(organizationId, p) : []] as const,
      ),
    ),
  );

  // Honour the remembered tenant only if it is one the caller may actually use —
  // the cookie is a view preference, never an authorization input.
  const remembered = (await cookies()).get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const tenantKey = pickActiveTenant(tenants, remembered);

  const now = Date.now();
  // One preview PER LIVE CREDENTIAL. A solution holds one runtime credential
  // per environment (AD-11), and each binds to a different system; the console
  // lets the developer pick which to run as, and says where each would go.
  const previewCredentials = (solutionId: string, sapProduct: string): CredentialOption[] =>
    clientRows
      .filter((c) => c.solutionId === solutionId && (c.expiresAt === null || c.expiresAt.getTime() > now))
      .map((client) => {
        const credential = { label: client.label, environment: client.environment, sapClient: client.sapClient };
        if (!getSapProduct(sapProduct)) {
          return {
            clientId: client.id,
            binding: {
              kind: "refused",
              credential,
              reason: "UNKNOWN_PRODUCT",
              message: connectionRefusalMessage("UNKNOWN_PRODUCT", client.environment),
            },
          };
        }
        const selection = selectConnectionForEnvironment(
          connectionsByProduct.get(sapProduct) ?? [],
          client.environment,
          "READ",
          client.sapClient,
        );
        if (!selection.ok) {
          return {
            clientId: client.id,
            binding: {
              kind: "refused",
              credential,
              reason: selection.reason,
              message: connectionRefusalMessage(selection.reason, client.environment),
            },
          };
        }
        return {
          clientId: client.id,
          binding: {
            kind: "bound",
            credential,
            connection: {
              label: selection.connection.label,
              environment: selection.connection.environment,
              sapClient: selection.connection.client,
            },
            bindingUnverified: selection.bindingUnverified,
          },
        };
      });

  const interfaces: TestableInterface[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    externalId: r.externalId,
    sapProduct: r.sapProduct,
    entitySet: r.entitySet,
    operation: r.operation,
    solutionName: r.solution.name,
    credentials: previewCredentials(r.solutionId, r.sapProduct),
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
