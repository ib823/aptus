/** GET: Single adaptation pattern. PUT: Update. DELETE: Remove */

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { patternId } = await params;
  const pattern = await prisma.adaptationPattern.findUnique({
    where: { id: patternId },
  });

  if (!pattern) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Pattern not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: pattern });
}

const updateSchema = z.object({
  commonGap: z.string().min(10).max(5000).optional(),
  sapApproach: z.string().min(10).max(5000).optional(),
  adaptEffort: z.string().min(1).max(5000).optional(),
  extendEffort: z.string().min(1).max(5000).optional(),
  recommendation: z.enum(["ADAPT", "EXTEND"]).optional(),
  rationale: z.string().min(10).max(5000).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { patternId } = await params;
  const existing = await prisma.adaptationPattern.findUnique({
    where: { id: patternId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Pattern not found" } },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.commonGap !== undefined) updateData.commonGap = parsed.data.commonGap;
  if (parsed.data.sapApproach !== undefined) updateData.sapApproach = parsed.data.sapApproach;
  if (parsed.data.adaptEffort !== undefined) updateData.adaptEffort = parsed.data.adaptEffort;
  if (parsed.data.extendEffort !== undefined) updateData.extendEffort = parsed.data.extendEffort;
  if (parsed.data.recommendation !== undefined) updateData.recommendation = parsed.data.recommendation;
  if (parsed.data.rationale !== undefined) updateData.rationale = parsed.data.rationale;

  const pattern = await prisma.adaptationPattern.update({
    where: { id: patternId },
    data: updateData,
  });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ data: pattern });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { patternId } = await params;
  const existing = await prisma.adaptationPattern.findUnique({
    where: { id: patternId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Pattern not found" } },
      { status: 404 },
    );
  }

  await prisma.adaptationPattern.delete({ where: { id: patternId } });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ success: true });
}
