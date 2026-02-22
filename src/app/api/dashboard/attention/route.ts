/** GET: Attention items for the current user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { computeAttentionItems } from "@/lib/dashboard/attention-engine";

export const preferredRegion = "sin1";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const assessmentFilter = user.organizationId
    ? { organizationId: user.organizationId }
    : {};

  const assessmentIds = (
    await prisma.assessment.findMany({
      where: { deletedAt: null, ...assessmentFilter },
      select: { id: true },
    })
  ).map((a) => a.id);

  if (assessmentIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Fetch data in parallel for attention engine
  const [overdueDeadlines, conflicts, unresolvedGaps] = await Promise.all([
    prisma.dashboardDeadline.findMany({
      where: {
        assessmentId: { in: assessmentIds },
        dueDate: { lt: new Date() },
        status: { not: "completed" },
      },
      select: { id: true, title: true, dueDate: true, assessmentId: true },
    }),
    prisma.conflict.findMany({
      where: {
        assessmentId: { in: assessmentIds },
        status: "OPEN",
      },
      select: { id: true, entityType: true, entityId: true, assessmentId: true, createdAt: true },
    }),
    prisma.gapResolution.findMany({
      where: {
        assessmentId: { in: assessmentIds },
        resolutionType: "PENDING",
      },
      select: { id: true, scopeItemId: true, gapDescription: true, createdAt: true },
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
    [],
  );

  return NextResponse.json({ data: items });
}
