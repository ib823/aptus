/** POST: Submit technical validation (IT Lead or DM Lead) */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { canTransitionSignOff } from "@/lib/signoff/state-machine";
import type { SignOffStatus } from "@/types/signoff";
import { z } from "zod";

export const preferredRegion = "sin1";

const technicalValidationSchema = z.object({
  validatorType: z.enum(["it_lead", "dm_lead"]),
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().optional(),
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

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = technicalValidationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const signOff = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
  });

  if (!signOff) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Sign-off process not found" } },
      { status: 404 },
    );
  }

  if (signOff.status !== "TECHNICAL_VALIDATION_IN_PROGRESS" && signOff.status !== "AREA_VALIDATION_COMPLETE") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Sign-off process is not in technical validation phase" } },
      { status: 400 },
    );
  }

  // If transitioning from AREA_VALIDATION_COMPLETE, move to TECHNICAL_VALIDATION_IN_PROGRESS
  if (signOff.status === "AREA_VALIDATION_COMPLETE") {
    await prisma.signOffProcess.update({
      where: { id: signOff.id },
      data: { status: "TECHNICAL_VALIDATION_IN_PROGRESS" },
    });
  }

  // Upsert technical validation
  const updateData = parsed.data.validatorType === "it_lead"
    ? {
        itLeadId: user.id,
        itLeadName: user.name,
        itLeadEmail: user.email,
        itLeadStatus: parsed.data.status,
        itLeadComments: parsed.data.comments ?? null,
        itLeadAt: new Date(),
      }
    : {
        dmLeadId: user.id,
        dmLeadName: user.name,
        dmLeadEmail: user.email,
        dmLeadStatus: parsed.data.status,
        dmLeadComments: parsed.data.comments ?? null,
        dmLeadAt: new Date(),
      };

  const validation = await prisma.technicalValidation.upsert({
    where: { signOffId: signOff.id },
    create: {
      signOffId: signOff.id,
      ...updateData,
    },
    update: updateData,
  });

  // Check if rejected
  if (parsed.data.status === "REJECTED") {
    if (canTransitionSignOff("TECHNICAL_VALIDATION_IN_PROGRESS" as SignOffStatus, "REJECTED")) {
      await prisma.signOffProcess.update({
        where: { id: signOff.id },
        data: {
          status: "REJECTED",
          rejectionReason: parsed.data.comments ?? "Technical validation rejected",
        },
      });
    }
  } else {
    // Check if both leads have approved
    const updated = await prisma.technicalValidation.findUnique({
      where: { signOffId: signOff.id },
    });
    if (
      updated?.itLeadStatus === "APPROVED" &&
      updated?.dmLeadStatus === "APPROVED" &&
      canTransitionSignOff("TECHNICAL_VALIDATION_IN_PROGRESS" as SignOffStatus, "TECHNICAL_VALIDATION_COMPLETE")
    ) {
      await prisma.signOffProcess.update({
        where: { id: signOff.id },
        data: { status: "TECHNICAL_VALIDATION_COMPLETE" },
      });
    }
  }

  await logDecision({
    assessmentId: id,
    entityType: "technical_validation",
    entityId: validation.id,
    action: "TECHNICAL_VALIDATED",
    newValue: {
      validatorType: parsed.data.validatorType,
      status: parsed.data.status,
      validator: user.email,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: validation });
}
