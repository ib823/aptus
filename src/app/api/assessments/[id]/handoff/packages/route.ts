/** GET: List handoff packages */
/** POST: Generate a handoff package */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const createPackageSchema = z.object({
  snapshotVersion: z.number().int().min(1),
  packageType: z.enum(["FULL", "SCOPE_ONLY", "TECHNICAL", "EXECUTIVE_SUMMARY"]).optional(),
  contents: z.array(z.string()).min(1, "At least one content item is required"),
});

export const preferredRegion = "sin1";

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
  const packages = await prisma.handoffPackage.findMany({
    where: { assessmentId: id },
    orderBy: { generatedAt: "desc" },
  });

  return NextResponse.json({ data: packages });
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

  const allowedRoles = ["platform_admin", "partner_lead", "consultant"];
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions to generate handoff packages" } },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body: unknown = await request.json();
  const parsed = createPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? "Validation failed" } },
      { status: 400 },
    );
  }

  // Verify snapshot exists
  const snapshot = await prisma.assessmentSnapshot.findUnique({
    where: {
      assessmentId_version: {
        assessmentId: id,
        version: parsed.data.snapshotVersion,
      },
    },
  });
  if (!snapshot) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Snapshot version not found" } },
      { status: 404 },
    );
  }

  const handoffPackage = await prisma.handoffPackage.create({
    data: {
      assessmentId: id,
      snapshotVersion: parsed.data.snapshotVersion,
      packageType: parsed.data.packageType ?? "FULL",
      contents: parsed.data.contents,
      generatedById: user.id,
    },
  });

  return NextResponse.json({ data: handoffPackage }, { status: 201 });
}
