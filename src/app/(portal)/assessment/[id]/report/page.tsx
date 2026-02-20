import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getReportSummary } from "@/lib/report/report-data";
import { prisma } from "@/lib/db/prisma";
import { ReportClient } from "@/components/report/ReportClient";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: assessmentId } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, deletedAt: null },
    select: { id: true, status: true, companyName: true },
  });

  if (!assessment) notFound();

  const summary = await getReportSummary(assessmentId);

  const signOffs = await prisma.assessmentSignOff.findMany({
    where: { assessmentId },
    select: {
      signatoryName: true,
      signatoryEmail: true,
      signatoryRole: true,
      signedAt: true,
    },
    orderBy: { signedAt: "asc" },
  });

  return (
    <ReportClient
      assessmentId={assessment.id}
      companyName={assessment.companyName}
      status={assessment.status}
      summary={summary}
      signOffs={signOffs.map((s) => ({
        ...s,
        signedAt: s.signedAt.toISOString(),
      }))}
    />
  );
}
