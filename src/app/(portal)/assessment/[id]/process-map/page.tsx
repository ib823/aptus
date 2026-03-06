import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { buildFunctionalAreaOverviewFromCounts } from "@/lib/assessment/functional-area-overview";
import { ProcessMapClient } from "./ProcessMapClient";
import type { ResponseCountRow, GapResolutionCountRow } from "@/types/assessment";

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

  const [responseCounts, gapResolutionCounts] = await Promise.all([
    prisma.$queryRaw<ResponseCountRow[]>`
      SELECT ps."scopeItemId", sr."fitStatus", COUNT(*)::int AS count
      FROM "StepResponse" sr
      JOIN "ProcessStep" ps ON sr."processStepId" = ps.id
      WHERE sr."assessmentId" = ${assessmentId}
        AND ps."scopeItemId" = ANY(${selectedIds})
      GROUP BY ps."scopeItemId", sr."fitStatus"
    `,
    prisma.$queryRaw<GapResolutionCountRow[]>`
      SELECT "scopeItemId", "resolutionType", COUNT(*)::int AS count
      FROM "GapResolution"
      WHERE "assessmentId" = ${assessmentId}
        AND "scopeItemId" = ANY(${selectedIds})
      GROUP BY "scopeItemId", "resolutionType"
    `,
  ]);

  const initialAreas = buildFunctionalAreaOverviewFromCounts({
    scopeItems,
    responseCounts,
    gapResolutionCounts,
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
