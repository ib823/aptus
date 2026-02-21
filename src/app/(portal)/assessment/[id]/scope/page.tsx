import { redirect, notFound } from "next/navigation";
import Link from "next/link";
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

  const [scopeItems, industryPreSelections] = await Promise.all([
    getScopeItemsWithSelections(assessmentId),
    getIndustryPreSelections(assessment.industry),
  ]);

  return (
    <>
      {score < PROFILE_COMPLETENESS_GATE && (
        <div className="max-w-5xl mx-auto mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          Profile completeness is {score}% — {PROFILE_COMPLETENESS_GATE}% required before starting the assessment.{" "}
          <Link href={`/assessment/${assessmentId}/profile`} className="underline font-medium">
            Complete your profile
          </Link>
        </div>
      )}
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
