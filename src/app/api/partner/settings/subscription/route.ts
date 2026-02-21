/** GET: Partner subscription details with current usage */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getPlanLimits } from "@/lib/commercial/plan-engine";
import type { PlanTier } from "@/types/commercial";
import type { UserRole } from "@/types/assessment";


const ALLOWED_ROLES: UserRole[] = ["partner_lead", "client_admin"];

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

  if (!hasRole(user, ALLOWED_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No organization associated" } },
      { status: 404 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      billingEmail: true,
      maxActiveAssessments: true,
      maxPartnerUsers: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!org) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" } },
      { status: 404 },
    );
  }

  const [activeAssessments, userCount] = await Promise.all([
    prisma.assessment.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { not: "archived" },
      },
    }),
    prisma.user.count({
      where: { organizationId: user.organizationId, isActive: true },
    }),
  ]);

  const plan = org.plan as PlanTier;
  const limits = getPlanLimits(plan);

  return NextResponse.json({
    data: {
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      billingEmail: org.billingEmail,
      limits,
      usage: {
        activeAssessments,
        maxActiveAssessments: org.maxActiveAssessments,
        activeUsers: userCount,
        maxPartnerUsers: org.maxPartnerUsers,
      },
    },
  });
}
