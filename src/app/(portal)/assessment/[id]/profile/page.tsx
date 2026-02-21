import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { CompanyProfileForm } from "@/components/profile/CompanyProfileForm";

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
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
    },
  });

  if (!assessment) notFound();

  const { score, breakdown } = calculateProfileCompleteness(assessment);
  const isReadOnly = assessment.status === "signed_off" || assessment.status === "reviewed";

  const profileData = {
    companyName: assessment.companyName,
    industry: assessment.industry,
    country: assessment.country,
    operatingCountries: assessment.operatingCountries,
    companySize: assessment.companySize,
    revenueBand: assessment.revenueBand,
    employeeCount: assessment.employeeCount,
    annualRevenue: assessment.annualRevenue,
    currencyCode: assessment.currencyCode,
    targetGoLiveDate: assessment.targetGoLiveDate?.toISOString() ?? null,
    deploymentModel: assessment.deploymentModel,
    sapModules: assessment.sapModules,
    keyProcesses: assessment.keyProcesses,
    languageRequirements: assessment.languageRequirements,
    regulatoryFrameworks: assessment.regulatoryFrameworks,
    itLandscapeSummary: assessment.itLandscapeSummary,
    currentErpVersion: assessment.currentErpVersion,
    migrationApproach: assessment.migrationApproach,
    completenessScore: score,
    completenessBreakdown: breakdown,
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Company Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete your company profile to enable scope selection and assessment workflow.
        </p>
      </div>
      <CompanyProfileForm
        assessmentId={assessmentId}
        initialProfile={profileData}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
