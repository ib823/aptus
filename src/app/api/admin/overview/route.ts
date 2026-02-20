/** GET: Admin dashboard overview data */

import { NextResponse } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  // Assessment stats
  const assessments = await prisma.assessment.findMany({
    where: { deletedAt: null },
    select: { id: true, status: true },
  });
  const total = assessments.length;
  const active = assessments.filter((a) => a.status === "in_progress" || a.status === "completed").length;
  const signedOff = assessments.filter((a) => a.status === "signed_off").length;

  // Catalog stats
  const scopeItemCount = await prisma.scopeItem.count();
  const processStepCount = await prisma.processStep.count();
  const configActivityCount = await prisma.configActivity.count();

  // Intelligence layer stats
  const industryCount = await prisma.industryProfile.count();
  const baselineCount = await prisma.effortBaseline.count();
  const extPatternCount = await prisma.extensibilityPattern.count();
  const adaptPatternCount = await prisma.adaptationPattern.count();

  // Recent activity (last 20)
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
