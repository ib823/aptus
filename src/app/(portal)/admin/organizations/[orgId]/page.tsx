import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { OrgDetailClient } from "@/components/admin/OrgDetailClient";
import { getOrgTypeLabel, getOrgTypeColor } from "@/lib/utils/org-type";

interface OrgDetailPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function OrgDetailPage({ params }: OrgDetailPageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const currentUserRole = mapLegacyRole(currentUser.role);

  const { orgId } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      ssoEnabled: true,
      ssoProvider: true,
      ssoExclusive: true,
      mfaPolicy: true,
      dataRetentionDays: true,
      viewerCanExport: true,
      createdAt: true,
    },
  });

  if (!organization) notFound();

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      deactivatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingInvitations = await prisma.orgInvitation.count({
    where: { organizationId: orgId, status: "pending" },
  });

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link href="/admin/organizations" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          &larr; All Organizations
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">{organization.name}</h1>
        <Badge className={getOrgTypeColor(organization.type)}>
          {getOrgTypeLabel(organization.type)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        {organization.slug} &middot; {users.length} user{users.length !== 1 ? "s" : ""} &middot; {pendingInvitations} pending invitation{pendingInvitations !== 1 ? "s" : ""}
      </p>

      {/* Organization settings summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">SSO</p>
          <p className="text-sm font-medium">{organization.ssoEnabled ? `${organization.ssoProvider ?? "SAML"}${organization.ssoExclusive ? " (Exclusive)" : ""}` : "Disabled"}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">MFA Policy</p>
          <p className="text-sm font-medium capitalize">{organization.mfaPolicy ?? "optional"}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Viewer Export</p>
          <p className="text-sm font-medium">{organization.viewerCanExport ? "Allowed" : "Disabled"}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Data Retention</p>
          <p className="text-sm font-medium">{organization.dataRetentionDays ? `${organization.dataRetentionDays} days` : "Default"}</p>
        </div>
      </div>

      <OrgDetailClient
        organizationId={organization.id}
        orgType={organization.type}
        currentUserRole={currentUserRole}
        users={users.map((u) => ({
          id: u.id,
          name: u.name ?? "Unnamed",
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          mfaEnabled: u.mfaEnabled,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
