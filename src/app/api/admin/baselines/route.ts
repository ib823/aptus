/** GET: List effort baselines. POST: Create effort baseline */

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const scopeItemId = request.nextUrl.searchParams.get("scopeItemId") ?? undefined;
  const where: Record<string, unknown> = {};
  if (scopeItemId) where.scopeItemId = scopeItemId;

  const baselines = await prisma.effortBaseline.findMany({
    where,
    orderBy: [{ scopeItemId: "asc" }, { complexity: "asc" }],
  });

  return NextResponse.json({ data: baselines });
}

const createSchema = z.object({
  scopeItemId: z.string().min(1),
  complexity: z.enum(["low", "medium", "high"]),
  implementationDays: z.number().min(0),
  configDays: z.number().min(0),
  testDays: z.number().min(0),
  dataMigrationDays: z.number().min(0),
  trainingDays: z.number().min(0),
  notes: z.string().max(5000).optional(),
  source: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1),
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
  const existing = await prisma.effortBaseline.findUnique({
    where: {
      scopeItemId_complexity: {
        scopeItemId: parsed.data.scopeItemId,
        complexity: parsed.data.complexity,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.CONFLICT, message: `Baseline for ${parsed.data.scopeItemId}/${parsed.data.complexity} already exists` } },
      { status: 409 },
    );
  }

  const baseline = await prisma.effortBaseline.create({
    data: {
      scopeItemId: parsed.data.scopeItemId,
      complexity: parsed.data.complexity,
      implementationDays: parsed.data.implementationDays,
      configDays: parsed.data.configDays,
      testDays: parsed.data.testDays,
      dataMigrationDays: parsed.data.dataMigrationDays,
      trainingDays: parsed.data.trainingDays,
      notes: parsed.data.notes ?? null,
      source: parsed.data.source ?? null,
      confidence: parsed.data.confidence,
    },
  });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ data: baseline }, { status: 201 });
}
