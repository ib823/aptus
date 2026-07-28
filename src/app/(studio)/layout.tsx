/**
 * CoreEdge Console — Developer Studio route group.
 *
 * Own chrome (220px navy rail + 56px top bar), own RBAC gate. Studio is the
 * internal Developers workspace of the CoreEdge Console, so unauthenticated
 * callers are sent to the consultant-facing sign-in, not the Aptus portal login.
 *
 * TENANT RESOLUTION — the guardrail that matters: the tenant list is read from
 * the caller's OWN Organization (its active SapConnection rows) using the
 * organizationId on the session, falling back to the deployment's configured env
 * tenant when the organization has no connections of its own. It is never taken
 * from the URL, a query string, or a request body. The cookie below only remembers
 * which of the caller's already-authorized tenants they were last looking at; it
 * grants nothing.
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
import { STUDIO_SECTIONS } from "@/lib/studio/sections";
import { STUDIO_TENANT_COOKIE, type StudioTenantOption } from "@/components/studio/StudioTopBar";
import { getCurrentUser } from "@/lib/auth/session";
import { accessibleWorkspaces, canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";
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

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // Role gate, and the tenant-scope gate. A non-admin with no organization has no
  // tenant to scope Studio's organization-anchored tables to, so it is rejected
  // here — before any query can run unscoped.
  if (!canAccessStudio(user.role) || lacksStudioTenantScope(user)) {
    return <RoleGatedEmptyState roleLabel={roleLabel} activeWorkspace="developer-studio" />;
  }

  // Authorized tenants: this organization's own connections when it has any,
  // otherwise the deployment's configured env tenant — the same one the existing
  // SAP Explorer runs on. Metadata only: `key`, `label` and `product` are
  // non-secret columns, and secretsCiphertext is never selected here (or anywhere
  // reachable from the client).
  //
  // An environment tenant is SHARED across the deployment, so it is labelled as
  // such rather than presented as this client's SAP.
  const resolved = await resolveStudioTenants(user.organizationId);

  // Passed through with `source` intact: the switcher shows "shared environment
  // tenant" on its own sub-line, which is where the design puts that detail —
  // rather than smuggling it into the label as a "(shared)" suffix.
  const tenants: StudioTenantOption[] = resolved.map((t) => ({
    key: t.key,
    label: t.label,
    product: t.product,
    source: t.source,
    environment: t.environment,
  }));

  // The remembered selection is honoured ONLY if it is one of the caller's own
  // authorized tenants; anything else falls back to the first. A tampered cookie
  // therefore cannot select another organization's tenant.
  const cookieStore = await cookies();
  const remembered = cookieStore.get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const activeTenantKey = pickActiveTenant(resolved, remembered);

  return (
    <AffirmLearnProvider>
      <StudioShell
        accessibleWorkspaces={accessibleWorkspaces(user.role)}
        sections={STUDIO_SECTIONS}
        activeWorkspace="developer-studio"
        tenants={tenants}
        activeTenantKey={activeTenantKey}
        roleLabel={roleLabel}
        userEmail={user.email}
      >
        {children}
      </StudioShell>
    </AffirmLearnProvider>
  );
}
