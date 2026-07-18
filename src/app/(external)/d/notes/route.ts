/**
 * POST /d/notes — capture a facilitator note.
 *
 * ⚠ WRITE-ONLY FROM THE CLIENT SURFACE. This route accepts a note; there is
 * deliberately NO GET. Notes are consultant-visible only, and they surface in
 * PR-5's C8 console — never here. Adding a read endpoint on /d would hand the
 * client a way to fetch the facilitator's private red-lines, which is exactly
 * the leak this table's separateness exists to prevent.
 *
 * Sealed engagements refuse, like decisions: once a review is submitted, the
 * record is closed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { findClientProcess } from "@/lib/discovery/client-library";
import { verifySessionNonce } from "@/lib/discovery/external/csrf";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const MAX_NOTE_LENGTH = 2000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { processId, body: note, csrf } = body as Record<string, unknown>;

  if (typeof csrf !== "string" || !verifySessionNonce(ctx.session.id, csrf)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof note !== "string" || note.trim().length === 0 || note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // A note may be session-level (no process) but a named process must be real.
  if (processId !== undefined && processId !== null) {
    if (typeof processId !== "string" || !findClientProcess(processId)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
  }

  if (isSealed(ctx.engagement)) {
    return NextResponse.json({ error: "sealed" }, { status: 409 });
  }

  await prisma.discoveryNote.create({
    data: {
      engagementId: ctx.engagement.id,
      grantId: ctx.grant.id,
      processId: typeof processId === "string" ? processId : null,
      body: note.trim(),
    },
  });
  void touchGuestSession(ctx.session.id);

  // The response carries no note content back — write-only means write-only.
  return NextResponse.json({ ok: true });
}
