import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getIntegrationPoints, getIntegrationSummary } from "@/lib/db/registers";
import { IntegrationRegisterClient } from "@/components/registers/IntegrationRegisterClient";

interface IntegrationsPageProps {
  params: Promise<{ id: string }>;
}

export default async function IntegrationsPage({ params }: IntegrationsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const [result, summary] = await Promise.all([
    getIntegrationPoints(assessmentId, { limit: 200 }),
    getIntegrationSummary(assessmentId),
  ]);

  const serialized = result.data.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <IntegrationRegisterClient
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      initialData={serialized}
      initialSummary={summary}
    />
  );
}
