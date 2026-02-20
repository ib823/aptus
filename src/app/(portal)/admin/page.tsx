import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AdminOverviewClient } from "@/components/admin/AdminOverviewClient";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  // Assessment stats
  const assessments = await prisma.assessment.findMany({
    where: { deletedAt: null },
    select: { status: true },
  });
  const totalAssessments = assessments.length;
  const activeAssessments = assessments.filter((a) => a.status === "in_progress" || a.status === "completed").length;
  const signedOffAssessments = assessments.filter((a) => a.status === "signed_off").length;

  // Catalog stats
  const scopeItemCount = await prisma.scopeItem.count();
  const processStepCount = await prisma.processStep.count();
  const configActivityCount = await prisma.configActivity.count();

  // Intelligence stats
  const industryCount = await prisma.industryProfile.count();
  const baselineCount = await prisma.effortBaseline.count();
  const extPatternCount = await prisma.extensibilityPattern.count();
  const adaptPatternCount = await prisma.adaptationPattern.count();

  // Recent activity
  const recentActivity = await prisma.decisionLogEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: 20,
    select: {
      id: true,
      assessmentId: true,
      entityType: true,
      action: true,
      actor: true,
      actorRole: true,
      timestamp: true,
    },
  });

  return (
    <AdminOverviewClient
      stats={{
        assessments: { total: totalAssessments, active: activeAssessments, signedOff: signedOffAssessments },
        catalog: { scopeItems: scopeItemCount, processSteps: processStepCount, configActivities: configActivityCount },
        intelligence: { industries: industryCount, baselines: baselineCount, extensibilityPatterns: extPatternCount, adaptationPatterns: adaptPatternCount },
      }}
      recentActivity={recentActivity.map((a) => ({
        ...a,
        timestamp: a.timestamp.toISOString(),
      }))}
    />
  );
}
