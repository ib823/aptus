import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrgSettingsForm } from "@/components/org/OrgSettingsForm";
import { mapLegacyRole } from "@/lib/auth/role-migration";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = mapLegacyRole(user.role);
  const canManage = role === "platform_admin" || role === "partner_lead" || role === "client_admin";

  if (!user.organizationId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Organization</h1>
        <p className="text-muted-foreground">You are not currently assigned to an organization.</p>
      </div>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
  });

  if (!org) redirect("/dashboard");

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Organization</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Organization Settings */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-base font-semibold mb-4">Organization Settings</h3>
          {canManage ? (
            <OrgSettingsForm organization={{
              id: org.id,
              name: org.name,
              slug: org.slug,
              orgType: org.orgType,
              ssoEnabled: org.ssoEnabled,
              ssoProvider: org.ssoProvider,
              ssoDomain: org.ssoDomain,
              scimEnabled: org.scimEnabled,
              mfaPolicy: org.mfaPolicy,
              maxConcurrentSessions: org.maxConcurrentSessions,
              brandPrimaryColor: org.brandPrimaryColor,
              brandLogoUrl: org.brandLogoUrl,
            }} />
          ) : (
            <div className="space-y-2 text-sm">
              <p><strong>Name:</strong> {org.name}</p>
              <p><strong>Type:</strong> {org.orgType}</p>
              <p><strong>MFA Policy:</strong> {org.mfaPolicy}</p>
            </div>
          )}
        </div>

        {/* Right: User Management link card */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">User Management</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Manage team members, roles, and access for your organization.
          </p>
          <a
            href="/organization/users"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90"
          >
            Manage Users
          </a>
        </div>
      </div>
    </div>
  );
}
