import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDataMigrationObjects, getDataMigrationSummary } from "@/lib/db/registers";
import { DataMigrationRegisterClient } from "@/components/registers/DataMigrationRegisterClient";

interface DataMigrationPageProps {
  params: Promise<{ id: string }>;
}

export default async function DataMigrationPage({ params }: DataMigrationPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!assessment) notFound();

  const [result, summary] = await Promise.all([
    getDataMigrationObjects(assessmentId, { limit: 200 }),
    getDataMigrationSummary(assessmentId),
  ]);

  const serialized = result.data.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <DataMigrationRegisterClient
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      initialData={serialized}
      initialSummary={summary}
    />
  );
}
