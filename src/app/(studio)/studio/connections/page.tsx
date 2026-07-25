/**
 * Connections — /studio/connections
 *
 * Leads with the sealed-secrets statement because it is the thing a consultant
 * most needs to believe and most reasonably doubts: the console genuinely cannot
 * show them a client's SAP password, and that is a property of how the data is
 * read, not a promise about how it is displayed.
 */

import type { Metadata } from "next";

import { ConnectionsClient, type StudioConnection } from "@/components/studio/ConnectionsClient";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canMutateStudio } from "@/lib/studio/rbac";
import { resolveStudioTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

export default async function StudioConnectionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;

  // Same explicit allow-list as /api/studio/connections: `secretsCiphertext` is
  // never read, so it cannot be rendered, serialised into the RSC payload, or
  // logged. Redaction by absence, not by filtering.
  const rows = organizationId
    ? await prisma.sapConnection.findMany({
        where: { organizationId },
        select: {
          id: true,
          product: true,
          key: true,
          label: true,
          baseUrl: true,
          authType: true,
          writeEnabled: true,
          isActive: true,
          lastValidatedAt: true,
          lastValidationStatus: true,
        },
        orderBy: [{ product: "asc" }, { key: "asc" }],
      })
    : [];

  const connections: StudioConnection[] = rows.map((r) => ({
    ...r,
    lastValidatedAt: r.lastValidatedAt ? r.lastValidatedAt.toISOString() : null,
  }));

  // This organization has stored no connection of its own, yet the rest of Studio
  // is happily reading SAP — because the deployment has an env tenant configured.
  // Say so here rather than let an empty table imply nothing is wired up.
  const fallback =
    connections.length === 0
      ? (await resolveStudioTenants(organizationId)).filter((t) => t.source === "environment")
      : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Connections
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          The SAP tenants this organization is wired to. Health is only ever what a probe
          actually returned.
        </p>
      </div>

      <section
        style={{
          background: "var(--surface-banner-warn)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card-warm, 12px)",
          padding: 16,
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Secrets are sealed</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
          Passwords, bearer tokens and client secrets are encrypted at rest with AES-256-GCM
          and are <strong>never returned to this console</strong>. The redaction is
          structural: the queries behind this screen do not select the sealed column at all,
          so there is no value here to reveal — not to you, not to your browser, and not to
          an API response.
        </p>
      </section>

      {fallback.length > 0 ? (
        <section
          style={{
            background: "var(--surface-banner-info, var(--surface-subtle))",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card-warm, 12px)",
            padding: 16,
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>
            Running on the shared environment tenant
          </h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
            This organization has no stored connection, so Studio is using the tenant
            configured on the deployment itself
            {" ("}
            {fallback.map((t) => t.label).join(", ")}
            {") — the same one SAP Explorer reads. It is shared by everyone on this "}
            deployment and its credentials live in environment variables, not in the
            sealed store above. Add a connection here to give this organization its own.
          </p>
        </section>
      ) : null}

      <ConnectionsClient connections={connections} canTest={canMutateStudio(user.role)} />
    </div>
  );
}
