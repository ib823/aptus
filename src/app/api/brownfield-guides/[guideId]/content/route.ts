/**
 * Stream a BrownfieldGuide's binary content. Used for download links from
 * the guide detail page. Admin-only (mirrors the /admin layout role check
 * by re-checking the session).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

interface RouteParams {
  params: Promise<{ guideId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["platform_admin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { guideId } = await params;
  const guide = await prisma.brownfieldGuide.findUnique({
    where: { id: guideId },
    select: {
      id: true,
      title: true,
      sourceDocument: true,
      mimeType: true,
      content: true,
      blobUrl: true,
    },
  });
  if (!guide) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Inline stream from bytea
  if (guide.content) {
    const buf = Buffer.from(guide.content);
    const filenameSafe = guide.sourceDocument.replace(/[^a-zA-Z0-9._-]+/g, "_");
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": guide.mimeType,
        "Content-Length": String(buf.byteLength),
        "Content-Disposition": `inline; filename="${filenameSafe}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Vercel Blob redirect path
  if (guide.blobUrl) {
    return NextResponse.redirect(guide.blobUrl, 302);
  }

  return NextResponse.json({ error: "guide_has_no_content" }, { status: 404 });
}
