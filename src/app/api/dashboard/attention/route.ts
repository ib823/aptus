/** GET: Attention items for the current user */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { getVisibleAssessmentSql, getVisibleAssessmentWhere } from "@/lib/auth/assessment-visibility";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeAttentionItems } from "@/lib/dashboard/attention-engine";

interface OverdueDeadlineRow {
  id: string;
  title: string;
  dueDate: Date;
  assessmentId: string;
}
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const assessmentFilter = getVisibleAssessmentWhere(user);
  const assessmentSqlFilter = getVisibleAssessmentSql(user);

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 14);

  // Fetch data in parallel for attention engine
  const [overdueDeadlines, conflicts, unresolvedGaps, staleAssessments] = await Promise.all([
    prisma.$queryRaw<OverdueDeadlineRow[]>(Prisma.sql`
      SELECT d.id, d.title, d."dueDate", d."assessmentId"
      FROM "DashboardDeadline" d
      JOIN "Assessment" a ON a.id = d."assessmentId"
      WHERE a."deletedAt" IS NULL
        ${assessmentSqlFilter}
        AND d."dueDate" < NOW()
        AND d.status <> 'completed'
      ORDER BY d."dueDate" ASC
      LIMIT 200
    `),
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
