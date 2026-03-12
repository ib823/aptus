/** GET: HTML content for a single scope item (lazy-loaded on expand) */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scopeItemId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { scopeItemId } = await params;

  const item = await prisma.scopeItem.findUnique({
    where: { id: scopeItemId },
    select: {
      purposeHtml: true,
      overviewHtml: true,
      prerequisitesHtml: true,
    },
  });

  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Scope item not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: item });
}
