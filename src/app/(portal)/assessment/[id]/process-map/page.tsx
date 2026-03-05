import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { buildFunctionalAreaOverview } from "@/lib/assessment/functional-area-overview";
import { ProcessMapClient } from "./ProcessMapClient";

interface ProcessMapPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scopeItem?: string }>;
}

export default async function ProcessMapPage({ params, searchParams }: ProcessMapPageProps) {
  const { id: assessmentId } = await params;
  const { scopeItem: selectedScopeItemId } = await searchParams;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, companyName: true },
  });

  if (!assessment) notFound();

  // REM-24: Pre-fetch overview data server-side to avoid client-side auth issues
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });

  const selectedIds = scopeSelections.map((s) => s.scopeItemId);
  if (selectedIds.length === 0) {
    return (
      <div className="px-4">
        <ProcessMapClient
          assessmentId={assessment.id}
          initialScopeItemId={selectedScopeItemId ?? null}
          initialAreas={[]}
        />
      </div>
    );
  }

  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selectedIds } },
    select: { id: true, nameClean: true, functionalArea: true, totalSteps: true },
  });

  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: {
      fitStatus: true,
      processStep: { select: { scopeItemId: true } },
    },
  });

  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, resolutionType: true },
  });

  const initialAreas = buildFunctionalAreaOverview({
    scopeItems,
    stepResponses,
    gapResolutions,
  });

  return (
    <div className="px-4">
      <ProcessMapClient
        assessmentId={assessment.id}
        initialScopeItemId={selectedScopeItemId ?? null}
        initialAreas={initialAreas}
      />
    </div>
  );
}
