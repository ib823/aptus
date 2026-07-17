/**
 * POST /api/discovery/gaps — persist gap-register working state.
 *
 * Consultant-only (authenticated workbench users). Upserts on the APQC code.
 * `owner` is the signed-in user — not a field we ask a consultant to type.
 *
 * The row's EXISTENCE is not the gap; the library is. A category stops being a
 * gap when the data says so (D14), not when someone edits this table.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { apqcCoverage } from "@/lib/discovery/workbench/library";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";

const STATUSES = new Set(["open", "sourcing", "drafting", "filled"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isNeutralDiscoveryEnabled()) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { apqcCode, title, fillSource, status, note } = body as Record<string, unknown>;

  if (typeof apqcCode !== "string" || typeof title !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // The code must be a real APQC category in the live data.
  if (!apqcCoverage().some((c) => c.code === apqcCode)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (status !== undefined && (typeof status !== "string" || !STATUSES.has(status))) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const existing = await prisma.discoveryGap.findFirst({ where: { apqcCode } });
  const data = {
    title,
    ...(typeof fillSource === "string" ? { fillSource: fillSource.trim() || null } : {}),
    ...(typeof status === "string" ? { status } : {}),
    ...(typeof note === "string" ? { note: note.trim() || null } : {}),
    ownedById: user.id,
  };

  if (existing) await prisma.discoveryGap.update({ where: { id: existing.id }, data });
  else await prisma.discoveryGap.create({ data: { apqcCode, ...data, title } });

  return NextResponse.json({ ok: true });
}
