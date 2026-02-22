/** GET: Role-aware dashboard data */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getDefaultWidgets } from "@/lib/dashboard/widgets";
import type { UserRole } from "@/types/assessment";

export const preferredRegion = "sin1";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  // Get user's saved widget layout or defaults
  const savedWidgets = await prisma.dashboardWidget.findMany({
    where: { userId: user.id, isVisible: true },
    orderBy: { position: "asc" },
  });

  const widgets =
    savedWidgets.length > 0
      ? savedWidgets.map((w) => ({
          widgetType: w.widgetType,
          position: w.position,
          isVisible: w.isVisible,
          settings: w.settings,
        }))
      : getDefaultWidgets(user.role as UserRole);

  // Get assessments the user has access to
  const assessments = await prisma.assessment.findMany({
    where: {
      deletedAt: null,
      ...(user.organizationId ? { organizationId: user.organizationId } : {}),
    },
    select: {
      id: true,
      companyName: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    data: {
      role: user.role,
      widgets,
      assessments,
    },
  });
}
