import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrgSettingsForm } from "@/components/org/OrgSettingsForm";
import { AISettingsForm } from "@/components/org/AISettingsForm";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { CreditCard } from "lucide-react";
import type { AIConfig } from "@/lib/intelligence/ai-orchestrator";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = mapLegacyRole(user.role);
  const canManage = role === "platform_admin" || role === "partner_lead" || role === "client_admin";

  if (!user.organizationId) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-semibold mb-4">Organization</h1>
        <div className="bg-card border rounded-lg p-6 space-y-3">
          <p className="text-foreground font-medium">No organization assigned</p>
          <p className="text-sm text-muted-foreground">
            Your account is not linked to an organization yet. An organization is created automatically
            when you set up your first assessment, or an admin can assign you to one.
          </p>
          <a
            href="/assessments"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Assessments
          </a>
        </div>
      </div>
    );
  }

  let org;
  try {
    org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
  } catch {
    // Prisma error — org doesn't exist or DB issue
  }

  if (!org) redirect("/dashboard");

  return (
    <div className="p-8 max-w-5xl pb-20">
      <h1 className="text-3xl font-semibold mb-8">Organization Settings</h1>
      
      <div className="grid grid-cols-1 gap-8">
        {/* Core Settings and AI Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: General Settings */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6" data-tour="org-info">
              <h3 className="text-lg font-semibold mb-4 border-b pb-2">Profile & Security</h3>
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
          </div>

          {/* Right: AI & User Management */}
          <div className="space-y-8">
            {canManage && (
              <AISettingsForm 
                organizationId={org.id} 
                initialConfig={org.aiConfig as unknown as AIConfig | null} 
              />
            )}

            <div className="bg-card border border-border rounded-lg p-6" data-tour="org-members">
              <h3 className="text-lg font-semibold mb-2">User Management</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Manage team members, roles, and access permissions for {org.name}.
              </p>
              <a
                href="/organization/users"
                className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                Manage Users
              </a>
            </div>

            <div className="bg-muted border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="size-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Billing & Subscription</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                View your current plan, usage metrics, and manage your billing details.
              </p>
              <a
                href="/settings/subscription"
                className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                Manage Subscription
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
