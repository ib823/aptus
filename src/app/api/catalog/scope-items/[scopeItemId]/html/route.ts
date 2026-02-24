/** GET: HTML content for a single scope item (lazy-loaded on expand) */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scopeItemId: string }> },
): Promise<NextResponse> {
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
