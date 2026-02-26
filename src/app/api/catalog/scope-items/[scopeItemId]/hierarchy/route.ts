/** GET: Hierarchy tree for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { HierarchyTree } from "@/types/hierarchy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scopeItemId: string }> },
): Promise<NextResponse> {
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

  const { scopeItemId } = await params;
  const assessmentId = request.nextUrl.searchParams.get("assessmentId") ?? undefined;

  const scopeItem = await prisma.scopeItem.findUnique({
    where: { id: scopeItemId },
    select: { id: true, nameClean: true },
  });

  if (!scopeItem) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Scope item not found" } },
      { status: 404 },
    );
  }

  const processes = await prisma.solutionProcess.findMany({
    where: { scopeItemId },
    orderBy: { sequence: "asc" },
    include: {
      processFlows: {
        orderBy: { sequence: "asc" },
        include: {
          activities: {
            orderBy: { sequence: "asc" },
            include: {
              _count: { select: { processSteps: true } },
            },
          },
        },
      },
    },
  });

  // If assessmentId provided, enrich with progress counts
  let progressMap: Map<string, { fit: number; configure: number; gap: number; na: number }> | null = null;

  if (assessmentId) {
    const activityIds = processes.flatMap((p) =>
      p.processFlows.flatMap((f) => f.activities.map((a) => a.id)),
    );

    if (activityIds.length > 0) {
      const progressRows = await prisma.$queryRaw<
        Array<{ activityId: string; fitStatus: string; count: number }>
      >`
        SELECT ps."activityId", sr."fitStatus", COUNT(*)::int AS count
        FROM "StepResponse" sr
        JOIN "ProcessStep" ps ON sr."processStepId" = ps.id
        WHERE sr."assessmentId" = ${assessmentId}
          AND ps."activityId" IS NOT NULL
        GROUP BY ps."activityId", sr."fitStatus"
      `;

      progressMap = new Map();
      for (const row of progressRows) {
        const existing = progressMap.get(row.activityId) ?? { fit: 0, configure: 0, gap: 0, na: 0 };
        switch (row.fitStatus) {
          case "FIT": existing.fit = row.count; break;
          case "CONFIGURE": existing.configure = row.count; break;
          case "GAP": existing.gap = row.count; break;
          case "NA": existing.na = row.count; break;
        }
        progressMap.set(row.activityId, existing);
      }
    }
  }

  const tree: HierarchyTree = {
    scopeItemId: scopeItem.id,
    scopeItemName: scopeItem.nameClean,
    processes: processes.map((p) => ({
      id: p.id,
      name: p.name,
      guid: p.guid,
      sequence: p.sequence,
      flows: p.processFlows.map((f) => ({
        id: f.id,
        name: f.name,
        guid: f.guid,
        flowDiagramGuid: f.flowDiagramGuid,
        flowDiagramName: f.flowDiagramName,
        sequence: f.sequence,
        activities: f.activities.map((a) => {
          const progress = progressMap?.get(a.id);
          const reviewed = (progress?.fit ?? 0) + (progress?.configure ?? 0) + (progress?.gap ?? 0) + (progress?.na ?? 0);
          return {
            id: a.id,
            title: a.title,
            guid: a.guid,
            targetUrl: a.targetUrl,
            sequence: a.sequence,
            stepCount: a._count.processSteps,
            reviewedCount: reviewed,
            fitCount: progress?.fit ?? 0,
            configureCount: progress?.configure ?? 0,
            gapCount: progress?.gap ?? 0,
            naCount: progress?.na ?? 0,
            pendingCount: a._count.processSteps - reviewed,
          };
        }),
      })),
    })),
  };

  return NextResponse.json(tree, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  });
}
