/** GET: Attention items for the current user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeAttentionItems } from "@/lib/dashboard/attention-engine";
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const assessmentFilter = {
    deletedAt: null as null,
    ...(user.organizationId ? { organizationId: user.organizationId } : {}),
  };

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 14);

  // DashboardDeadline has no Prisma relation to Assessment; resolve IDs only for this query.
  const deadlineAssessmentIds = (
    await prisma.assessment.findMany({
      where: assessmentFilter,
      select: { id: true },
    })
  ).map((a) => a.id);

  // Fetch data in parallel for attention engine
  const [overdueDeadlines, conflicts, unresolvedGaps, staleAssessments] = await Promise.all([
    deadlineAssessmentIds.length > 0
      ? prisma.dashboardDeadline.findMany({
          where: {
            assessmentId: { in: deadlineAssessmentIds },
            dueDate: { lt: new Date() },
            status: { not: "completed" },
          },
          orderBy: { dueDate: "asc" },
          take: 200,
          select: { id: true, title: true, dueDate: true, assessmentId: true },
        })
      : Promise.resolve([]),
    prisma.conflict.findMany({
      where: {
        status: "OPEN",
        assessment: assessmentFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, entityType: true, entityId: true, assessmentId: true, createdAt: true },
    }),
    prisma.gapResolution.findMany({
      where: {
        resolutionType: "PENDING",
        assessment: assessmentFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, scopeItemId: true, gapDescription: true, createdAt: true },
    }),
    prisma.assessment.findMany({
      where: {
        ...assessmentFilter,
        updatedAt: { lt: staleThreshold },
        status: { notIn: ["archived", "handed_off", "signed_off"] },
      },
      orderBy: { updatedAt: "asc" },
      take: 300,
      select: { id: true, companyName: true, updatedAt: true },
    }),
  ]);

  const items = computeAttentionItems(
    [],
    unresolvedGaps.map((g) => ({
      id: g.id,
      scopeItemId: g.scopeItemId,
      gapDescription: g.gapDescription,
      createdAt: g.createdAt.toISOString(),
    })),
    overdueDeadlines.map((d) => ({
      id: d.id,
      title: d.title,
      dueDate: d.dueDate.toISOString(),
      assessmentId: d.assessmentId,
    })),
    conflicts.map((c) => ({
      id: c.id,
      entityType: c.entityType,
      entityId: c.entityId,
      assessmentId: c.assessmentId,
      createdAt: c.createdAt.toISOString(),
    })),
    staleAssessments.map((a) => ({
      id: a.id,
      companyName: a.companyName,
      lastActivityAt: a.updatedAt.toISOString(),
      staleDays: Math.floor((Date.now() - a.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
    })),
  );

  return NextResponse.json({ data: items });
}
