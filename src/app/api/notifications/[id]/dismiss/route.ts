/** PUT: Dismiss a notification */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function PUT(
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

  const { id } = await params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });

  if (!notification) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Notification not found" } },
      { status: 404 },
    );
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
    },
  });

  return NextResponse.json({ data: updated });
}
