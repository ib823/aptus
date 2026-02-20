import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getGapsForAssessment } from "@/lib/db/gap-resolutions";
import { prisma } from "@/lib/db/prisma";
import { GapResolutionClient } from "@/components/gaps/GapResolutionClient";

interface GapsPageProps {
  params: Promise<{ id: string }>;
}

export default async function GapsPage({ params }: GapsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const result = await getGapsForAssessment(assessmentId, { limit: 200 });

  return (
    <GapResolutionClient
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      initialGaps={result.gaps}
    />
  );
}
