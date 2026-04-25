import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { GranularityManagerClient } from "@/components/scope/GranularityManagerClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function GranularityPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      organizationId: true,
      granularityCoarse: true,
      granularityMedium: true,
      granularityFine: true,
    },
  });
  if (!assessment) notFound();
  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    notFound();
  }

  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: {
      id: true,
      scopeItemId: true,
      granularity: true,
      assessmentVerdict: true,
      notes: true,
      upgradedAt: true,
      scopeItem: {
        select: {
          name: true,
          functionalArea: true,
          totalSteps: true,
        },
      },
    },
    orderBy: [{ scopeItem: { functionalArea: "asc" } }, { scopeItemId: "asc" }],
  });

  const rows = selections.map((s) => ({
    id: s.id,
    scopeItemId: s.scopeItemId,
    name: s.scopeItem.name,
    functionalArea: s.scopeItem.functionalArea,
    totalSteps: s.scopeItem.totalSteps,
    granularity: s.granularity,
    assessmentVerdict: s.assessmentVerdict,
    notes: s.notes,
    upgradedAt: s.upgradedAt?.toISOString() ?? null,
  }));

  return (
    <GranularityManagerClient
      assessmentId={assessment.id}
      companyName={assessment.companyName}
      rollup={{
        coarse: assessment.granularityCoarse,
        medium: assessment.granularityMedium,
        fine: assessment.granularityFine,
      }}
      rows={rows}
    />
  );
}
