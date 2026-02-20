/** GET: List extensibility patterns. POST: Create pattern */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const resolutionType = request.nextUrl.searchParams.get("resolutionType") ?? undefined;
  const where: Record<string, unknown> = {};
  if (resolutionType) where.resolutionType = resolutionType;

  const patterns = await prisma.extensibilityPattern.findMany({
    where,
    orderBy: [{ resolutionType: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ data: patterns });
}

const createSchema = z.object({
  gapPattern: z.string().min(10).max(5000),
  resolutionType: z.enum(["KEY_USER", "BTP", "ISV", "CUSTOM_ABAP", "NOT_POSSIBLE"]),
  resolutionDescription: z.string().min(10).max(5000),
  effortDays: z.number().min(0),
  recurringCostAnnual: z.number().min(0).default(0),
  riskLevel: z.enum(["low", "medium", "high"]),
  sapSupported: z.boolean(),
  upgradeSafe: z.boolean(),
  examples: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const body: unknown = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 },
    );
  }

  const pattern = await prisma.extensibilityPattern.create({
    data: parsed.data,
  });

  return NextResponse.json({ data: pattern }, { status: 201 });
}
