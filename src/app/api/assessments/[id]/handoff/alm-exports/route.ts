/** GET: List ALM export records */
/** POST: Create ALM export */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { Prisma } from "@prisma/client";
import { z } from "zod";


const createExportSchema = z.object({
  targetSystem: z.enum(["JIRA", "AZURE_DEVOPS", "SAP_SOLMAN", "CSV"]),
  exportConfig: z.record(z.string(), z.unknown()),
  exportMapping: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const exports = await prisma.almExportRecord.findMany({
    where: { assessmentId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: exports });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (isMfaRequired(user)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_REQUIRED, message: "MFA verification required" } },
      { status: 403 },
    );
  }

  const allowedRoles = ["platform_admin", "partner_lead", "consultant", "it_lead"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to create ALM exports" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = createExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  const exportRecord = await prisma.almExportRecord.create({
    data: {
      assessmentId: id,
      targetSystem: parsed.data.targetSystem,
      status: "PENDING",
      exportedById: user.id,
      exportConfig: parsed.data.exportConfig as Prisma.InputJsonValue,
      exportMapping: parsed.data.exportMapping ? (parsed.data.exportMapping as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  return NextResponse.json({ data: exportRecord }, { status: 201 });
}
