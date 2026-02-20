import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { FlowViewerClient } from "@/components/flows/FlowViewerClient";

interface FlowsPageProps {
  params: Promise<{ id: string }>;
}

export default async function FlowsPage({ params }: FlowsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  // Get existing diagrams
  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { assessmentId },
    select: {
      id: true,
      scopeItemId: true,
      processFlowName: true,
      stepCount: true,
      fitCount: true,
      configureCount: true,
      gapCount: true,
      naCount: true,
      pendingCount: true,
      generatedAt: true,
    },
    orderBy: [{ scopeItemId: "asc" }, { processFlowName: "asc" }],
  });

  // Get scope item names
  const scopeItemIds = [...new Set(diagrams.map((d) => d.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: { id: true, nameClean: true },
  });
  const scopeMap = new Map(scopeItems.map((s) => [s.id, s.nameClean]));

  const enrichedDiagrams = diagrams.map((d) => ({
    ...d,
    scopeItemName: scopeMap.get(d.scopeItemId) ?? d.scopeItemId,
    generatedAt: d.generatedAt.toISOString(),
  }));

  return (
    <FlowViewerClient
      assessmentId={assessment.id}
      diagrams={enrichedDiagrams}
    />
  );
}
