/** GET: Single industry profile. PUT: Update. DELETE: Remove */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ industryId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { industryId } = await params;
  const profile = await prisma.industryProfile.findUnique({
    where: { id: industryId },
  });

  if (!profile) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Industry profile not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: profile });
}

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().min(10).max(5000).optional(),
  applicableScopeItems: z.array(z.string()).optional(),
  typicalScopeCount: z.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ industryId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { industryId } = await params;
  const existing = await prisma.industryProfile.findUnique({
    where: { id: industryId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Industry profile not found" } },
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
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.applicableScopeItems !== undefined) updateData.applicableScopeItems = parsed.data.applicableScopeItems;
  if (parsed.data.typicalScopeCount !== undefined) updateData.typicalScopeCount = parsed.data.typicalScopeCount;

  const profile = await prisma.industryProfile.update({
    where: { id: industryId },
    data: updateData,
  });

  return NextResponse.json({ data: profile });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ industryId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { industryId } = await params;
  const existing = await prisma.industryProfile.findUnique({
    where: { id: industryId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Industry profile not found" } },
      { status: 404 },
    );
  }

  await prisma.industryProfile.delete({ where: { id: industryId } });

  return NextResponse.json({ success: true });
}
