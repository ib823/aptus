/**
 * CoreEdge Console — Developer Studio route group.
 *
 * Own chrome (220px navy rail + 56px top bar), own RBAC gate. Studio is the
 * internal Developers workspace of the CoreEdge Console, so unauthenticated
 * callers are sent to the consultant-facing sign-in, not the Aptus portal login.
 *
 * TENANT RESOLUTION — the guardrail that matters: the tenant list is read from
 * the caller's OWN Organization (its active SapConnection rows) using the
 * organizationId on the session. It is never taken from the URL, a query string,
 * or a request body. The cookie below only remembers which of the caller's
 * already-authorized tenants they were last looking at; it grants nothing.
 *
 * AffirmLearnProvider is mounted here because the reused SAP catalogue components
 * (SapCapabilityCatalogue, ContentTypeTiles, CapabilityDetail, …) consume that
 * context and throw without it — the same reason /sap-explorer mounts it.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AffirmLearnProvider } from "@/components/affirm/learn/AffirmLearnProvider";
import { RoleGatedEmptyState } from "@/components/studio/RoleGatedEmptyState";
import { StudioShell } from "@/components/studio/StudioShell";
import { STUDIO_TENANT_COOKIE, type StudioTenantOption } from "@/components/studio/StudioTopBar";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { accessibleWorkspaces, canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { ROLE_LABELS } from "@/types/assessment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    default: "CoreEdge Console",
    template: "%s — CoreEdge Console",
  },
  description: "Configure, govern, test and scaffold SAP integrations",
};

/** The deployment environment badge — reported, never guessed. */
function resolveEnvironment(): string {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "PROD";
  if (vercelEnv === "preview") return "PREVIEW";
  if (vercelEnv === "development") return "DEV";
  return process.env.NODE_ENV === "production" ? "PROD" : "DEV";
}

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // Role gate, and the tenant-scope gate. A non-admin with no organization has no
  // tenant to scope Studio's organization-anchored tables to, so it is rejected
  // here — before any query can run unscoped.
  if (!canAccessStudio(user.role) || lacksStudioTenantScope(user)) {
    return <RoleGatedEmptyState roleLabel={roleLabel} />;
  }

  // Authorized tenants = this organization's active SAP connections. Metadata
  // only: `key`, `label` and `product` are non-secret columns. secretsCiphertext
  // is never selected here (or anywhere reachable from the client).
  const connections = user.organizationId
    ? await prisma.sapConnection.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { key: true, label: true, product: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const tenants: StudioTenantOption[] = connections.map((c) => ({
    key: c.key,
    label: c.label,
    product: c.product,
  }));

  // The remembered selection is honoured ONLY if it is one of the caller's own
  // authorized tenants; anything else falls back to the first. A tampered cookie
  // therefore cannot select another organization's tenant.
  const cookieStore = await cookies();
  const remembered = cookieStore.get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const activeTenantKey =
    remembered && tenants.some((t) => t.key === remembered)
      ? remembered
      : (tenants[0]?.key ?? null);

  return (
    <AffirmLearnProvider>
      <StudioShell
        accessibleWorkspaces={accessibleWorkspaces(user.role)}
        tenants={tenants}
        activeTenantKey={activeTenantKey}
        environment={resolveEnvironment()}
        roleLabel={roleLabel}
        userEmail={user.email}
      >
        {children}
      </StudioShell>
    </AffirmLearnProvider>
  );
}
