import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { CompanyProfileForm } from "@/components/profile/CompanyProfileForm";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";

export default async function PersonalProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch the latest assessment for this user to provide context for the CompanyProfileForm
  const latestAssessment = await prisma.assessment.findFirst({
    where: {
      deletedAt: null,
      stakeholders: {
        some: { userId: user.id }
      }
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      companyName: true,
      industry: true,
      country: true,
      operatingCountries: true,
      companySize: true,
      revenueBand: true,
      employeeCount: true,
      annualRevenue: true,
      currencyCode: true,
      targetGoLiveDate: true,
      deploymentModel: true,
      sapModules: true,
      keyProcesses: true,
      languageRequirements: true,
      regulatoryFrameworks: true,
      itLandscapeSummary: true,
      currentErpVersion: true,
      migrationApproach: true,
      operationalSites: true,
    }
  });

  let profileData = null;
  if (latestAssessment) {
    const { score, breakdown } = calculateProfileCompleteness(latestAssessment);
    profileData = {
      ...latestAssessment,
      targetGoLiveDate: latestAssessment.targetGoLiveDate?.toISOString() ?? null,
      operationalSites: latestAssessment.operationalSites ?? null,
      completenessScore: score,
      completenessBreakdown: breakdown,
    };
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <PageHeader title="My Profile" />
      <div className="bg-card rounded-lg border p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Account Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Full Name</label>
            <p className="text-base font-medium">{user.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email Address</label>
            <p className="text-base font-medium">{user.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Platform Role</label>
            <p className="text-base font-medium uppercase text-primary">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        
        {profileData && (
          <div className="border-t pt-8">
            <h2 className="text-lg font-semibold mb-2">Primary Organization Profile</h2>
            <p className="text-sm text-muted-foreground mb-6">
              View and manage the company profile for your primary assessment: <strong>{profileData.companyName}</strong>
            </p>
            <CompanyProfileForm 
              assessmentId={profileData.id}
              initialProfile={profileData}
              userRole={user.role}
            />
          </div>
        )}

        {!profileData && (
          <div className="border-t pt-8 text-center py-12">
            <p className="text-muted-foreground">No active assessment profile found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
