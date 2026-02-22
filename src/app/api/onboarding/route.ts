/** GET: Get onboarding state + flow for the current user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getOnboardingFlow } from "@/lib/onboarding/flow-engine";
import type { UserRole } from "@/types/assessment";
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  const flow = getOnboardingFlow(user.role as UserRole);

  return NextResponse.json({
    data: {
      progress,
      flow,
      isNew: !progress,
    },
  });
}
