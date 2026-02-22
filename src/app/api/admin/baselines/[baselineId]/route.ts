/** GET: Single baseline. PUT: Update. DELETE: Remove */

import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

export const preferredRegion = "sin1";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ baselineId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { baselineId } = await params;
  const baseline = await prisma.effortBaseline.findUnique({
    where: { id: baselineId },
  });

  if (!baseline) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Baseline not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: baseline });
}

const updateSchema = z.object({
  implementationDays: z.number().min(0).optional(),
  configDays: z.number().min(0).optional(),
  testDays: z.number().min(0).optional(),
  dataMigrationDays: z.number().min(0).optional(),
  trainingDays: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  source: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ baselineId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { baselineId } = await params;
  const existing = await prisma.effortBaseline.findUnique({
    where: { id: baselineId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Baseline not found" } },
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
  if (parsed.data.implementationDays !== undefined) updateData.implementationDays = parsed.data.implementationDays;
  if (parsed.data.configDays !== undefined) updateData.configDays = parsed.data.configDays;
  if (parsed.data.testDays !== undefined) updateData.testDays = parsed.data.testDays;
  if (parsed.data.dataMigrationDays !== undefined) updateData.dataMigrationDays = parsed.data.dataMigrationDays;
  if (parsed.data.trainingDays !== undefined) updateData.trainingDays = parsed.data.trainingDays;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.source !== undefined) updateData.source = parsed.data.source;
  if (parsed.data.confidence !== undefined) updateData.confidence = parsed.data.confidence;

  const baseline = await prisma.effortBaseline.update({
    where: { id: baselineId },
    data: updateData,
  });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ data: baseline });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ baselineId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const { baselineId } = await params;
  const existing = await prisma.effortBaseline.findUnique({
    where: { id: baselineId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Baseline not found" } },
      { status: 404 },
    );
  }

  await prisma.effortBaseline.delete({ where: { id: baselineId } });

  revalidateTag("intelligence", { expire: 0 });
  return NextResponse.json({ success: true });
}
