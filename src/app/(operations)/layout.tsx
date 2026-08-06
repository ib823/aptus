/**
 * CoreEdge Console — Operations Center route group.
 *
 * Mirrors `(studio)/layout.tsx` deliberately rather than sharing it: the two
 * differ only in their role gate and their section list, and a single layout
 * branching on the pathname would put the entitlement decision one indirection
 * away from the route it protects.
 *
 * NO AffirmLearnProvider HERE. Studio mounts it because the reused SAP catalogue
 * components consume that context and throw without it. Operations Center does
 * not render them, and mounting a provider "just in case" would make it unclear
 * which surfaces genuinely need it.
 *
 * TENANT RESOLUTION is identical to Studio's and identically constrained: the
 * list comes from the caller's OWN organization, never from the URL, and the
 * cookie only remembers which of their already-authorized tenants they were
 * last looking at.
 */

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { RoleGatedEmptyState } from "@/components/studio/RoleGatedEmptyState";
import { isMfaRequired, requiresMfaEnrollment } from "@/lib/auth/permissions";
import { OPERATIONS_SECTIONS } from "@/lib/studio/sections";
import { StudioShell } from "@/components/studio/StudioShell";
import { type StudioTenantOption } from "@/components/studio/StudioTopBar";
import { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/permissions";
import { accessibleWorkspaces, canAccessOperations, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { pickActiveTenant, resolveStudioTenants } from "@/lib/studio/tenants";
import { ROLE_LABELS } from "@/types/assessment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "Operations Center", template: "%s — Operations Center" },
  description: "Is the live integration healthy right now?",
};

export default async function OperationsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // Role gate AND tenant-scope gate, in that order and before any query — a
  // non-admin with no organization has nothing to scope the feeds to.
  if (!canAccessOperations(user.role) || lacksStudioTenantScope(user)) {
    return <RoleGatedEmptyState roleLabel={roleLabel} activeWorkspace="operations-center" />;
  }

  // MFA step-up, same gate as the portal layout. These screens read live
  // customer SAP activity; an org that requires MFA must get it HERE, not only
  // on the portal — a policy enforced on one door and not the other is not a
  // policy. Enrollment-needed users go to enrollment instead of a verify loop.
  if (isMfaRequired(user)) {
    const next = encodeURIComponent((await headers()).get("x-pathname") ?? "/operations");
    redirect(
      requiresMfaEnrollment(user)
        ? `/settings/security?mfa=required&next=${next}`
        : `/verify-mfa?next=${next}`,
    );
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

  // Admin-only sections (Catalogue health, deployment-scoped) are removed from
  // the rail rather than rendered-and-refused: an org-scoped operator must not
  // be shown an entry the screen will always turn away.
  const sections = isAdminRole(user.role)
    ? OPERATIONS_SECTIONS
    : OPERATIONS_SECTIONS.filter((s) => !s.adminOnly);

  return (
    <StudioShell
      accessibleWorkspaces={accessibleWorkspaces(user.role)}
      sections={sections}
      activeWorkspace="operations-center"
      tenants={tenants}
      activeTenantKey={activeTenantKey}
      roleLabel={roleLabel}
      userEmail={user.email}
    >
      {children}
    </StudioShell>
  );
}
