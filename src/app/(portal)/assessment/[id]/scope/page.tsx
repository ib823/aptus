import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getScopeItemsWithSelections, getIndustryPreSelections } from "@/lib/db/scope-items";
import { prisma } from "@/lib/db/prisma";
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
    },
  });

  if (!assessment) notFound();

  const [scopeItems, industryPreSelections] = await Promise.all([
    getScopeItemsWithSelections(assessmentId),
    getIndustryPreSelections(assessment.industry),
  ]);

  return (
    <ScopeSelectionClient
      assessmentId={assessment.id}
      industry={assessment.industry}
      assessmentStatus={assessment.status}
      scopeItems={scopeItems}
      industryPreSelections={industryPreSelections}
    />
  );
}
