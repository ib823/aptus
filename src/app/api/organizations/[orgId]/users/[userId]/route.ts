/** PUT: Update user role, deactivate/reactivate */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { canAssignRole } from "@/lib/auth/role-permissions";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  deactivationReason: z.string().max(500).optional(),
});
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
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

  const { orgId, userId } = await params;
  const currentRole = mapLegacyRole(user.role);

  // Only platform_admin, partner_lead (own org), client_admin (own org)
  const canManage =
    currentRole === "platform_admin" ||
    ((currentRole === "partner_lead" || currentRole === "client_admin") && user.organizationId === orgId);

  if (!canManage) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Validation failed" } },
      { status: 400 },
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, organizationId: true, isActive: true, email: true },
  });

  if (!targetUser || targetUser.organizationId !== orgId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "User not found in this organization" } },
      { status: 404 },
    );
  }

  // Cannot modify yourself
  if (userId === user.id) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Cannot modify your own role or status" } },
      { status: 400 },
    );
  }

  // Role change
  if (parsed.data.role) {
    const newRole = mapLegacyRole(parsed.data.role);
    if (!canAssignRole(currentRole, newRole)) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.FORBIDDEN, message: "Cannot assign a role above your own level" } },
        { status: 403 },
      );
    }

    const previousRole = targetUser.role;
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    // Update stakeholder records
    await prisma.assessmentStakeholder.updateMany({
      where: { userId },
      data: { role: newRole },
    });

    // Revoke sessions on role change
    await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date(), revokedReason: "role_changed" },
    });

    await logDecision({
      assessmentId: "SYSTEM",
      entityType: "user",
      entityId: userId,
      action: "ROLE_CHANGED",
      oldValue: { role: previousRole },
      newValue: { role: newRole },
      actor: user.email,
      actorRole: user.role,
    });

    return NextResponse.json({ data: { id: userId, role: newRole, previousRole } });
  }

  // Deactivation
  if (parsed.data.isActive === false) {
    // Check if deactivating last platform_admin
    if (mapLegacyRole(targetUser.role) === "platform_admin") {
      const adminCount = await prisma.user.count({
        where: { role: "platform_admin", isActive: true },
      });
      // Also count legacy "admin" role users
      const legacyAdminCount = await prisma.user.count({
        where: { role: "admin", isActive: true },
      });
      if (adminCount + legacyAdminCount <= 1) {
        return NextResponse.json(
          { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Cannot deactivate the last platform admin" } },
          { status: 400 },
        );
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: user.id,
        deactivationReason: parsed.data.deactivationReason ?? null,
      },
    });

    // Revoke sessions
    const revokedSessions = await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date(), revokedReason: "user_deactivated" },
    });

    await logDecision({
      assessmentId: "SYSTEM",
      entityType: "user",
      entityId: userId,
      action: "USER_DEACTIVATED",
      oldValue: { isActive: true },
      newValue: { isActive: false, reason: parsed.data.deactivationReason ?? null },
      actor: user.email,
      actorRole: user.role,
    });

    return NextResponse.json({
      data: { id: userId, deactivatedAt: new Date().toISOString(), sessionsRevoked: revokedSessions.count },
    });
  }

  // Reactivation
  if (parsed.data.isActive === true) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
    });

    return NextResponse.json({
      data: { id: userId, reactivatedAt: new Date().toISOString() },
    });
  }

  return NextResponse.json({ data: targetUser });
}
