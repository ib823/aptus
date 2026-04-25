import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { RequirementsClient } from "./RequirementsClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RequirementsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      organizationId: true,
    },
  });
  if (!assessment) notFound();

  if (
    user.organizationId !== assessment.organizationId &&
    user.role !== "platform_admin"
  ) {
    notFound();
  }

  const requirements = await prisma.clientRequirement.findMany({
    where: { assessmentId },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      module: true,
      section: true,
      code: true,
      requirementText: true,
      requirementType: true,
      clientRemarks: true,
      solutionProviderResponse: true,
      solutionProviderRemarks: true,
      erpModuleSupporting: true,
    },
  });

  // Per-module counts for the summary header
  const byModule: Record<string, { total: number; mandatory: number }> = {};
  for (const r of requirements) {
    if (!byModule[r.module]) byModule[r.module] = { total: 0, mandatory: 0 };
    byModule[r.module]!.total++;
    if (r.requirementType?.toLowerCase().startsWith("mandatory")) {
      byModule[r.module]!.mandatory++;
    }
  }

  return (
    <RequirementsClient
      assessmentId={assessment.id}
      companyName={assessment.companyName}
      requirements={requirements}
      byModule={byModule}
    />
  );
}
