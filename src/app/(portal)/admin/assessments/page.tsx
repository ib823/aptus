import { prisma } from "@/lib/db/prisma";
import { AdminAssessmentsClient } from "@/components/admin/AdminAssessmentsClient";

export default async function AdminAssessmentsPage() {
  const assessments = await prisma.assessment.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      companySize: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          scopeSelections: { where: { selected: true } },
          stepResponses: true,
          gapResolutions: true,
          stakeholders: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AdminAssessmentsClient
      assessments={assessments.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))}
    />
  );
}
