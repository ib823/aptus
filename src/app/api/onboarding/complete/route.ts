/** POST: Finalize onboarding */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { getOnboardingFlow, getPostOnboardingRedirect } from "@/lib/onboarding/flow-engine";
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

  const progress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  if (!progress) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Onboarding not started" } },
      { status: 404 },
    );
  }

  if (progress.isComplete) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Onboarding already completed" } },
      { status: 400 },
    );
  }

  // Verify all required steps are completed
  const flow = getOnboardingFlow(user.role as UserRole);
  const requiredSteps = flow.steps.filter((s) => s.isRequired).map((s) => s.index);
  const completedSet = new Set(progress.completedSteps);
  const missingRequired = requiredSteps.filter((i) => !completedSet.has(i));

  if (missingRequired.length > 0) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Required steps not completed: ${missingRequired.join(", ")}` } },
      { status: 400 },
    );
  }

  const updated = await prisma.onboardingProgress.update({
    where: { userId: user.id },
    data: {
      isComplete: true,
      completedAt: new Date(),
    },
  });

  await logDecision({
    assessmentId: "system",
    entityType: "onboarding",
    entityId: user.id,
    action: "ONBOARDING_COMPLETED",
    newValue: {
      role: user.role,
      completedSteps: progress.completedSteps.length,
      skippedSteps: progress.skippedSteps.length,
    },
    actor: user.email,
    actorRole: user.role,
  });

  const redirectUrl = getPostOnboardingRedirect(user.role as UserRole);

  return NextResponse.json({
    data: {
      progress: updated,
      redirectUrl,
    },
  });
}
