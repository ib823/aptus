/** POST: Accept an organization invitation */

import { NextResponse, type NextRequest } from "next/server";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { logDecision } from "@/lib/audit/decision-logger";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Look up the invitation by token
  const invitation = await prisma.orgInvitation.findUnique({
    where: { token },
    include: {
      organization: {
        select: { id: true, name: true, isActive: true },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Invitation not found" } },
      { status: 404 },
    );
  }

  // Check if the invitation has already been accepted or revoked
  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: `Invitation has already been ${invitation.status}` } },
      { status: 400 },
    );
  }

  // Check if the invitation has expired
  if (invitation.expiresAt < new Date()) {
    // Mark as expired in the database
    await prisma.orgInvitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });

    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invitation has expired" } },
      { status: 400 },
    );
  }

  // Check if the organization is still active
  if (!invitation.organization.isActive) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Organization is no longer active" } },
      { status: 400 },
    );
  }

  // Check if a user with this email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });

  const now = new Date();
  let user: { id: string; email: string; name: string; role: string; organizationId: string | null };

  if (existingUser) {
    // Update existing user's role and organization
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: invitation.role,
        organizationId: invitation.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
      },
    });
  } else {
    // Create a new user with the invitation details
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        name: invitation.email.split("@")[0] ?? invitation.email,
        role: invitation.role,
        organizationId: invitation.organizationId,
        isActive: true,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
      },
    });
  }

  // Mark the invitation as accepted
  await prisma.orgInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "accepted",
      acceptedAt: now,
    },
  });

  await logDecision({
    assessmentId: "SYSTEM",
    entityType: "invitation",
    entityId: invitation.id,
    action: "USER_INVITED",
    oldValue: { status: "pending" },
    newValue: {
      status: "accepted",
      userId: user.id,
      email: user.email,
      role: invitation.role,
      organizationId: invitation.organizationId,
      isNewUser: !existingUser,
    } as Record<string, string | boolean>,
    actor: user.email,
    actorRole: mapLegacyRole(invitation.role),
  });

  return NextResponse.json({
    data: {
      user,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
      },
    },
  });
}
