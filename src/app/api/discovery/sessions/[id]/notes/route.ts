/**
 * POST /api/discovery/sessions/[id]/notes — the consultant's own note capture.
 *
 * Consultant-authenticated. Mirrors /d/notes, which is the in-room facilitator
 * path; this is the console path. Both write; neither surface reads notes back
 * to a client, and only the workbench reads them at all.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { findClientProcess } from "@/lib/discovery/client-library";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const MAX_NOTE_LENGTH = 2000;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { body: note, processId } = body as Record<string, unknown>;
  if (typeof note !== "string" || note.trim().length === 0 || note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (processId !== undefined && processId !== null) {
    if (typeof processId !== "string" || !findClientProcess(processId)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
  }

  const engagement = await prisma.discoveryEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!engagement) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.discoveryNote.create({
    data: {
      engagementId: id,
      processId: typeof processId === "string" ? processId : null,
      body: note.trim(),
    },
  });
  return NextResponse.json({ ok: true });
}
