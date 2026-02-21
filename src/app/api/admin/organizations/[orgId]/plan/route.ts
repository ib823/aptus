/** PUT: Override organization plan/limits (admin only) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/db/decision-log";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const planOverrideSchema = z.object({
  plan: z.enum(["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  subscriptionStatus: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "TRIAL_EXPIRED"]).optional(),
  maxActiveAssessments: z.number().int().min(1).optional(),
  maxPartnerUsers: z.number().int().min(1).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { orgId } = await params;

  const body: unknown = await request.json();
  const parsed = planOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string> } },
      { status: 400 },
    );
  }

  const existing = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, plan: true, subscriptionStatus: true, maxActiveAssessments: true, maxPartnerUsers: true, trialEndsAt: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" } },
      { status: 404 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.plan !== undefined) updateData.plan = parsed.data.plan;
  if (parsed.data.subscriptionStatus !== undefined) updateData.subscriptionStatus = parsed.data.subscriptionStatus;
  if (parsed.data.maxActiveAssessments !== undefined) updateData.maxActiveAssessments = parsed.data.maxActiveAssessments;
  if (parsed.data.maxPartnerUsers !== undefined) updateData.maxPartnerUsers = parsed.data.maxPartnerUsers;
  if (parsed.data.trialEndsAt !== undefined) {
    updateData.trialEndsAt = parsed.data.trialEndsAt ? new Date(parsed.data.trialEndsAt) : null;
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      maxActiveAssessments: true,
      maxPartnerUsers: true,
      trialEndsAt: true,
    },
  });

  await logDecision({
    assessmentId: orgId,
    entityType: "organization",
    entityId: orgId,
    action: "SUBSCRIPTION_UPGRADED",
    oldValue: existing,
    newValue: updated,
    actor: auth.user.id,
    actorRole: auth.user.role,
  });

  return NextResponse.json({ data: updated });
}
