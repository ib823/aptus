/** POST: Apply industry-based pre-selections to scope items */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getIndustryPreSelections } from "@/lib/db/scope-items";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const preSelectSchema = z.object({
  industryCode: z.string().min(1),
  mode: z.enum(["replace", "merge"]),
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
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only consultants and admins can apply industry templates" } },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  const body: unknown = await request.json();
  const parsed = preSelectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const applicableIds = await getIndustryPreSelections(parsed.data.industryCode);
  if (applicableIds.length === 0) {
    return NextResponse.json({
      data: { applied: 0, skipped: 0, total: 0 },
    });
  }

  // In replace mode, deselect existing selections first
  if (parsed.data.mode === "replace") {
    await prisma.scopeSelection.updateMany({
      where: { assessmentId },
      data: { selected: false, relevance: "NO" },
    });
  }

  // Get existing selections to skip in merge mode
  const existing = parsed.data.mode === "merge"
    ? await prisma.scopeSelection.findMany({
        where: { assessmentId, selected: true },
        select: { scopeItemId: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.scopeItemId));

  let applied = 0;
  let skipped = 0;

  const upserts = applicableIds.map((scopeItemId) => {
    if (parsed.data.mode === "merge" && existingSet.has(scopeItemId)) {
      skipped++;
      return null;
    }
    applied++;
    return prisma.scopeSelection.upsert({
      where: {
        assessmentId_scopeItemId: { assessmentId, scopeItemId },
      },
      update: {
        selected: true,
        relevance: "YES",
        respondent: user.email,
        respondedAt: new Date(),
      },
      create: {
        assessmentId,
        scopeItemId,
        selected: true,
        relevance: "YES",
        respondent: user.email,
        respondedAt: new Date(),
      },
    });
  }).filter(Boolean);

  if (upserts.length > 0) {
    await prisma.$transaction(upserts as ReturnType<typeof prisma.scopeSelection.upsert>[]);
  }

  await logDecision({
    assessmentId,
    entityType: "scope_item",
    entityId: "pre-select",
    action: "SCOPE_INCLUDED",
    newValue: {
      industryCode: parsed.data.industryCode,
      mode: parsed.data.mode,
      applied,
      skipped,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({
    data: { applied, skipped, total: applicableIds.length },
  });
}
