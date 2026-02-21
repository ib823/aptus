/** GET: List adaptation patterns. POST: Create pattern */

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const patterns = await prisma.adaptationPattern.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: patterns });
}

const createSchema = z.object({
  commonGap: z.string().min(10).max(5000),
  sapApproach: z.string().min(10).max(5000),
  adaptEffort: z.string().min(1).max(5000),
  extendEffort: z.string().min(1).max(5000),
  recommendation: z.enum(["ADAPT", "EXTEND"]),
  rationale: z.string().min(10).max(5000),
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

  const pattern = await prisma.adaptationPattern.create({
    data: parsed.data,
  });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ data: pattern }, { status: 201 });
}
