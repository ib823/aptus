/** DELETE: Delete a template */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";


export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to delete templates" } },
      { status: 403 },
    );
  }

  if (!user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "No organization associated" } },
      { status: 403 },
    );
  }

  const { templateId } = await params;

  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Template not found" } },
      { status: 404 },
    );
  }

  if (template.organizationId !== user.organizationId) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Template does not belong to your organization" } },
      { status: 403 },
    );
  }

  await prisma.assessmentTemplate.delete({
    where: { id: templateId },
  });

  return NextResponse.json({ data: { success: true } });
}
