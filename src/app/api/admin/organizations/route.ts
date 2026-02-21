/** GET: List all organizations with plan/status (admin only) */

import { NextResponse } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      orgType: true,
      isActive: true,
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      maxActiveAssessments: true,
      maxPartnerUsers: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          assessments: true,
        },
      },
    },
  });

  return NextResponse.json({ data: organizations });
}
