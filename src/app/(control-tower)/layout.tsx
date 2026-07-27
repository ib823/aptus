/**
 * CoreEdge Console — Control Tower route group.
 *
 * Mirrors `(studio)/layout.tsx` deliberately rather than sharing it: the two
 * differ only in their role gate and their section list, and a single layout
 * branching on the pathname would put the entitlement decision one indirection
 * away from the route it protects.
 *
 * NO AffirmLearnProvider HERE. Studio mounts it because the reused SAP catalogue
 * components consume that context and throw without it. Control Tower does
 * not render them, and mounting a provider "just in case" would make it unclear
 * which surfaces genuinely need it.
 *
 * TENANT RESOLUTION is identical to Studio's and identically constrained: the
 * list comes from the caller's OWN organization, never from the URL, and the
 * cookie only remembers which of their already-authorized tenants they were
 * last looking at.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { RoleGatedEmptyState } from "@/components/studio/RoleGatedEmptyState";
import { CONTROL_TOWER_SECTIONS } from "@/components/studio/StudioRail";
import { StudioShell } from "@/components/studio/StudioShell";
import { STUDIO_TENANT_COOKIE, type StudioTenantOption } from "@/components/studio/StudioTopBar";
import { getCurrentUser } from "@/lib/auth/session";
import { accessibleWorkspaces, canAccessControlTower, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";
import { ROLE_LABELS } from "@/types/assessment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "Control Tower", template: "%s — Control Tower" },
  description: "Is the portfolio governed, and is it worth it?",
};

export default async function ControlTowerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // Role gate AND tenant-scope gate, in that order and before any query — a
  // non-admin with no organization has nothing to scope the feeds to.
  if (!canAccessControlTower(user.role) || lacksStudioTenantScope(user)) {
    return <RoleGatedEmptyState roleLabel={roleLabel} />;
  }

  const resolved = await resolveStudioTenants(user.organizationId);
  const tenants: StudioTenantOption[] = resolved.map((t) => ({
    key: t.key,
    label: t.label,
    product: t.product,
    source: t.source,
    environment: t.environment,
  }));

  const cookieStore = await cookies();
  const remembered = cookieStore.get(STUDIO_TENANT_COOKIE)?.value ?? null;
  const activeTenantKey = pickActiveTenant(resolved, remembered);

  return (
    <StudioShell
      accessibleWorkspaces={accessibleWorkspaces(user.role)}
      sections={CONTROL_TOWER_SECTIONS}
      workspaceLabel="Control Tower"
      tenants={tenants}
      activeTenantKey={activeTenantKey}
      roleLabel={roleLabel}
      userEmail={user.email}
    >
      {children}
    </StudioShell>
  );
}
