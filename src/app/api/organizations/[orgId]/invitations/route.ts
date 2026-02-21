/** GET: List pending invitations */
/** DELETE: Revoke invitation */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
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

  const { orgId } = await params;
  const role = mapLegacyRole(user.role);

  const canView =
    role === "platform_admin" ||
    ((role === "partner_lead" || role === "client_admin") && user.organizationId === orgId);

  if (!canView) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const invitations = await prisma.orgInvitation.findMany({
    where: { organizationId: orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      invitedBy: true,
      status: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: invitations });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
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

  const { orgId } = await params;
  const role = mapLegacyRole(user.role);

  const canRevoke =
    role === "platform_admin" ||
    ((role === "partner_lead" || role === "client_admin") && user.organizationId === orgId);

  if (!canRevoke) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const invitationId = request.nextUrl.searchParams.get("invitationId");
  if (!invitationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "invitationId is required" } },
      { status: 400 },
    );
  }

  const invitation = await prisma.orgInvitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || invitation.organizationId !== orgId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Invitation not found" } },
      { status: 404 },
    );
  }

  await prisma.orgInvitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });

  return NextResponse.json({ data: { revoked: true } });
}
