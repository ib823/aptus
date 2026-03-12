/** POST: Submit area validation */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { ERROR_CODES } from "@/types/api";
import { canTransitionSignOff } from "@/lib/signoff/state-machine";
import type { SignOffStatus } from "@/types/signoff";
import { z } from "zod";

const areaValidationSchema = z.object({
  functionalArea: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().optional(),
  rejectionReason: z.string().optional(),
});
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user } = access;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = areaValidationSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const signOff = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
    include: { areaValidations: true },
  });

  if (!signOff) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Sign-off process not found" } },
      { status: 404 },
    );
  }

  if (signOff.status !== "AREA_VALIDATION_IN_PROGRESS") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Sign-off process is not in area validation phase" } },
      { status: 400 },
    );
  }

  // Upsert area validation
  const validation = await prisma.areaValidation.upsert({
    where: {
      signOffId_functionalArea: {
        signOffId: signOff.id,
        functionalArea: parsed.data.functionalArea,
      },
    },
    create: {
      signOffId: signOff.id,
      functionalArea: parsed.data.functionalArea,
      validatedById: user.id,
      validatorName: user.name,
      validatorEmail: user.email,
      validatorRole: user.role,
      status: parsed.data.status,
      comments: parsed.data.comments ?? null,
      rejectionReason: parsed.data.rejectionReason ?? null,
      validatedAt: new Date(),
    },
    update: {
      validatedById: user.id,
      validatorName: user.name,
      validatorEmail: user.email,
      validatorRole: user.role,
      status: parsed.data.status,
      comments: parsed.data.comments ?? null,
      rejectionReason: parsed.data.rejectionReason ?? null,
      validatedAt: new Date(),
    },
  });

  // If any area is rejected, reject the whole sign-off
  if (parsed.data.status === "REJECTED") {
    if (canTransitionSignOff(signOff.status as SignOffStatus, "REJECTED")) {
      await prisma.signOffProcess.update({
        where: { id: signOff.id },
        data: {
          status: "REJECTED",
          rejectionReason: parsed.data.rejectionReason ?? "Area validation rejected",
        },
      });
    }
  } else {
    // Check if all areas are now validated
    const updatedValidations = await prisma.areaValidation.findMany({
      where: { signOffId: signOff.id },
    });
    const allApproved = updatedValidations.length > 0 &&
      updatedValidations.every(v => v.status === "APPROVED");

    if (allApproved && canTransitionSignOff(signOff.status as SignOffStatus, "AREA_VALIDATION_COMPLETE")) {
      await prisma.signOffProcess.update({
        where: { id: signOff.id },
        data: { status: "AREA_VALIDATION_COMPLETE" },
      });
    }
  }

  await logDecision({
    assessmentId: id,
    entityType: "area_validation",
    entityId: validation.id,
    action: "AREA_VALIDATED",
    newValue: {
      functionalArea: parsed.data.functionalArea,
      status: parsed.data.status,
      validator: user.email,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: validation });
}
