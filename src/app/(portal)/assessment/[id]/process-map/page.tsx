import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
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

  return (
    <div className="px-4">
      <ProcessMapClient
        assessmentId={assessment.id}
        initialScopeItemId={selectedScopeItemId ?? null}
      />
    </div>
  );
}
