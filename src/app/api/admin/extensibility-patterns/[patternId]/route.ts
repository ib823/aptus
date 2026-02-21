/** GET: Single pattern. PUT: Update. DELETE: Remove */

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
  const pattern = await prisma.extensibilityPattern.findUnique({
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
  gapPattern: z.string().min(10).max(5000).optional(),
  resolutionType: z.enum(["KEY_USER", "BTP", "ISV", "CUSTOM_ABAP", "NOT_POSSIBLE"]).optional(),
  resolutionDescription: z.string().min(10).max(5000).optional(),
  effortDays: z.number().min(0).optional(),
  recurringCostAnnual: z.number().min(0).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  sapSupported: z.boolean().optional(),
  upgradeSafe: z.boolean().optional(),
  examples: z.array(z.string()).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { patternId } = await params;
  const existing = await prisma.extensibilityPattern.findUnique({
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
  if (parsed.data.gapPattern !== undefined) updateData.gapPattern = parsed.data.gapPattern;
  if (parsed.data.resolutionType !== undefined) updateData.resolutionType = parsed.data.resolutionType;
  if (parsed.data.resolutionDescription !== undefined) updateData.resolutionDescription = parsed.data.resolutionDescription;
  if (parsed.data.effortDays !== undefined) updateData.effortDays = parsed.data.effortDays;
  if (parsed.data.recurringCostAnnual !== undefined) updateData.recurringCostAnnual = parsed.data.recurringCostAnnual;
  if (parsed.data.riskLevel !== undefined) updateData.riskLevel = parsed.data.riskLevel;
  if (parsed.data.sapSupported !== undefined) updateData.sapSupported = parsed.data.sapSupported;
  if (parsed.data.upgradeSafe !== undefined) updateData.upgradeSafe = parsed.data.upgradeSafe;
  if (parsed.data.examples !== undefined) updateData.examples = parsed.data.examples;

  const pattern = await prisma.extensibilityPattern.update({
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
  const existing = await prisma.extensibilityPattern.findUnique({
    where: { id: patternId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Pattern not found" } },
      { status: 404 },
    );
  }

  await prisma.extensibilityPattern.delete({ where: { id: patternId } });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ success: true });
}
