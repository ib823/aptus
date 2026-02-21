/** POST: Initialize onboarding progress for the current user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { getOnboardingFlow } from "@/lib/onboarding/flow-engine";
import type { UserRole } from "@/types/assessment";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  // Check if already started
  const existing = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: "Onboarding already started" } },
      { status: 409 },
    );
  }

  const flow = getOnboardingFlow(user.role as UserRole);

  const progress = await prisma.onboardingProgress.create({
    data: {
      userId: user.id,
      role: user.role,
      currentStep: 0,
      completedSteps: [],
      skippedSteps: [],
      isComplete: false,
    },
  });

  await logDecision({
    assessmentId: "system",
    entityType: "onboarding",
    entityId: user.id,
    action: "ONBOARDING_STARTED",
    newValue: { role: user.role, totalSteps: flow.steps.length },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: progress }, { status: 201 });
}
