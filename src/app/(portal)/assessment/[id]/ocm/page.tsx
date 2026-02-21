import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOcmImpacts, getOcmSummary, getOcmHeatmap } from "@/lib/db/registers";
import { OcmRegisterClient } from "@/components/registers/OcmRegisterClient";

interface OcmPageProps {
  params: Promise<{ id: string }>;
}

export default async function OcmPage({ params }: OcmPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const [result, summary, heatmap] = await Promise.all([
    getOcmImpacts(assessmentId, { limit: 200 }),
    getOcmSummary(assessmentId),
    getOcmHeatmap(assessmentId),
  ]);

  const serialized = result.data.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <OcmRegisterClient
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      initialData={serialized}
      initialSummary={summary}
      initialHeatmap={heatmap}
    />
  );
}
