import type { Metadata } from "next";

export const metadata: Metadata = { title: "Assessments" };
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AssessmentsPageClient } from "@/components/assessment/AssessmentsPageClient";
import { redirect } from "next/navigation";

export default async function AssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch assessments based on user role
  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : (["platform_admin", "admin", "consultant", "partner_lead"].includes(user.role))
      ? { deletedAt: null }
      : { deletedAt: null, stakeholders: { some: { userId: user.id } } };

  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
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

  const canCreate = ["consultant", "platform_admin", "admin", "partner_lead"].includes(user.role);

  return (
    <AssessmentsPageClient
      assessments={assessments.map((a) => ({
        ...a,
        updatedAt: a.updatedAt.toISOString(),
      }))}
      canCreate={canCreate}
    />
  );
}
