/** POST: Submit cross-functional validation */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { canTransitionSignOff } from "@/lib/signoff/state-machine";
import type { SignOffStatus } from "@/types/signoff";
import { z } from "zod";

const crossFunctionalSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().optional(),
  conflictsReviewed: z.boolean().optional(),
  conflictCount: z.number().int().min(0).optional(),
  conflictsResolved: z.number().int().min(0).optional(),
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
  const parsed = crossFunctionalSchema.safeParse(body);
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

  const currentStatus = signOff.status as SignOffStatus;
  if (currentStatus !== "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS" && currentStatus !== "TECHNICAL_VALIDATION_COMPLETE") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Sign-off process is not in cross-functional validation phase" } },
      { status: 400 },
    );
  }

  // If transitioning from TECHNICAL_VALIDATION_COMPLETE
  if (currentStatus === "TECHNICAL_VALIDATION_COMPLETE") {
    await prisma.signOffProcess.update({
      where: { id: signOff.id },
      data: { status: "CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS" },
    });
  }

  const validation = await prisma.crossFunctionalValidation.upsert({
    where: { signOffId: signOff.id },
    create: {
      signOffId: signOff.id,
      validatedById: user.id,
      validatorName: user.name,
      validatorEmail: user.email,
      status: parsed.data.status,
      comments: parsed.data.comments ?? null,
      conflictsReviewed: parsed.data.conflictsReviewed ?? false,
      conflictCount: parsed.data.conflictCount ?? 0,
      conflictsResolved: parsed.data.conflictsResolved ?? 0,
      validatedAt: new Date(),
    },
    update: {
      validatedById: user.id,
      validatorName: user.name,
      validatorEmail: user.email,
      status: parsed.data.status,
      comments: parsed.data.comments ?? null,
      conflictsReviewed: parsed.data.conflictsReviewed ?? false,
      conflictCount: parsed.data.conflictCount ?? 0,
      conflictsResolved: parsed.data.conflictsResolved ?? 0,
      validatedAt: new Date(),
    },
  });

  if (parsed.data.status === "REJECTED") {
    if (canTransitionSignOff("CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS" as SignOffStatus, "REJECTED")) {
      await prisma.signOffProcess.update({
        where: { id: signOff.id },
        data: {
          status: "REJECTED",
          rejectionReason: parsed.data.comments ?? "Cross-functional validation rejected",
        },
      });
    }
  } else if (canTransitionSignOff("CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS" as SignOffStatus, "CROSS_FUNCTIONAL_VALIDATION_COMPLETE")) {
    await prisma.signOffProcess.update({
      where: { id: signOff.id },
      data: { status: "CROSS_FUNCTIONAL_VALIDATION_COMPLETE" },
    });
  }

  await logDecision({
    assessmentId: id,
    entityType: "cross_functional_validation",
    entityId: validation.id,
    action: "CROSS_FUNC_VALIDATED",
    newValue: {
      status: parsed.data.status,
      conflictsReviewed: parsed.data.conflictsReviewed ?? false,
      validator: user.email,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: validation });
}
