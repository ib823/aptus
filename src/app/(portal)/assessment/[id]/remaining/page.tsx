import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { RemainingItemsClient } from "@/components/remaining/RemainingItemsClient";

interface RemainingPageProps {
  params: Promise<{ id: string }>;
}

export default async function RemainingPage({ params }: RemainingPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true, companyName: true },
  });

  if (!assessment) notFound();

  const items = await prisma.remainingItem.findMany({
    where: { assessmentId },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
  });

  // Compute summary
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let resolved = 0;
  for (const item of items) {
    bySeverity[item.severity] = (bySeverity[item.severity] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    if (item.resolvedAt) resolved++;
  }

  const serialized = items.map((item) => ({
    ...item,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <RemainingItemsClient
      assessmentId={assessment.id}
      companyName={assessment.companyName}
      initialItems={serialized}
      summary={{
        total: items.length,
        bySeverity,
        byCategory,
        resolved,
        unresolved: items.length - resolved,
      }}
    />
  );
}
