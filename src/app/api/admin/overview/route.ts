/** GET: Admin dashboard overview data */

import { NextResponse } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const [
    assessments,
    scopeItemCount,
    processStepCount,
    configActivityCount,
    industryCount,
    baselineCount,
    extPatternCount,
    adaptPatternCount,
    recentActivity,
  ] = await Promise.all([
    prisma.assessment.findMany({ where: { deletedAt: null }, select: { id: true, status: true } }),
    prisma.scopeItem.count(),
    prisma.processStep.count(),
    prisma.configActivity.count(),
    prisma.industryProfile.count(),
    prisma.effortBaseline.count(),
    prisma.extensibilityPattern.count(),
    prisma.adaptationPattern.count(),
    prisma.decisionLogEntry.findMany({
      orderBy: { timestamp: "desc" },
      take: 20,
      select: { id: true, assessmentId: true, entityType: true, action: true, actor: true, actorRole: true, timestamp: true },
    }),
  ]);
  const total = assessments.length;
  const active = assessments.filter((a) => a.status === "in_progress" || a.status === "completed").length;
  const signedOff = assessments.filter((a) => a.status === "signed_off").length;

  return NextResponse.json({
    data: {
      assessments: { total, active, signedOff },
      catalog: {
        scopeItems: scopeItemCount,
        processSteps: processStepCount,
        configActivities: configActivityCount,
        sapVersion: "2508",
      },
      intelligence: {
        industries: industryCount,
        baselines: baselineCount,
        extensibilityPatterns: extPatternCount,
        adaptationPatterns: adaptPatternCount,
      },
      recentActivity,
    },
  });
}
