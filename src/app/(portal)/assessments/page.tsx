import type { Metadata } from "next";

export const metadata: Metadata = { title: "Assessments" };
import { getCurrentUser } from "@/lib/auth/session";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { getVisibleAssessmentWhere } from "@/lib/auth/assessment-visibility";
import { prisma } from "@/lib/db/prisma";
import { AptusAssessmentsList } from "@/components/aptus";
import { redirect } from "next/navigation";

interface AssessmentsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AssessmentsPage({ searchParams }: AssessmentsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 50;

  const role = mapLegacyRole(user.role);
  const whereClause = getVisibleAssessmentWhere(user);

  const totalCount = await prisma.assessment.count({ where: whereClause });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(page, totalPages);

  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      status: true,
      updatedAt: true,
      _count: {
        select: {
          scopeSelections: { where: { selected: true } },
          stepResponses: true,
          stakeholders: true,
        },
      },
    },
  });

  const canCreate = ["consultant", "platform_admin", "partner_lead"].includes(role);

  return (
    <AptusAssessmentsList
      assessments={assessments.map((a) => ({
        ...a,
        updatedAt: a.updatedAt.toISOString(),
      }))}
      canCreate={canCreate}
      pagination={{
        page: clampedPage,
        pageSize,
        totalCount,
      }}
    />
  );
}
