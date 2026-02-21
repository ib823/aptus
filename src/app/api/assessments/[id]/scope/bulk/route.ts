/** POST: Bulk scope operations (select/deselect by area) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const bulkSchema = z.object({
  action: z.enum(["select_all", "deselect_all"]),
  functionalArea: z.string().optional(),
  subArea: z.string().optional(),
  scopeItemIds: z.array(z.string()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  if (!["consultant", "admin", "platform_admin"].includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only consultants and admins can perform bulk operations" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  // Get target scope items
  const where: Record<string, unknown> = {};
  if (parsed.data.functionalArea) {
    where.functionalArea = parsed.data.functionalArea;
  }
  if (parsed.data.subArea) {
    where.subArea = parsed.data.subArea;
  }
  if (parsed.data.scopeItemIds) {
    where.id = { in: parsed.data.scopeItemIds };
  }

  const scopeItems = await prisma.scopeItem.findMany({
    where,
    select: { id: true },
  });

  const selected = parsed.data.action === "select_all";
  const relevance = selected ? "YES" : "NO";

  // Upsert all selections in a transaction
  await prisma.$transaction(
    scopeItems.map((item) =>
      prisma.scopeSelection.upsert({
        where: {
          assessmentId_scopeItemId: { assessmentId, scopeItemId: item.id },
        },
        update: {
          selected,
          relevance,
          respondent: user.email,
          respondedAt: new Date(),
        },
        create: {
          assessmentId,
          scopeItemId: item.id,
          selected,
          relevance,
          respondent: user.email,
          respondedAt: new Date(),
        },
      }),
    ),
  );

  // Log bulk decision
  await logDecision({
    assessmentId,
    entityType: "scope_item",
    entityId: "bulk",
    action: selected ? "SCOPE_INCLUDED" : "SCOPE_EXCLUDED",
    newValue: {
      action: parsed.data.action,
      functionalArea: parsed.data.functionalArea ?? null,
      count: scopeItems.length,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: { updated: scopeItems.length },
  });
}
