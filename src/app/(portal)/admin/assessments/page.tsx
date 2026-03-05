import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { AdminAssessmentsClient } from "@/components/admin/AdminAssessmentsClient";

export const metadata: Metadata = { title: "All Assessments" };

interface AdminAssessmentsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminAssessmentsPage({ searchParams }: AdminAssessmentsPageProps) {
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 100;

  const totalCount = await prisma.assessment.count({
    where: { deletedAt: null },
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(page, totalPages);

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
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return (
    <AdminAssessmentsClient
      assessments={assessments.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))}
      pagination={{
        page: clampedPage,
        pageSize,
        totalCount,
      }}
    />
  );
}
