/** POST: Upload logo for report branding */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import type { UserRole } from "@/types/assessment";

const WRITE_ROLES: UserRole[] = ["partner_lead", "platform_admin", "client_admin"];
const MAX_FILE_SIZE = 512_000; // 500 KB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/svg+xml": "svg+xml",
};

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

  if (!hasRole(user, WRITE_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
    );
  }

  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id, deletedAt: null },
    select: { organizationId: true },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Assessment not found" } },
      { status: 404 },
    );
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("logo");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Missing 'logo' file field" } },
      { status: 400 },
    );
  }

  // Validate content type
  const mimeType = file.type;
  if (!ALLOWED_TYPES[mimeType]) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid file type. Allowed: PNG, JPEG, SVG" } },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "File too large. Maximum 500 KB" } },
      { status: 400 },
    );
  }

  // Convert to base64 data URI
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  // Upsert branding with logo
  await prisma.reportBranding.upsert({
    where: { organizationId: assessment.organizationId },
    create: {
      organizationId: assessment.organizationId,
      logoUrl: dataUri,
    },
    update: {
      logoUrl: dataUri,
    },
  });

  return NextResponse.json({ data: { logoUrl: dataUri } });
}
