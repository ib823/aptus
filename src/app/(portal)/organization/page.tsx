import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrgSettingsForm } from "@/components/org/OrgSettingsForm";
import { mapLegacyRole } from "@/lib/auth/role-migration";

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
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Organization Settings</h1>
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
        <div className="space-y-2">
          <p><strong>Name:</strong> {org.name}</p>
          <p><strong>Type:</strong> {org.orgType}</p>
          <p><strong>MFA Policy:</strong> {org.mfaPolicy}</p>
        </div>
      )}
    </div>
  );
}
