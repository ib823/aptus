import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getScopeItemsWithSelections, getIndustryPreSelections } from "@/lib/db/scope-items";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { ScopeSelectionClient } from "@/components/scope/ScopeSelectionClient";

interface ScopePageProps {
  params: Promise<{ id: string }>;
}

export default async function ScopePage({ params }: ScopePageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      industry: true,
      status: true,
      companyName: true,
      country: true,
      companySize: true,
      employeeCount: true,
      annualRevenue: true,
      deploymentModel: true,
      sapModules: true,
      migrationApproach: true,
      targetGoLiveDate: true,
      keyProcesses: true,
      operatingCountries: true,
      currentErpVersion: true,
      itLandscapeSummary: true,
    },
  });

  if (!assessment) notFound();

  const { score } = calculateProfileCompleteness(assessment);

  // Block access if profile is incomplete
  if (score < PROFILE_COMPLETENESS_GATE) {
    redirect(`/assessment/${assessmentId}/profile?from=scope`);
  }

  const [scopeItems, industryPreSelections] = await Promise.all([
    getScopeItemsWithSelections(assessmentId),
    getIndustryPreSelections(assessment.industry),
  ]);

  return (
    <>
      <ScopeSelectionClient
        assessmentId={assessment.id}
        industry={assessment.industry}
        assessmentStatus={assessment.status}
        scopeItems={scopeItems}
        industryPreSelections={industryPreSelections}
      />
    </>
  );
}
