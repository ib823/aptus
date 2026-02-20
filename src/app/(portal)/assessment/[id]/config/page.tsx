import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getConfigsForSelectedScope, getConfigSummary } from "@/lib/db/config-matrix";
import { prisma } from "@/lib/db/prisma";
import { ConfigMatrixClient } from "@/components/config/ConfigMatrixClient";

interface ConfigPageProps {
  params: Promise<{ id: string }>;
}

export default async function ConfigPage({ params }: ConfigPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const readOnly = assessment.status === "signed_off" || assessment.status === "reviewed";

  const [result, summary] = await Promise.all([
    getConfigsForSelectedScope(assessmentId, { limit: 500 }),
    getConfigSummary(assessmentId),
  ]);

  return (
    <ConfigMatrixClient
      assessmentId={assessment.id}
      configs={result.configs}
      summary={summary}
      readOnly={readOnly}
    />
  );
}
