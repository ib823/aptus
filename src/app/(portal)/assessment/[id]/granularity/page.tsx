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

  // ScopeSelection has no Prisma @relation back to ScopeItem (just the
  // scopeItemId FK), so we do two queries and join in memory.
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: {
      id: true,
      scopeItemId: true,
      granularity: true,
      assessmentVerdict: true,
      notes: true,
      upgradedAt: true,
    },
  });

  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selections.map((s) => s.scopeItemId) } },
    select: { id: true, name: true, functionalArea: true, totalSteps: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s]));

  const rows = selections
    .map((s) => {
      const item = scopeMap.get(s.scopeItemId);
      return {
        id: s.id,
        scopeItemId: s.scopeItemId,
        name: item?.name ?? s.scopeItemId,
        functionalArea: item?.functionalArea ?? "(Uncategorized)",
        totalSteps: item?.totalSteps ?? 0,
        granularity: s.granularity,
        assessmentVerdict: s.assessmentVerdict,
        notes: s.notes,
        upgradedAt: s.upgradedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => {
      const fa = (a.functionalArea ?? "").localeCompare(b.functionalArea ?? "");
      return fa !== 0 ? fa : a.scopeItemId.localeCompare(b.scopeItemId);
    });

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
