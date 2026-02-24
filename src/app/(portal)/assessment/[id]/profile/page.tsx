import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
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

  const canContinue = score >= PROFILE_COMPLETENESS_GATE;

  return (
    <div className="max-w-3xl mx-auto pb-24">
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

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <Link
            href="/assessments"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to Assessments
          </Link>

          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{score}% complete</p>
            <p className="text-xs text-muted-foreground">
              {canContinue ? "Ready for scope selection" : `${PROFILE_COMPLETENESS_GATE}% required to continue`}
            </p>
          </div>

          {canContinue ? (
            <Link
              href={`/assessment/${assessmentId}/scope`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
            >
              Continue to Scope Selection &rarr;
            </Link>
          ) : (
            <span
              role="link"
              aria-disabled="true"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md cursor-not-allowed"
              title={`${score}% complete — reach ${PROFILE_COMPLETENESS_GATE}% to continue`}
            >
              Continue to Scope Selection &rarr;
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
