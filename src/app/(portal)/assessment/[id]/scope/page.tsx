import { redirect, notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getScopeItemsWithSelections, getIndustryPreSelections } from "@/lib/db/scope-items";
import { prisma } from "@/lib/db/prisma";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { ScopeSelectionClient } from "@/components/scope/ScopeSelectionClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  // Show prerequisite gate if profile is incomplete
  if (score < PROFILE_COMPLETENESS_GATE) {
    return (
      <div className="flex items-center justify-center py-24">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Profile incomplete
            </h2>
            <p className="text-sm text-muted-foreground mb-1">
              Your company profile is {score}% complete.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Reach {PROFILE_COMPLETENESS_GATE}% to unlock scope selection.
            </p>
            <a href={`/assessment/${assessmentId}/profile`}>
              <Button>Go to Profile</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
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
