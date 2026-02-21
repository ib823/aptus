import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { FunctionalAreaOverviewMap } from "@/components/flows/FunctionalAreaOverviewMap";

interface FlowsOverviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function FlowsOverviewPage({ params }: FlowsOverviewPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true },
  });

  if (!assessment) notFound();

  return (
    <div className="max-w-7xl mx-auto">
      <FunctionalAreaOverviewMap assessmentId={assessment.id} />
    </div>
  );
}
