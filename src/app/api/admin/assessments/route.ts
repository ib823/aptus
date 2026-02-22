/** GET: List all assessments across all clients (admin view) */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where.status = status;

  const assessments = await prisma.assessment.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      companySize: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          scopeSelections: { where: { selected: true } },
          stepResponses: true,
          gapResolutions: true,
          stakeholders: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: assessments });
}
