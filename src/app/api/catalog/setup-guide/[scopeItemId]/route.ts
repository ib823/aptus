/** GET: Serve Setup PDF for a scope item */

import { NextResponse, type NextRequest } from "next/server";
import { getDownloadUrl } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scopeItemId: string }> },
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

  const { scopeItemId } = await params;

  const guide = await prisma.setupGuide.findUnique({
    where: { scopeItemId },
    select: {
      blobUrl: true,
      pdfBlob: true,
      filename: true,
    },
  });

  if (!guide) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Setup guide not found" } },
      { status: 404 },
    );
  }

  // Prefer Vercel Blob (private store — generate signed temporary URL)
  if (guide.blobUrl) {
    const downloadUrl = await getDownloadUrl(guide.blobUrl);
    return NextResponse.redirect(downloadUrl);
  }

  // Fallback to DB blob during migration transition
  if (!guide.pdfBlob) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Setup guide not found" } },
      { status: 404 },
    );
  }

  return new NextResponse(guide.pdfBlob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${guide.filename}"`,
    },
  });
}
