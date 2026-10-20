/**
 * POST: Admin creates a new user.
 *
 * AN ACCOUNT THAT CAN ACT ON GOVERNANCE NEEDS A FRESH PASSKEY to create
 * (lib/auth/step-up.ts, `user.create_privileged`). Otherwise the step-up on
 * every approval and key would not stop a stolen admin session: it would
 * create an approver at an address it reads, sign in by magic link, enrol that
 * account's first passkey by trust on first use and step up with it. Accounts
 * whose role cannot act are created as before.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { sendMagicLink } from "@/lib/auth/send-magic-link";
import {
  canPerformGovernanceActions,
  checkStepUp,
  recordStepUpMissing,
  STEP_UP_MAX_AGE_SECONDS,
  type StepUpMissing,
} from "@/lib/auth/step-up";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ROLE_LABELS } from "@/types/assessment";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const validRoles = Object.keys(ROLE_LABELS) as [string, ...string[]];

const createUserSchema = z.object({
  email: z.string().trim().min(1).max(320).email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(200),
  role: z.enum(validRoles),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = createUserSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const { email, name, role } = parsed.data;

  // Check if email already exists
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "A user with this email already exists" } },
      { status: 409 },
    );
  }

  // Checked here, recorded once the account exists, so the warn-mode row can
  // name it.
  let missing: StepUpMissing | null = null;
  if (canPerformGovernanceActions(role)) {
    const stepUp = checkStepUp(auth.user, STEP_UP_MAX_AGE_SECONDS, { action: "user.create_privileged" });
    if (!stepUp.ok) return stepUp.response;
    if (stepUp.outcome === "warned") missing = stepUp.missing;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      invitedBy: auth.user.id,
      invitedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (missing) await recordStepUpMissing({ ...missing, context: { ...missing.context, targetId: user.id } });

  // Email the new user a magic-link sign-in URL
  const { sent } = await sendMagicLink(email);

  return NextResponse.json({
    data: {
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      emailSent: sent,
    },
  }, { status: 201 });
}
