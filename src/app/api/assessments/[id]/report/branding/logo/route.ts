/** POST: Upload logo for report branding */

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAssessmentAccess,
  isAssessmentAccessError,
} from "@/lib/auth/assessment-guard";
import { hasRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { sanitizeSvgContent } from "@/lib/security/sanitize";
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
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (isAssessmentAccessError(access)) {
    return access;
  }
  const { user, assessment } = access;

  if (!hasRole(user, WRITE_ROLES)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.FORBIDDEN, message: "Insufficient permissions" } },
      { status: 403 },
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

  // Validate content type. `file.type` is the client-supplied part header and is
  // spoofable, so it is only the first gate — the magic-byte / structural check
  // below is authoritative.
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

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // Authoritative content validation by inspecting the actual bytes, not the
  // claimed MIME. Raster formats are checked by magic number; SVG is XML text
  // that is a known XSS vector, so it is sanitized (scripts / event handlers /
  // external refs stripped) before being stored as a data URI.
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
  const JPEG_MAGIC = [0xff, 0xd8, 0xff];
  const startsWith = (magic: number[]) => magic.every((b, i) => bytes[i] === b);

  let dataUri: string;
  if (mimeType === "image/png") {
    if (!startsWith(PNG_MAGIC)) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "File content does not match a PNG image" } },
        { status: 400 },
      );
    }
    dataUri = `data:${mimeType};base64,${bytes.toString("base64")}`;
  } else if (mimeType === "image/jpeg") {
    if (!startsWith(JPEG_MAGIC)) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "File content does not match a JPEG image" } },
        { status: 400 },
      );
    }
    dataUri = `data:${mimeType};base64,${bytes.toString("base64")}`;
  } else {
    // image/svg+xml — sanitize the markup, then re-encode the cleaned SVG.
    const cleaned = sanitizeSvgContent(bytes.toString("utf-8"));
    if (!cleaned.includes("<svg")) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "File content does not match a valid SVG image" } },
        { status: 400 },
      );
    }
    dataUri = `data:image/svg+xml;base64,${Buffer.from(cleaned, "utf-8").toString("base64")}`;
  }

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
