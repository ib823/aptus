/** GET: Get sign-off process status */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(
  _request: NextRequest,
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
  const signOff = await prisma.signOffProcess.findUnique({
    where: { assessmentId: id },
    include: {
      areaValidations: true,
      technicalValidation: true,
      crossFuncValidation: true,
      signatures: true,
      snapshot: {
        select: { id: true, version: true, label: true, dataHash: true, createdAt: true },
      },
    },
  });

  if (!signOff) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "No sign-off process found for this assessment" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: signOff });
}
