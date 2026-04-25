/** GET: Serve Setup PDF for a scope item */

import { NextResponse, type NextRequest } from "next/server";
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

  // Prefer Vercel Blob — proxy through the server so the private blob token
  // stays server-side. (getDownloadUrl from @vercel/blob only appends
  // ?download=1; it does NOT sign, so a redirect would land the browser on
  // an unauthenticated private URL → 403.)
  if (guide.blobUrl) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Blob storage not configured" } },
        { status: 500 },
      );
    }
    const upstream = await fetch(guide.blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.NOT_FOUND, message: `Blob fetch failed: ${upstream.status}` } },
        { status: 502 },
      );
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
        "Content-Disposition": `inline; filename="${guide.filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
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
