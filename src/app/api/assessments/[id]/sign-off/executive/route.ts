/** POST: Executive sign-off */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { canTransitionSignOff } from "@/lib/signoff/state-machine";
import { computeCanonicalHash } from "@/lib/signoff/hash-engine";
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

  if (user.role !== "executive_sponsor" && user.role !== "platform_admin") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Only executive sponsors can perform executive sign-off" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = executiveSignSchema.safeParse(body);
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
