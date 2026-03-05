/** GET: Open conflicts for the user's assessments */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const conflicts = await prisma.conflict.findMany({
    where: {
      status: "OPEN",
      assessment: {
        deletedAt: null,
        ...(user.organizationId ? { organizationId: user.organizationId } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      status: true,
      createdAt: true,
      assessmentId: true,
    },
  });

  return NextResponse.json({ data: conflicts });
}
