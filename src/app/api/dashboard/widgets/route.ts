/** PUT: Save widget layout for the current user */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import type { InputJsonValue } from "@prisma/client/runtime/library";
import { z } from "zod";

const widgetSchema = z.object({
  widgets: z.array(
    z.object({
      widgetType: z.string().min(1),
      position: z.number().int().min(0),
      isVisible: z.boolean(),
      settings: z.object({}).passthrough().nullable().optional(),
    }),
  ),
});
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body: unknown = await request.json();
  const parsed = widgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Delete existing widgets and recreate
  await prisma.dashboardWidget.deleteMany({
    where: { userId: user.id },
  });

  const widgets = await Promise.all(
    parsed.data.widgets.map((w) =>
      prisma.dashboardWidget.create({
        data: {
          userId: user.id,
          widgetType: w.widgetType,
          position: w.position,
          isVisible: w.isVisible,
          settings: w.settings ? (w.settings as unknown as InputJsonValue) : Prisma.JsonNull,
        },
      }),
    ),
  );

  await logDecision({
    assessmentId: "system",
    entityType: "dashboard_widget",
    entityId: user.id,
    action: "DASHBOARD_WIDGET_UPDATED",
    newValue: { widgetCount: widgets.length },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: widgets });
}
