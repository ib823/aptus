/** GET: List industry profiles. POST: Create industry profile */

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";
export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const profiles = await prisma.industryProfile.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: profiles });
}

const createSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, "Code must be lowercase alphanumeric with hyphens/underscores"),
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(5000),
  applicableScopeItems: z.array(z.string()).default([]),
  typicalScopeCount: z.number().int().min(0).default(0),
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

  // Check uniqueness
  const existing = await prisma.industryProfile.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: `Industry profile with code "${parsed.data.code}" already exists` } },
      { status: 409 },
    );
  }

  const profile = await prisma.industryProfile.create({
    data: parsed.data,
  });

  revalidateTag("intelligence");
  return NextResponse.json({ data: profile }, { status: 201 });
}
