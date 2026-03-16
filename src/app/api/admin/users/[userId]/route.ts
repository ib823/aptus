/** Admin user management: update role/status/MFA, delete user */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { ROLE_LABELS } from "@/types/assessment";
import { z } from "zod";

const validRoles = Object.keys(ROLE_LABELS) as [string, ...string[]];

const patchSchema = z
  .object({
    role: z.enum(validRoles).optional(),
    isActive: z.boolean().optional(),
    resetMfa: z.literal(true).optional(),
  })
  .refine(
    (d) => [d.role, d.isActive, d.resetMfa].filter((v) => v !== undefined).length === 1,
    { message: "Provide exactly one of: role, isActive, resetMfa" },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { userId } = await params;

  // Cannot modify yourself
  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot modify your own account from admin panel" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid request" } },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found" } },
      { status: 404 },
    );
  }

  const { role, isActive, resetMfa } = parsed.data;

  // --- Role change ---
  if (role !== undefined) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, isActive: true, mfaEnabled: true, lastLoginAt: true, createdAt: true, totpVerified: true },
    });

    // Revoke sessions so new role takes effect
    await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date(), revokedReason: "role_changed" },
    });

    return NextResponse.json({ data: updated });
  }

  // --- Activate / Deactivate ---
  if (isActive !== undefined) {
    // Cannot deactivate the last platform_admin
    if (!isActive && target.role === "platform_admin") {
      const adminCount = await prisma.user.count({
        where: { role: "platform_admin", isActive: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot deactivate the last platform admin" } },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true, mfaEnabled: true, lastLoginAt: true, createdAt: true, totpVerified: true },
    });

    if (!isActive) {
      await prisma.session.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date(), revokedReason: "user_deactivated" },
      });
    }

    return NextResponse.json({ data: updated });
  }

  // --- MFA Reset ---
  if (resetMfa) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaMethod: "none",
        totpSecret: null,
        totpVerified: false,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, mfaEnabled: true, lastLoginAt: true, createdAt: true, totpVerified: true },
    });

    // Delete passkey credentials
    await prisma.webAuthnCredential.deleteMany({ where: { userId } });

    // Revoke sessions
    await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date(), revokedReason: "mfa_reset" },
    });

    return NextResponse.json({ data: updated });
  }

  return NextResponse.json(
    { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "No action specified" } },
    { status: 400 },
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { userId } = await params;

  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot delete your own account" } },
      { status: 403 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found" } },
      { status: 404 },
    );
  }

  // Cannot delete the last platform_admin
  if (target.role === "platform_admin") {
    const adminCount = await prisma.user.count({
      where: { role: "platform_admin", isActive: true },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot delete the last platform admin" } },
        { status: 403 },
      );
    }
  }

  // Delete user and all non-cascaded relations in a transaction
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.mfaChallenge.deleteMany({ where: { userId } }),
    prisma.webAuthnCredential.deleteMany({ where: { userId } }),
    prisma.assessmentStakeholder.deleteMany({ where: { userId } }),
    prisma.workshopAttendee.deleteMany({ where: { userId } }),
    prisma.dashboardWidget.deleteMany({ where: { userId } }),
    prisma.onboardingProgress.deleteMany({ where: { userId } }),
    prisma.onboardingTooltip.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return NextResponse.json({ data: { success: true } });
}
