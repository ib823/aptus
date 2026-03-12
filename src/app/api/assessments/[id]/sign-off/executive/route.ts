/** POST: Executive sign-off */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { canTransitionSignOff } from "@/lib/signoff/state-machine";
import { computeCanonicalHash } from "@/lib/signoff/hash-engine";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import type { SignOffStatus } from "@/types/signoff";
import { z } from "zod";

const executiveSignSchema = z.object({
  authorityStatement: z.string().min(10, "Authority statement must be at least 10 characters"),
  signerTitle: z.string().optional(),
  signerOrganization: z.string().min(1),
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

  const role = mapLegacyRole(user.role);
  if (role !== "executive_sponsor" && role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only executive sponsors can perform executive sign-off" } },
      { status: 403 },
    );
  }

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = executiveSignSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const signOff = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
    include: { snapshot: true },
  });

  if (!signOff) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Sign-off process not found" } },
      { status: 404 },
    );
  }

  const currentStatus = signOff.status as SignOffStatus;
  if (currentStatus !== "EXECUTIVE_SIGN_OFF_PENDING" && currentStatus !== "CROSS_FUNCTIONAL_VALIDATION_COMPLETE") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Sign-off process is not ready for executive sign-off" } },
      { status: 400 },
    );
  }

  // If transitioning from CROSS_FUNCTIONAL_VALIDATION_COMPLETE
  if (currentStatus === "CROSS_FUNCTIONAL_VALIDATION_COMPLETE") {
    await prisma.signOffProcess.update({
      where: { id: signOff.id },
      data: { status: "EXECUTIVE_SIGN_OFF_PENDING" },
    });
  }

  const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const userAgentHeader = request.headers.get("user-agent") ?? "unknown";
  const documentHash = computeCanonicalHash(signOff.snapshot.snapshotData);

  // Verify snapshot integrity — the computed hash MUST match the stored hash
  if (documentHash !== signOff.snapshot.dataHash) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Snapshot integrity check failed. The assessment data may have been tampered with. Sign-off cannot proceed." } },
      { status: 409 },
    );
  }

  const signature = await prisma.signatureRecord.create({
    data: {
      signOffId: signOff.id,
      signatureType: "EXECUTIVE",
      signerId: user.id,
      signerName: user.name,
      signerEmail: user.email,
      signerRole: user.role,
      signerOrganization: parsed.data.signerOrganization,
      signerTitle: parsed.data.signerTitle ?? null,
      authorityStatement: parsed.data.authorityStatement,
      ipAddress,
      userAgent: userAgentHeader,
      authMethod: user.mfaEnabled ? "mfa" : "password",
      mfaVerified: user.mfaVerified,
      documentHash,
      signedAt: new Date(),
      status: "COMPLETED",
    },
  });

  if (canTransitionSignOff("EXECUTIVE_SIGN_OFF_PENDING", "EXECUTIVE_SIGNED")) {
    await prisma.signOffProcess.update({
      where: { id: signOff.id },
      data: { status: "EXECUTIVE_SIGNED" },
    });
  }

  await logDecision({
    assessmentId: id,
    entityType: "signature",
    entityId: signature.id,
    action: "EXECUTIVE_SIGNED",
    newValue: {
      signatureType: "EXECUTIVE",
      signer: user.email,
      documentHash,
    },
    actor: user.email,
    actorRole: user.role,
  });

  return NextResponse.json({ data: signature }, { status: 201 });
}
