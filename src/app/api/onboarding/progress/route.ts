/** PUT: Advance onboarding step */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { getOnboardingFlow, canSkipStep, getNextStep } from "@/lib/onboarding/flow-engine";
import type { UserRole } from "@/types/assessment";
import { z } from "zod";

export const preferredRegion = "sin1";

const progressSchema = z.object({
  stepIndex: z.number().int().min(0),
  action: z.enum(["complete", "skip"]),
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
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { stepIndex, action } = parsed.data;

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

  const flow = getOnboardingFlow(user.role as UserRole);
  const step = flow.steps[stepIndex];
  if (!step) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid step index" } },
      { status: 400 },
    );
  }

  if (action === "skip" && !canSkipStep(step)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "This step is required and cannot be skipped" } },
      { status: 400 },
    );
  }

  const completedSteps = [...progress.completedSteps];
  const skippedSteps = [...progress.skippedSteps];

  if (action === "complete") {
    if (!completedSteps.includes(stepIndex)) {
      completedSteps.push(stepIndex);
    }
  } else {
    if (!skippedSteps.includes(stepIndex)) {
      skippedSteps.push(stepIndex);
    }
  }

  const nextStep = getNextStep(flow, completedSteps, skippedSteps, stepIndex);

  const updated = await prisma.onboardingProgress.update({
    where: { userId: user.id },
    data: {
      completedSteps,
      skippedSteps,
      currentStep: nextStep ?? stepIndex,
    },
  });

  return NextResponse.json({
    data: {
      progress: updated,
      nextStep,
    },
  });
}
